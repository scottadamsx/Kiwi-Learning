"use client";

import { useState } from "react";
import type { GradeResult } from "@/lib/types";
import Markdown from "./Markdown";
import KiwiGame from "./KiwiGame";

interface QuizViewItem {
  id: string;
  type: "mcq" | "short" | "long";
  section_id: string;
  section_name: string;
  question: string;
  options?: string[];
}

// Adaptive quiz: generated against the weakest sections, interleaved.
// MCQs grade instantly; free-text answers go through the understanding-based
// grading engine (rubric breakdown, partial credit, misconception detection,
// low-confidence flagging).

export default function QuizPanel({
  notebookId,
  onGraded,
}: {
  notebookId: string;
  onGraded: () => void;
}) {
  const [items, setItems] = useState<QuizViewItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [sessionScores, setSessionScores] = useState<number[]>([]);

  async function generate() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/notebooks/${notebookId}/quiz`, { method: "POST" });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(data.error ?? "Quiz generation failed");
      return;
    }
    setItems(data.items);
    setIdx(0);
    setSelected(null);
    setText("");
    setResult(null);
    setSessionScores([]);
  }

  async function submit() {
    if (!items || grading) return;
    const item = items[idx];
    if (item.type === "mcq" && selected === null) return;
    if (item.type !== "mcq" && !text.trim()) return;
    setGrading(true);
    setError(null);
    const res = await fetch(`/api/notebooks/${notebookId}/quiz/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: item.id,
        selected_index: item.type === "mcq" ? selected : undefined,
        text: item.type !== "mcq" ? text : undefined,
      }),
    });
    const data = await res.json();
    setGrading(false);
    if (!res.ok) {
      setError(data.error ?? "Grading failed");
      return;
    }
    setResult(data);
    setSessionScores((s) => [...s, data.score]);
    onGraded();
  }

  function next() {
    setIdx((i) => i + 1);
    setSelected(null);
    setText("");
    setResult(null);
  }

  async function excludeItem() {
    if (!items || result || grading) return;
    const item = items[idx];
    await fetch(`/api/notebooks/${notebookId}/exclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "quiz", ref_id: item.id }),
    });
    // Drop the item from the session without grading or mastery impact.
    setItems((its) => (its ? its.filter((_, i) => i !== idx) : its));
    setSelected(null);
    setText("");
    setResult(null);
  }

  if (!items) {
    return (
      <div className="space-y-6">
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-10 text-center">
        <p className="text-3xl">✍️</p>
        <h2 className="font-display mt-2 text-xl font-semibold">Adaptive quiz</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Kiwi builds a fresh quiz over your weakest sections: multiple choice with real
          distractors, short answers, and one long answer graded on what you actually understood.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          onClick={generate}
          disabled={generating}
          className="mt-4 rounded-xl bg-kiwi-600 px-6 py-3 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-50"
        >
          {generating ? <span className="animate-kiwi-pulse">Writing your quiz…</span> : "Start a quiz"}
        </button>
      </div>
      {generating && <KiwiGame />}
      </div>
    );
  }

  if (idx >= items.length) {
    const avg =
      sessionScores.length > 0
        ? sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length
        : 0;
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-10 text-center">
        <p className="text-3xl">🥝</p>
        <h2 className="font-display mt-2 text-xl font-semibold">
          Quiz done — {Math.round(avg * 100)}% average
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Your mastery estimates updated with every answer. Check the Overview to see where you
          stand now.
        </p>
        <button
          onClick={generate}
          disabled={generating}
          className="mt-4 rounded-xl bg-kiwi-600 px-6 py-3 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-50"
        >
          {generating ? <span className="animate-kiwi-pulse">Writing…</span> : "Another round"}
        </button>
      </div>
    );
  }

  const item = items[idx];
  const typeLabel =
    item.type === "mcq" ? "Multiple choice" : item.type === "short" ? "Short answer" : "Long answer";

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-3 text-center text-xs text-ink-soft">
        Question {idx + 1} of {items.length} · {typeLabel} ·{" "}
        <span className="font-medium text-kiwi-700">{item.section_name}</span>
      </p>

      <div className="rounded-2xl border border-line bg-white p-7">
        <Markdown content={item.question} />

        {item.type === "mcq" && (
          <div className="mt-5 space-y-2">
            {item.options?.map((opt, i) => (
              <button
                key={i}
                onClick={() => !result && setSelected(i)}
                disabled={!!result}
                className={`block w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                  selected === i
                    ? "border-kiwi-500 bg-kiwi-50"
                    : "border-line bg-white hover:border-kiwi-300"
                } ${result ? "opacity-70" : ""}`}
              >
                <span className="mr-2 font-bold text-kiwi-700">{String.fromCharCode(65 + i)}.</span>
                {opt}
              </button>
            ))}
          </div>
        )}

        {item.type !== "mcq" && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!!result}
            rows={item.type === "long" ? 8 : 4}
            placeholder={
              item.type === "long"
                ? "Explain in your own words — the grader checks which ideas you expressed, not exact wording."
                : "Answer in 1–3 sentences."
            }
            className="mt-5 w-full rounded-xl border border-line bg-white p-3 text-sm outline-none focus:border-kiwi-400 focus:ring-2 focus:ring-kiwi-100 disabled:opacity-70"
          />
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {!result ? (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              onClick={submit}
              disabled={grading || (item.type === "mcq" ? selected === null : !text.trim())}
              className="rounded-xl bg-kiwi-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-40"
            >
              {grading ? (
                <span className="animate-kiwi-pulse">
                  {item.type === "mcq" ? "Checking…" : "Grading on understanding…"}
                </span>
              ) : (
                "Submit"
              )}
            </button>
            <button
              onClick={excludeItem}
              disabled={grading}
              className="text-xs text-ink-soft underline decoration-dotted hover:text-red-600 disabled:opacity-50"
              title="Skips this question, removes it, and keeps similar ones out of future quizzes"
            >
              🚫 Not relevant to my course
            </button>
          </div>
        ) : (
          <GradeCard result={result} onNext={next} last={idx === items.length - 1} />
        )}
      </div>
    </div>
  );
}

function GradeCard({
  result,
  onNext,
  last,
}: {
  result: GradeResult;
  onNext: () => void;
  last: boolean;
}) {
  const pct = Math.round(result.score * 100);
  return (
    <div
      className={`mt-5 rounded-xl border p-5 ${
        result.correct ? "border-kiwi-200 bg-kiwi-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">
          {result.correct ? "✓" : "✗"} {pct}%
        </p>
        {result.low_confidence && (
          <span
            className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600"
            title={`Grader samples disagreed (${result.sample_scores?.join(", ")}/5) — treat this grade as tentative.`}
          >
            low-confidence grade
          </span>
        )}
      </div>

      <div className="mt-2 text-sm">
        <Markdown content={result.feedback} />
      </div>

      {result.key_idea_coverage && result.key_idea_coverage.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            What you expressed
          </p>
          {result.key_idea_coverage.map((k, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className={k.covered ? "text-kiwi-600" : "text-red-500"}>
                {k.covered ? "✓" : "✗"}
              </span>
              <div>
                <span>{k.idea}</span>
                {k.covered && k.evidence && (
                  <span className="block text-xs italic text-ink-soft">“{k.evidence}”</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {result.misconceptions && result.misconceptions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Possible mix-ups
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
            {result.misconceptions.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onNext}
        className="mt-4 rounded-xl bg-ink px-5 py-2 text-sm font-semibold text-white hover:opacity-85"
      >
        {last ? "Finish" : "Next question →"}
      </button>
    </div>
  );
}
