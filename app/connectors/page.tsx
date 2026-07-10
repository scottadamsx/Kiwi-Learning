"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";

interface VaultStatus {
  connected: boolean;
  path?: string;
  file_count?: number;
}

export default function ConnectorsPage() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/settings/vault")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  async function connect() {
    if (!path.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
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

  async function disconnect() {
    await fetch("/api/settings/vault", { method: "DELETE" });
    load();
  }

  return (
    <PageShell title="Connectors">
      <p className="mb-6 text-sm text-ink-soft">
        Connectors let Kiwi understand more about <em>you</em>, so generated content meets you
        where you are.
      </p>

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
            <div className="flex gap-2">
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connect()}
                placeholder="/Users/you/Documents/MyVault"
                className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-kiwi-400 focus:ring-2 focus:ring-kiwi-100"
              />
              <button
                onClick={connect}
                disabled={busy || !path.trim()}
                className="rounded-xl bg-kiwi-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-40"
              >
                {busy ? "Connecting…" : "Connect"}
              </button>
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
