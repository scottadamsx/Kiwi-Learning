"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";

interface UsageRow {
  task: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  avg_ms: number;
}

export default function SettingsPage() {
  const [health, setHealth] = useState<{
    provider: "api" | "claude-code" | "none";
    model: string;
  } | null>(null);
  const [usage, setUsage] = useState<{
    by_task: UsageRow[];
    totals: { calls: number; input_tokens: number; output_tokens: number; cost_usd: number | null };
  } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
    fetch("/api/usage")
      .then((r) => r.json())
      .then(setUsage)
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
              Not connected — paste your API key on the{" "}
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

        <SettingCard title="Model tiers">
          <p className="text-sm text-ink-soft">
            Kiwi routes each job to the right brain: <strong>plan</strong> (outline mapping,
            assignment tutoring — Fable on Claude Code), <strong>content</strong> (lessons,
            cards, quizzes), and <strong>fast</strong> (grading, chat — Sonnet). Override with{" "}
            <code className="rounded bg-stone-100 px-1">KIWI_MODEL_PLAN</code>,{" "}
            <code className="rounded bg-stone-100 px-1">KIWI_MODEL_CONTENT</code>,{" "}
            <code className="rounded bg-stone-100 px-1">KIWI_MODEL_FAST</code>.
          </p>
        </SettingCard>

        <SettingCard title="Engine usage">
          {usage === null ? (
            <p className="animate-kiwi-pulse text-sm text-ink-soft">Loading…</p>
          ) : usage.totals.calls === 0 ? (
            <p className="text-sm text-ink-soft">No generation calls logged yet.</p>
          ) : (
            <div className="text-sm">
              <p className="mb-2 text-ink-soft">
                {usage.totals.calls} calls ·{" "}
                {((usage.totals.input_tokens + usage.totals.output_tokens) / 1000).toFixed(0)}k
                tokens total
                {usage.totals.cost_usd ? ` · ~$${usage.totals.cost_usd.toFixed(2)}` : ""}
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th className="py-1 pr-2 font-semibold">Task</th>
                    <th className="py-1 pr-2 font-semibold">Calls</th>
                    <th className="py-1 pr-2 font-semibold">In</th>
                    <th className="py-1 pr-2 font-semibold">Out</th>
                    <th className="py-1 font-semibold">Avg time</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.by_task.map((r) => (
                    <tr key={r.task} className="border-t border-line">
                      <td className="py-1 pr-2 font-medium">{r.task}</td>
                      <td className="py-1 pr-2 tabular-nums">{r.calls}</td>
                      <td className="py-1 pr-2 tabular-nums">{(r.input_tokens / 1000).toFixed(1)}k</td>
                      <td className="py-1 pr-2 tabular-nums">{(r.output_tokens / 1000).toFixed(1)}k</td>
                      <td className="py-1 tabular-nums">{(r.avg_ms / 1000).toFixed(1)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SettingCard>

        <SettingCard title="Grading rigor">
          <p className="text-sm text-ink-soft">
            Free-text answers are graded adaptively: one grading pass first; decisive scores
            stand alone, borderline scores get up to{" "}
            <code className="rounded bg-stone-100 px-1">KIWI_GRADER_SAMPLES</code> (default 3)
            independent opinions, and disagreement is flagged as a low-confidence grade instead
            of being presented as final. Set it to 1 for single-pass grading.
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
