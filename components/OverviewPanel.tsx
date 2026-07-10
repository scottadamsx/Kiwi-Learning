"use client";

import type { Readiness } from "@/lib/types";
import type { NotebookDetail, Tab } from "./Workspace";
import { ReadinessRing } from "./Workspace";

export default function OverviewPanel({
  detail,
  readiness,
  onNavigate,
}: {
  detail: NotebookDetail;
  readiness: Readiness | null;
  onNavigate: (tab: Tab) => void;
}) {
  const hasOutline = detail.sections.length > 0;

  if (!hasOutline) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        {detail.notebook.status === "processing" ? (
          <span className="animate-kiwi-pulse text-kiwi-700">
            {detail.notebook.status_message ?? "Building your study set…"}
          </span>
        ) : (
          <>
            Upload your material in{" "}
            <button className="font-semibold text-kiwi-700 underline" onClick={() => onNavigate("Sources")}>
              Sources
            </button>{" "}
            and build the study set to see your readiness here.
          </>
        )}
      </div>
    );
  }

  const overall = readiness?.overall ?? 0;
  const weakest = (readiness?.modules ?? [])
    .flatMap((m) => m.sections)
    .sort((a, b) => a.effective - b.effective)
    .slice(0, 3);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-white p-6 text-center">
          <div className="mx-auto w-fit">
            <ReadinessRing value={overall} size={120} />
          </div>
          <div className="-mt-[78px] mb-[38px] font-display text-3xl font-semibold">
            {Math.round(overall * 100)}%
          </div>
          <p className="text-sm font-medium">Exam readiness</p>
          <p className="mt-1 text-xs text-ink-soft">
            Your practice suggests you&apos;re about here. It rises as you master sections and
            drifts down as memory fades — that&apos;s the honest part.
          </p>
        </div>

        <div className="space-y-2">
          <ActionButton
            label={
              (readiness?.due_cards ?? 0) > 0
                ? `Review ${readiness!.due_cards} due card${readiness!.due_cards === 1 ? "" : "s"}`
                : "Review flashcards"
            }
            hint="Spaced repetition (FSRS)"
            onClick={() => onNavigate("Review")}
          />
          <ActionButton
            label="Take an adaptive quiz"
            hint="Targets your weakest sections"
            onClick={() => onNavigate("Quiz")}
          />
          <ActionButton
            label="Ask your sources"
            hint="Grounded chat with citations"
            onClick={() => onNavigate("Chat")}
          />
        </div>
      </div>

      <div className="space-y-5">
        {(readiness?.modules ?? []).map((m) => (
          <div key={m.module_id} className="rounded-2xl border border-line bg-white p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-display text-lg font-semibold">{m.name}</h3>
              <span className="text-sm font-semibold text-ink-soft">
                {Math.round(m.readiness * 100)}%
              </span>
            </div>
            <div className="space-y-2">
              {m.sections.map((s) => (
                <div key={s.section_id} className="flex items-center gap-3">
                  <span className="w-1/3 truncate text-sm" title={s.name}>
                    {s.name}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#eceae4]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(2, s.effective * 100)}%`,
                        background: `hsl(${8 + s.effective * 100} 65% 45%)`,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs tabular-nums text-ink-soft">
                    {Math.round(s.effective * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {weakest.length > 0 && (
          <div className="rounded-2xl border border-kiwi-200 bg-kiwi-50 p-5">
            <h3 className="text-sm font-semibold text-kiwi-800">What&apos;s dragging you down</h3>
            <ul className="mt-2 space-y-1 text-sm text-kiwi-900">
              {weakest.map((s) => (
                <li key={s.section_id}>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-kiwi-700">
                    {" "}
                    — {Math.round(s.effective * 100)}% (mastery {Math.round(s.mastery * 100)}% ×
                    recall {Math.round(s.retrievability * 100)}%)
                  </span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => onNavigate("Quiz")}
              className="mt-3 rounded-lg bg-kiwi-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-kiwi-700"
            >
              Practice these now →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-xl border border-line bg-white p-4 text-left transition hover:border-kiwi-300 hover:shadow-sm"
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="block text-xs text-ink-soft">{hint}</span>
    </button>
  );
}
