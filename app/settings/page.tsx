"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";

export default function SettingsPage() {
  const [health, setHealth] = useState<{
    provider: "api" | "claude-code" | "none";
    model: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
  }, []);

  return (
    <PageShell title="Settings">
      <div className="space-y-4">
        <SettingCard title="Anthropic connection">
          {health === null ? (
            <p className="animate-kiwi-pulse text-sm text-ink-soft">Checking…</p>
          ) : health.provider === "claude-code" ? (
            <p className="text-sm">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-kiwi-500" />
              Using your <strong>Claude Code login</strong> (subscription) — no API key needed.
              Manage it on the <a href="/connectors" className="text-kiwi-700 underline">Connectors</a> page.
            </p>
          ) : health.provider === "api" ? (
            <p className="text-sm">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-kiwi-500" />
              Using your <strong>ANTHROPIC_API_KEY</strong>. Remove it from{" "}
              <code className="rounded bg-stone-100 px-1">.env.local</code> to fall back to your
              Claude Code login instead.
            </p>
          ) : (
            <p className="text-sm">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-500" />
              Not connected — set it up on the{" "}
              <a href="/connectors" className="text-kiwi-700 underline">Connectors</a> page.
            </p>
          )}
        </SettingCard>

        <SettingCard title="Model">
          <p className="text-sm">
            Currently <code className="rounded bg-stone-100 px-1">{health?.model ?? "…"}</code>.
            Override with the <code className="rounded bg-stone-100 px-1">KIWI_MODEL</code>{" "}
            environment variable
            {health?.provider === "claude-code" &&
              " (otherwise Kiwi uses whatever model your Claude Code is set to)"}
            .
          </p>
        </SettingCard>

        <SettingCard title="Grading rigor">
          <p className="text-sm text-ink-soft">
            Free-text answers are graded{" "}
            <code className="rounded bg-stone-100 px-1">KIWI_GRADER_SAMPLES</code> times
            independently (default 3). When the samples disagree, the grade is flagged
            low-confidence instead of being presented as final. Lower it to 1 for cheaper, less
            calibrated grading.
          </p>
        </SettingCard>

        <SettingCard title="Your data">
          <p className="text-sm text-ink-soft">
            Everything — documents, outlines, cards, mastery, chat — lives in a local SQLite file
            at <code className="rounded bg-stone-100 px-1">data/kiwi.db</code>. Delete a notebook
            to remove all of its data; delete the file to reset the app. Source excerpts are sent
            to the Anthropic API during generation; nothing else leaves your machine.
          </p>
        </SettingCard>
      </div>
    </PageShell>
  );
}

function SettingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">{title}</h2>
      {children}
    </section>
  );
}
