"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";

interface VaultStatus {
  connected: boolean;
  path?: string;
  file_count?: number;
}

interface Health {
  provider: "api" | "claude-code" | "none";
  api_key: boolean;
  claude_cli: boolean;
  can_login: boolean;
  serverless: boolean;
  model: string;
}

function AnthropicCard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () =>
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});

  useEffect(() => {
    refresh();
  }, []);

  async function saveKey() {
    if (!apiKey.trim() || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/anthropic/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Couldn't save that key" });
        return;
      }
      setApiKey("");
      setMsg({ ok: true, text: "Connected — you're all set. 🥝" });
      refresh();
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    await fetch("/api/settings/anthropic/key", { method: "DELETE" });
    setMsg(null);
    refresh();
  }

  async function test() {
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/anthropic/test", { method: "POST" });
      const data = await res.json();
      setMsg(data.ok ? { ok: true, text: "✓ Working" } : { ok: false, text: data.error });
    } catch {
      setMsg({ ok: false, text: "Test request failed" });
    } finally {
      setTesting(false);
    }
  }

  async function loginWithClaudeCode() {
    setLoggingIn(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/anthropic/login", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error });
        return;
      }
      setMsg({
        ok: true,
        text: "Opened Terminal — finish signing in there, then hit Test connection.",
      });
    } catch {
      setMsg({ ok: false, text: "Couldn't open a terminal here." });
    } finally {
      setLoggingIn(false);
    }
  }

  const connected = health && health.provider !== "none";

  return (
    <section className="mb-4 rounded-2xl border border-line bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">✳️ Anthropic account</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Powers all generation, grading, and chat. Paste your API key below to connect —
            that&apos;s it.
          </p>
        </div>
        {health && (
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              connected ? "bg-kiwi-100 text-kiwi-700" : "bg-red-100 text-red-700"
            }`}
          >
            {health.provider === "claude-code"
              ? "Connected via Claude Code"
              : health.provider === "api"
                ? "Connected"
                : "Not connected"}
          </span>
        )}
      </div>

      <div className="mt-4 text-sm">
        {health === null ? (
          <p className="animate-kiwi-pulse text-ink-soft">Checking…</p>
        ) : connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-ink-soft">
              Model: <code className="rounded bg-stone-100 px-1">{health.model}</code>
            </span>
            <button
              onClick={test}
              disabled={testing}
              className="rounded-lg border border-line px-3 py-1 text-xs font-semibold hover:border-kiwi-300 disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
            {health.provider === "api" && (
              <button
                onClick={disconnect}
                className="rounded-lg border border-line px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Disconnect
              </button>
            )}
            {msg && (
              <span className={`text-xs ${msg.ok ? "text-kiwi-700" : "text-red-600"}`}>
                {msg.text}
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Primary: paste a key. No terminal. */}
            <div>
              <label className="text-xs font-semibold text-ink-soft">Anthropic API key</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveKey()}
                  placeholder="sk-ant-…"
                  className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 font-mono text-sm outline-none focus:border-kiwi-400 focus:ring-2 focus:ring-kiwi-100"
                />
                <button
                  onClick={saveKey}
                  disabled={saving || !apiKey.trim()}
                  className="rounded-xl bg-kiwi-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-40"
                >
                  {saving ? "Connecting…" : "Connect"}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-ink-soft">
                Get a key at{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-kiwi-700 underline"
                >
                  console.anthropic.com
                </a>
                . Stored only on this machine.
              </p>
            </div>

            {/* Secondary, local only: sign in with a Claude Code subscription. */}
            {health.can_login && (
              <div className="border-t border-line pt-3">
                <p className="mb-2 text-xs text-ink-soft">
                  Have a Claude subscription instead of an API key?
                </p>
                <button
                  onClick={loginWithClaudeCode}
                  disabled={loggingIn}
                  className="rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:border-kiwi-300 disabled:opacity-50"
                >
                  {loggingIn ? "Opening…" : "Log in with Claude Code"}
                </button>
                <button
                  onClick={test}
                  disabled={testing}
                  className="ml-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink-soft hover:border-kiwi-300 disabled:opacity-50"
                >
                  {testing ? "Testing…" : "Test connection"}
                </button>
              </div>
            )}

            {health.serverless && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                This is a cloud deployment, so the Claude Code subscription option isn&apos;t
                available here — paste an API key above (or set{" "}
                <code className="rounded bg-amber-100 px-1">ANTHROPIC_API_KEY</code> in your Vercel
                environment variables).
              </p>
            )}

            {msg && (
              <p className={`text-xs ${msg.ok ? "text-kiwi-700" : "text-red-600"}`}>{msg.text}</p>
            )}
          </div>
        )}
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
