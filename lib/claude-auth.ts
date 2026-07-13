import { execFile, spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { claudeCliPath } from "./anthropic";

// Claude subscription login, driven entirely from Kiwi's UI — no terminal.
//
// `claude auth login --claudeai` prints an OAuth URL and then waits on stdin
// for the code the browser hands back. We spawn it, surface the URL in the UI,
// keep the process alive between requests, and pipe the pasted code into it.

export interface AuthStatus {
  loggedIn: boolean;
  email?: string;
  subscriptionType?: string; // "max", "pro", …
  authMethod?: string;
  orgName?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __kiwiLoginProc: ChildProcessWithoutNullStreams | undefined;
  // eslint-disable-next-line no-var
  var __kiwiAuthCache: { at: number; status: AuthStatus } | undefined;
}

const CACHE_MS = 15_000;

function cli(): string {
  const p = claudeCliPath();
  if (!p) throw new Error("Claude Code isn't installed on this machine.");
  return p;
}

/** `claude auth status` → JSON. Cached briefly; it spawns a process. */
export function authStatus(force = false): Promise<AuthStatus> {
  const cached = globalThis.__kiwiAuthCache;
  if (!force && cached && Date.now() - cached.at < CACHE_MS) {
    return Promise.resolve(cached.status);
  }
  return new Promise((resolve) => {
    let bin: string;
    try {
      bin = cli();
    } catch {
      resolve({ loggedIn: false });
      return;
    }
    execFile(bin, ["auth", "status"], { timeout: 20_000 }, (err, stdout) => {
      let status: AuthStatus = { loggedIn: false };
      try {
        const parsed = JSON.parse(stdout);
        status = {
          loggedIn: !!parsed.loggedIn,
          email: parsed.email,
          subscriptionType: parsed.subscriptionType,
          authMethod: parsed.authMethod,
          orgName: parsed.orgName,
        };
      } catch {
        // not logged in / unparseable — leave as loggedIn: false
      }
      globalThis.__kiwiAuthCache = { at: Date.now(), status };
      resolve(status);
    });
  });
}

export function invalidateAuthCache() {
  globalThis.__kiwiAuthCache = undefined;
}

function killPending() {
  try {
    globalThis.__kiwiLoginProc?.kill("SIGKILL");
  } catch {
    // already gone
  }
  globalThis.__kiwiLoginProc = undefined;
}

/**
 * Start the subscription login. Returns the OAuth URL to send the user to.
 * The process stays alive waiting for the code (see submitLoginCode).
 */
export function startLogin(): Promise<{ url: string }> {
  killPending(); // never leave two login flows racing

  return new Promise((resolve, reject) => {
    let bin: string;
    try {
      bin = cli();
    } catch (err) {
      reject(err);
      return;
    }

    const proc = spawn(bin, ["auth", "login", "--claudeai"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    globalThis.__kiwiLoginProc = proc;

    let buffer = "";
    let settled = false;

    const scan = (chunk: string) => {
      buffer += chunk;
      const match = buffer.match(/https:\/\/claude\.com\/[^\s]+/);
      if (match && !settled) {
        settled = true;
        resolve({ url: match[0] });
      }
    };

    proc.stdout.on("data", (d) => scan(String(d)));
    proc.stderr.on("data", (d) => scan(String(d)));

    proc.on("error", (err) => {
      if (!settled) {
        settled = true;
        killPending();
        reject(err);
      }
    });

    // If the CLI exits before printing a URL, something's wrong.
    proc.on("exit", () => {
      if (!settled) {
        settled = true;
        globalThis.__kiwiLoginProc = undefined;
        reject(new Error(buffer.trim().slice(0, 300) || "Login failed to start."));
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        killPending();
        reject(new Error("Timed out waiting for the sign-in link."));
      }
    }, 30_000);
  });
}

/** Feed the code from the browser into the waiting login process. */
export function submitLoginCode(code: string): Promise<AuthStatus> {
  const proc = globalThis.__kiwiLoginProc;
  if (!proc) {
    return Promise.reject(
      new Error("That sign-in attempt expired. Hit “Sign in with Claude” again.")
    );
  }

  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (d: Buffer) => (output += String(d));
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    proc.once("exit", async () => {
      globalThis.__kiwiLoginProc = undefined;
      invalidateAuthCache();
      const status = await authStatus(true);
      if (status.loggedIn) resolve(status);
      else
        reject(
          new Error(
            output.match(/error[^\n]*/i)?.[0] ??
              "That code didn't work. Try signing in again."
          )
        );
    });

    proc.stdin.write(code.trim() + "\n");

    setTimeout(() => {
      if (globalThis.__kiwiLoginProc === proc) {
        killPending();
        reject(new Error("Sign-in timed out."));
      }
    }, 60_000);
  });
}

export function logout(): Promise<void> {
  killPending();
  return new Promise((resolve, reject) => {
    let bin: string;
    try {
      bin = cli();
    } catch (err) {
      reject(err);
      return;
    }
    execFile(bin, ["auth", "logout"], { timeout: 20_000 }, (err) => {
      invalidateAuthCache();
      if (err) reject(new Error("Couldn't sign out."));
      else resolve();
    });
  });
}
