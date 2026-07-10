import Anthropic from "@anthropic-ai/sdk";
import { execFile, execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// LLM provider layer. Two ways to run Kiwi, checked in order:
//   1. "api"          — ANTHROPIC_API_KEY / auth token / `ant` profile → direct SDK calls.
//   2. "claude-code"  — no key, but the `claude` CLI is installed → headless
//                       `claude -p` calls that ride the user's Claude Code
//                       subscription login. No API key needed.
// KIWI_PROVIDER=api|claude-code forces one.

export type Provider = "api" | "claude-code" | "none";

declare global {
  // eslint-disable-next-line no-var
  var __kiwiAnthropic: Anthropic | undefined;
}

export function getClient(): Anthropic {
  if (!globalThis.__kiwiAnthropic) globalThis.__kiwiAnthropic = new Anthropic();
  return globalThis.__kiwiAnthropic;
}

// Model: API path defaults to Opus 4.8. CLI path omits --model unless
// KIWI_MODEL is set, so it uses whatever the user's Claude Code is set to.
export const MODEL = process.env.KIWI_MODEL || "claude-opus-4-8";
const CLI_MODEL = process.env.KIWI_MODEL || null;

export function apiCredsAvailable(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  try {
    return fs.existsSync(path.join(os.homedir(), ".config", "anthropic", "credentials"));
  } catch {
    return false;
  }
}

let cliPathCache: string | null | undefined;
export function claudeCliPath(): string | null {
  if (cliPathCache !== undefined) return cliPathCache;
  try {
    const found = execSync("which claude", { encoding: "utf-8" }).trim();
    if (found) {
      cliPathCache = found;
      return found;
    }
  } catch {
    // fall through to common install locations (server may lack shell PATH)
  }
  for (const p of [
    path.join(os.homedir(), ".local", "bin", "claude"),
    path.join(os.homedir(), ".claude", "local", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ]) {
    if (fs.existsSync(p)) {
      cliPathCache = p;
      return p;
    }
  }
  cliPathCache = null;
  return null;
}

export function provider(): Provider {
  const forced = process.env.KIWI_PROVIDER;
  if (forced === "api") return apiCredsAvailable() ? "api" : "none";
  if (forced === "claude-code") return claudeCliPath() ? "claude-code" : "none";
  if (apiCredsAvailable()) return "api";
  if (claudeCliPath()) return "claude-code";
  return "none";
}

// ---------------------------------------------------------------------------
// Claude Code CLI backend: headless single-shot generation on the user's
// subscription. Prompt goes over stdin (can be hundreds of KB); the small
// system prompt rides as a flag.

function runClaudeCli(opts: { system?: string; prompt: string }): Promise<string> {
  const cli = claudeCliPath();
  if (!cli) {
    return Promise.reject(
      new Error("Claude Code CLI not found. Install it or add an ANTHROPIC_API_KEY.")
    );
  }
  const args = ["-p", "--output-format", "json", "--max-turns", "1"];
  if (opts.system) args.push("--append-system-prompt", opts.system);
  if (CLI_MODEL) args.push("--model", CLI_MODEL);

  return new Promise((resolve, reject) => {
    const child = execFile(
      cli,
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout: 900_000 },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          const msg = (stderr || err.message).slice(0, 500);
          if (/log ?in|authenticat|credential|api key/i.test(msg)) {
            reject(
              new Error(
                "Claude Code isn't logged in. Open a terminal, run `claude`, and use /login — then try again."
              )
            );
          } else {
            reject(new Error(`Claude Code call failed: ${msg}`));
          }
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.is_error || parsed.subtype !== "success") {
            const msg: string = parsed.result || parsed.error || "unknown error";
            if (/log ?in|authenticat|credential|api key/i.test(msg)) {
              reject(
                new Error(
                  "Claude Code isn't logged in. Open a terminal, run `claude`, and use /login — then try again."
                )
              );
            } else {
              reject(new Error(`Claude Code returned an error: ${String(msg).slice(0, 400)}`));
            }
            return;
          }
          resolve(String(parsed.result ?? ""));
        } catch {
          reject(new Error(`Couldn't parse Claude Code output: ${stdout.slice(0, 200)}`));
        }
      }
    );
    child.stdin?.write(opts.prompt);
    child.stdin?.end();
  });
}

/** Pull the first JSON object out of a possibly-fenced, possibly-chatty reply. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model reply contained no JSON object");
  return body.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// Public generation API — same signatures regardless of provider.

export async function generateJson<T>(opts: {
  system?: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<T> {
  const p = provider();
  if (p === "none") throw noProviderError();

  if (p === "claude-code") {
    const raw = await runClaudeCli({
      system: opts.system,
      prompt: `${opts.prompt}

Respond with ONLY a single valid JSON object that conforms to this JSON Schema — no prose before or after, no markdown fences:
${JSON.stringify(opts.schema)}`,
    });
    return JSON.parse(extractJson(raw)) as T;
  }

  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: opts.system } : {}),
    output_config: {
      format: { type: "json_schema", schema: opts.schema },
      ...(opts.effort ? { effort: opts.effort } : {}),
    },
    messages: [{ role: "user", content: opts.prompt }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this request (safety refusal).");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Generation hit the output-token limit; try smaller inputs.");
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty model response");
  return JSON.parse(text) as T;
}

export async function generateText(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<string> {
  const p = provider();
  if (p === "none") throw noProviderError();

  if (p === "claude-code") {
    return runClaudeCli({ system: opts.system, prompt: opts.prompt });
  }

  const client = getClient();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
    messages: [{ role: "user", content: opts.prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error("The model declined this request (safety refusal).");
  }
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function noProviderError(): Error {
  return new Error(
    "No way to reach Claude. Either log into Claude Code (run `claude`, then /login) or add an ANTHROPIC_API_KEY in .env.local."
  );
}

/** Quick end-to-end check of whichever provider is active. */
export async function testConnection(): Promise<{ ok: boolean; provider: Provider; error?: string }> {
  const p = provider();
  if (p === "none") return { ok: false, provider: p, error: noProviderError().message };
  try {
    if (p === "claude-code") {
      await runClaudeCli({ prompt: "Reply with exactly: OK" });
    } else {
      await getClient().messages.create({
        model: MODEL,
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      });
    }
    return { ok: true, provider: p };
  } catch (err) {
    return { ok: false, provider: p, error: err instanceof Error ? err.message : String(err) };
  }
}
