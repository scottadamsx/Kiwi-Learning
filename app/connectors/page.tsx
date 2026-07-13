"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";

interface VaultStatus {
  connected: boolean;
  path?: string;
  file_count?: number;
}

interface Auth {
  installed: boolean;
  serverless: boolean;
  loggedIn: boolean;
  email?: string;
  subscriptionType?: string;
  orgName?: string;
}

function AnthropicCard() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [starting, setStarting] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    fetch("/api/auth")
      .then((r) => r.json())
      .then(setAuth)
      .catch(() => {});

  useEffect(() => {
    refresh();
  }, []);

  // Step 1 — start the login and get the Claude sign-in link.
  async function signIn() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't start sign-in");
        return;
      }
      setUrl(data.url);
      window.open(data.url, "_blank", "noopener");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setStarting(false);
    }
  }

  // Step 2 — hand the code from the browser back to Claude.
  async function finish() {
    if (!code.trim() || finishing) return;
    setFinishing(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That code didn't work");
        return;
      }
      setUrl(null);
      setCode("");
      refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setFinishing(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    setUrl(null);
    setCode("");
    refresh();
  }

  return (
    <section className="mb-4 rounded-2xl border border-line bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">✳️ Claude account</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Kiwi runs on your <strong>Claude subscription</strong> — sign in once and everything
            (lessons, grading, quizzes, chat, your tutor) just works. No API key, ever.
          </p>
        </div>
        {auth && (
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              auth.loggedIn ? "bg-kiwi-100 text-kiwi-700" : "bg-red-100 text-red-700"
            }`}
          >
            {auth.loggedIn ? "Signed in" : "Not signed in"}
          </span>
        )}
      </div>

      <div className="mt-4 text-sm">
        {auth === null ? (
          <p className="animate-kiwi-pulse text-ink-soft">Checking…</p>
        ) : auth.loggedIn ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-kiwi-500" />
              <strong>{auth.email}</strong>
              {auth.subscriptionType && (
                <span className="rounded-full bg-kiwi-100 px-2 py-0.5 text-xs font-semibold uppercase text-kiwi-700">
                  {auth.subscriptionType}
                </span>
              )}
            </span>
            <button
              onClick={signOut}
              className="ml-auto rounded-lg border border-line px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </div>
        ) : !auth.installed ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            {auth.serverless
              ? "This is a cloud deployment, so it can't use a Claude subscription. Run Kiwi on your own machine to sign in."
              : "Claude Code isn't installed on this machine, so Kiwi can't sign you in yet."}
          </p>
        ) : !url ? (
          <div>
            <button
              onClick={signIn}
              disabled={starting}
              className="rounded-xl bg-kiwi-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-50"
            >
              {starting ? "Opening Claude…" : "Sign in with Claude"}
            </button>
            <p className="mt-2 text-xs text-ink-soft">
              Opens Claude in a new tab. Approve access, then paste the code it gives you back
              here.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-kiwi-200 bg-kiwi-50 p-4">
            <p className="text-sm font-semibold text-kiwi-800">Almost there</p>
            <ol className="mt-1 list-decimal pl-5 text-sm text-kiwi-900">
              <li>
                Approve access in the Claude tab that opened (
                <a href={url} target="_blank" rel="noreferrer" className="underline">
                  reopen it
                </a>
                )
              </li>
              <li>Copy the code Claude shows you and paste it below</li>
            </ol>
            <div className="mt-3 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && finish()}
                placeholder="Paste your code here"
                autoFocus
                className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 font-mono text-sm outline-none focus:border-kiwi-400 focus:ring-2 focus:ring-kiwi-100"
              />
              <button
                onClick={finish}
                disabled={finishing || !code.trim()}
                className="rounded-xl bg-kiwi-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-40"
              >
                {finishing ? "Signing in…" : "Finish"}
              </button>
            </div>
            <button
              onClick={() => {
                setUrl(null);
                setCode("");
                setError(null);
              }}
              className="mt-2 text-xs text-ink-soft underline"
            >
              Cancel
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}

export default function ConnectorsPage() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  const load = () =>
    fetch("/api/settings/vault")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  async function connect(chosenPath?: string) {
    const target = (chosenPath ?? path).trim();
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: target }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't connect");
      return;
    }
    setPath("");
    setStatus(data);
  }

  async function browse() {
    if (browsing) return;
    setBrowsing(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/vault/browse", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Folder picker unavailable — type the path instead.");
        return;
      }
      if (data.canceled) return;
      if (data.path) {
        setPath(data.path);
        await connect(data.path);
      }
    } catch {
      setError("Folder picker failed — type the path instead.");
    } finally {
      setBrowsing(false);
    }
  }

  async function disconnect() {
    await fetch("/api/settings/vault", { method: "DELETE" });
    load();
  }

  return (
    <PageShell title="Connectors">
      <p className="mb-6 text-sm text-ink-soft">
        Connectors hook Kiwi up to the outside world — your Anthropic account for the engine, and
        your own knowledge for personalization.
      </p>

      <AnthropicCard />

      <section className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">🗂 Obsidian vault (or any notes folder)</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Point Kiwi at your vault and lessons get personal: when writing a lesson, Kiwi
              searches your own notes on related topics, connects new ideas to what you&apos;ve
              already written, skims past what you clearly know, and gently corrects anything your
              notes get wrong. Read-only — Kiwi never writes to your vault.
            </p>
          </div>
          {status?.connected && (
            <span className="shrink-0 rounded-full bg-kiwi-100 px-3 py-1 text-xs font-semibold text-kiwi-700">
              Connected
            </span>
          )}
        </div>

        <div className="mt-5">
          {status?.connected ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <code className="rounded-lg bg-stone-100 px-2 py-1">{status.path}</code>
              <span className="text-ink-soft">{status.file_count} notes indexed</span>
              <button
                onClick={disconnect}
                className="rounded-lg border border-line px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={browse}
                disabled={browsing || busy}
                className="w-full rounded-xl border-2 border-dashed border-line bg-stone-50 px-4 py-5 text-sm font-semibold text-ink transition hover:border-kiwi-400 hover:bg-kiwi-50 disabled:opacity-50"
              >
                {browsing ? (
                  <span className="animate-kiwi-pulse">
                    Finder is open — pick your vault folder…
                  </span>
                ) : busy ? (
                  <span className="animate-kiwi-pulse">Connecting…</span>
                ) : (
                  <>📁 Choose folder…</>
                )}
              </button>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-ink-soft">or type a path:</span>
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && connect()}
                  placeholder="/Users/you/Documents/MyVault"
                  className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-kiwi-400 focus:ring-2 focus:ring-kiwi-100"
                />
                <button
                  onClick={() => connect()}
                  disabled={busy || browsing || !path.trim()}
                  className="rounded-xl bg-kiwi-600 px-4 py-2 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-40"
                >
                  Connect
                </button>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-dashed border-line p-6 text-sm text-ink-soft">
        <h2 className="font-semibold text-ink">Coming next</h2>
        <p className="mt-1">
          Google Drive folders, Notion pages, and web URLs as notebook sources — same grounding
          discipline, more places to pull from.
        </p>
      </section>
    </PageShell>
  );
}
