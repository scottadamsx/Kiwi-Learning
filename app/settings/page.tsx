"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";

export default function SettingsPage() {
  const [health, setHealth] = useState<{ has_credentials: boolean; model: string } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
  }, []);

  return (
    <PageShell title="Settings">
      <div className="space-y-4">
        <SettingCard title="Anthropic API">
          {health === null ? (
            <p className="animate-kiwi-pulse text-sm text-ink-soft">Checking…</p>
          ) : health.has_credentials ? (
            <p className="text-sm">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-kiwi-500" />
              Credentials found. All generation, grading, and chat features are live.
            </p>
          ) : (
            <div className="text-sm">
              <p>
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-500" />
                No credentials found.
              </p>
              <p className="mt-2 text-ink-soft">
                Copy <code className="rounded bg-stone-100 px-1">.env.local.example</code> to{" "}
                <code className="rounded bg-stone-100 px-1">.env.local</code>, add your{" "}
                <code className="rounded bg-stone-100 px-1">ANTHROPIC_API_KEY</code> (from
                platform.claude.com), and restart the server.
              </p>
            </div>
          )}
        </SettingCard>

        <SettingCard title="Model">
          <p className="text-sm">
            Currently <code className="rounded bg-stone-100 px-1">{health?.model ?? "…"}</code>.
            Override with the <code className="rounded bg-stone-100 px-1">KIWI_MODEL</code>{" "}
            environment variable.
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
