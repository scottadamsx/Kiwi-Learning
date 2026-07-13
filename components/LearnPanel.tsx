"use client";

import { useEffect, useState } from "react";
import type { Readiness, Section } from "@/lib/types";
import type { NotebookDetail } from "./Workspace";
import Markdown from "./Markdown";
import KiwiGame from "./KiwiGame";

const IMPORTANCE_LABEL: Record<number, string> = { 3: "Critical", 2: "Core", 1: "Minor" };

export default function LearnPanel({
  detail,
  readiness,
  onChanged,
}: {
  detail: NotebookDetail;
  readiness: Readiness | null;
  onChanged: () => void;
}) {
  const [openSection, setOpenSection] = useState<Section | null>(null);

  async function setExcluded(section: Section, excluded: boolean) {
    await fetch(`/api/notebooks/${detail.notebook.id}/exclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "section", ref_id: section.id, undo: !excluded }),
    });
    onChanged();
  }

  if (detail.sections.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        Build the study set from the Sources tab first.
      </p>
    );
  }

  if (openSection) {
    return (
      <LessonView
        notebookId={detail.notebook.id}
        section={openSection}
        onBack={() => setOpenSection(null)}
        onMasteryChange={onChanged}
      />
    );
  }

  const effectiveBySection = new Map(
    (readiness?.modules ?? []).flatMap((m) => m.sections).map((s) => [s.section_id, s.effective])
  );
  const prereqNames = (sectionId: string) =>
    detail.edges
      .filter((e) => e.to_section === sectionId)
      .map((e) => detail.sections.find((s) => s.id === e.from_section)?.name)
      .filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      {detail.modules.map((m, mi) => (
        <div key={m.id}>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-kiwi-600">
              Module {mi + 1}
            </span>
            <h2 className="font-display text-xl font-semibold">{m.name}</h2>
          </div>
          {m.description && <p className="mb-3 text-sm text-ink-soft">{m.description}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {detail.sections
              .filter((s) => s.module_id === m.id && !s.excluded)
              .map((s) => {
                const eff = effectiveBySection.get(s.id) ?? 0;
                const prereqs = prereqNames(s.id);
                const hasLesson = detail.lesson_section_ids.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => setOpenSection(s)}
                    role="button"
                    className="group relative cursor-pointer rounded-xl border border-line bg-white p-4 text-left transition hover:border-kiwi-300 hover:shadow-sm"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExcluded(s, true);
                      }}
                      title="Not part of my course — removes it from readiness, review, and quizzes (stays out after rebuilds)"
                      className="absolute -right-2 -top-2 hidden rounded-full border border-line bg-white px-1.5 py-0.5 text-[10px] text-ink-soft shadow-sm hover:border-red-300 hover:text-red-600 group-hover:block"
                    >
                      🚫
                    </button>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold">{s.name}</h3>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          s.importance === 3
                            ? "bg-red-50 text-red-700"
                            : s.importance === 2
                              ? "bg-kiwi-50 text-kiwi-700"
                              : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {IMPORTANCE_LABEL[s.importance]}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{s.description}</p>
                    {prereqs.length > 0 && (
                      <p className="mt-2 text-[11px] text-ink-soft/80">
                        Builds on: {prereqs.join(", ")}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eceae4]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, eff * 100)}%`,
                            background: `hsl(${8 + eff * 100} 65% 45%)`,
                          }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-ink-soft">
                        {Math.round(eff * 100)}%
                      </span>
                      <span className="text-[11px] text-kiwi-600">
                        {hasLesson ? "Lesson ready" : "Open lesson →"}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
          {detail.sections.some((s) => s.module_id === m.id && s.excluded) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
              <span className="font-semibold">Excluded:</span>
              {detail.sections
                .filter((s) => s.module_id === m.id && s.excluded)
                .map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 line-through decoration-stone-400"
                  >
                    {s.name}
                    <button
                      onClick={() => setExcluded(s, false)}
                      className="no-underline text-kiwi-700 hover:text-kiwi-800"
                      title="Restore to my course"
                    >
                      ↩
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface CheckItem {
  id: string;
  question: string;
  options: string[];
}

interface CheckResult {
  correct: boolean;
  feedback: string;
}

/** The graded check that ends every lesson — this is what moves your mastery. */
function LessonCheck({
  notebookId,
  section,
  onAnswered,
}: {
  notebookId: string;
  section: Section;
  onAnswered: () => void;
}) {
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [grading, setGrading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notebooks/${notebookId}/lesson/${section.id}/check`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Couldn't load the check");
        if (!cancelled) setItems(data.items);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [notebookId, section.id]);

  async function answer(itemId: string, index: number) {
    if (results[itemId] || grading) return;
    setAnswers((a) => ({ ...a, [itemId]: index }));
    setGrading(itemId);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/quiz/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, selected_index: index }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Grading failed");
      setResults((r) => ({ ...r, [itemId]: { correct: data.correct, feedback: data.feedback } }));
      onAnswered(); // mastery moved — refresh the readiness meter
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed");
    } finally {
      setGrading(null);
    }
  }

  if (error) return <p className="mt-6 text-sm text-red-600">{error}</p>;
  if (!items) {
    return (
      <p className="animate-kiwi-pulse mt-8 text-center text-sm text-ink-soft">
        Writing your check questions…
      </p>
    );
  }

  const answered = Object.keys(results).length;
  const score = Object.values(results).filter((r) => r.correct).length;

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold">Check yourself</h2>
        <span className="text-xs text-ink-soft">
          {answered === items.length
            ? `${score}/${items.length} correct`
            : `${answered}/${items.length} answered`}
        </span>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        Answering these is what actually moves your mastery — reading alone doesn&apos;t. You get
        the right answer and why, immediately.
      </p>

      <div className="space-y-4">
        {items.map((item, qi) => {
          const chosen = answers[item.id];
          const result = results[item.id];
          return (
            <div key={item.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="mb-3 flex gap-2">
                <span className="shrink-0 text-sm font-bold text-kiwi-600">{qi + 1}.</span>
                <div className="flex-1 text-sm font-medium">
                  <Markdown content={item.question} />
                </div>
              </div>

              <div className="space-y-2">
                {item.options.map((opt, i) => {
                  const isChosen = chosen === i;
                  const showState = !!result;
                  // After answering, the correct option is revealed by the
                  // feedback text; here we mark what the learner picked.
                  const cls = !showState
                    ? "border-line hover:border-kiwi-300"
                    : isChosen
                      ? result.correct
                        ? "border-kiwi-500 bg-kiwi-50"
                        : "border-red-400 bg-red-50"
                      : "border-line opacity-60";
                  return (
                    <button
                      key={i}
                      onClick={() => answer(item.id, i)}
                      disabled={!!result || grading === item.id}
                      className={`block w-full rounded-xl border px-4 py-2.5 text-left text-sm transition disabled:cursor-default ${cls}`}
                    >
                      <span className="mr-2 font-bold text-kiwi-700">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {opt}
                      {showState && isChosen && (
                        <span className="ml-2 font-bold">{result.correct ? "✓" : "✗"}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {grading === item.id && (
                <p className="animate-kiwi-pulse mt-3 text-xs text-ink-soft">Checking…</p>
              )}

              {result && (
                <div
                  className={`mt-3 rounded-xl border p-3 text-sm ${
                    result.correct
                      ? "border-kiwi-200 bg-kiwi-50 text-kiwi-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <p className="font-semibold">{result.correct ? "✓ Correct" : "✗ Not quite"}</p>
                  <div className="mt-1">
                    <Markdown content={result.feedback} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {answered === items.length && (
        <div className="mt-5 rounded-2xl border border-kiwi-200 bg-kiwi-50 p-5 text-center">
          <p className="font-display text-lg font-semibold text-kiwi-800">
            {score === items.length
              ? "Perfect — this section is locking in. 🥝"
              : score >= items.length / 2
                ? "Good progress — your mastery went up."
                : "Worth another pass — your mastery reflects that."}
          </p>
          <p className="mt-1 text-sm text-kiwi-900">
            {score}/{items.length} correct. Your readiness meter has been updated.
          </p>
        </div>
      )}
    </div>
  );
}

function LessonView({
  notebookId,
  section,
  onBack,
  onMasteryChange,
}: {
  notebookId: string;
  section: Section;
  onBack: () => void;
  onMasteryChange: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notebooks/${notebookId}/lesson/${section.id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed to load lesson");
        if (!cancelled) setContent(data.content);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [notebookId, section.id]);

  // While the lesson generates there's nothing to read — hand over the full
  // width to a game instead of a spinner in a narrow column.
  if (content === null && !error) {
    return (
      <div>
        <button onClick={onBack} className="mb-4 text-sm text-kiwi-700 hover:underline">
          ← Back to outline
        </button>
        <p className="mb-4 text-center text-sm text-ink-soft">
          <span className="animate-kiwi-pulse">
            Writing your lesson on <strong>{section.name}</strong>… (~30s, then it&apos;s cached)
          </span>
        </p>
        <KiwiGame />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={onBack} className="mb-4 text-sm text-kiwi-700 hover:underline">
        ← Back to outline
      </button>
      <div className="rounded-2xl border border-line bg-white p-8">
        <p className="text-xs font-bold uppercase tracking-wider text-kiwi-600">Lesson</p>
        <h1 className="font-display mt-1 text-2xl font-semibold">{section.name}</h1>
        <div className="mt-5">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <Markdown content={content!} citations />
          )}
        </div>
      </div>

      {!error && (
        <LessonCheck
          notebookId={notebookId}
          section={section}
          onAnswered={onMasteryChange}
        />
      )}
    </div>
  );
}
