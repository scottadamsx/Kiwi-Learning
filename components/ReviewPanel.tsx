"use client";

import { useCallback, useEffect, useState } from "react";
import Markdown from "./Markdown";

interface DueCard {
  id: string;
  section_id: string;
  section_name: string;
  front: string;
  back: string;
}

// Flashcard review. Cards are FSRS-scheduled; ratings feed both the scheduler
// and the section's BKT mastery. The queue is shuffled so practice interleaves
// sections instead of draining one topic.
//
// The whole screen is keyboard-driven — Space to flip, 1–4 to rate — because
// a review session is a rhythm, and reaching for the mouse every card breaks it.

const RATINGS = [
  { key: "1", rating: 1 as const, label: "Again", sub: "forgot", cls: "bg-red-600 hover:bg-red-700" },
  { key: "2", rating: 2 as const, label: "Hard", sub: "barely", cls: "bg-amber-600 hover:bg-amber-700" },
  { key: "3", rating: 3 as const, label: "Good", sub: "with effort", cls: "bg-kiwi-600 hover:bg-kiwi-700" },
  { key: "4", rating: 4 as const, label: "Easy", sub: "instantly", cls: "bg-sky-600 hover:bg-sky-700" },
];

export default function ReviewPanel({
  notebookId,
  onSessionEnd,
}: {
  notebookId: string;
  onSessionEnd: () => void;
}) {
  const [queue, setQueue] = useState<DueCard[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [removed, setRemoved] = useState(0);
  const [busy, setBusy] = useState(false);
  const [startCount, setStartCount] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/review?limit=30`);
    const data = await res.json();
    const cards: DueCard[] = data.cards ?? [];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    setQueue(cards);
    setStartCount(cards.length);
    setDone(0);
    setRemoved(0);
    setFlipped(false);
  }, [notebookId]);

  useEffect(() => {
    load();
  }, [load]);

  const rate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (!queue || queue.length === 0 || busy) return;
      setBusy(true);
      const card = queue[0];
      await fetch(`/api/notebooks/${notebookId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: card.id, rating }),
      }).catch(() => {});
      setBusy(false);
      setFlipped(false);
      setDone((d) => d + 1);
      setQueue((q) => (q ? q.slice(1) : q));
    },
    [queue, busy, notebookId]
  );

  async function excludeCard() {
    if (!queue || queue.length === 0 || busy) return;
    setBusy(true);
    const card = queue[0];
    await fetch(`/api/notebooks/${notebookId}/exclude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "card", ref_id: card.id }),
    }).catch(() => {});
    setBusy(false);
    setFlipped(false);
    setRemoved((n) => n + 1);
    setQueue((q) => (q ? q.slice(1) : q));
  }

  // Keyboard: Space/Enter flips, 1–4 rates once flipped.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!queue || queue.length === 0) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!flipped) setFlipped(true);
        else rate(3);
        return;
      }
      if (flipped) {
        const hit = RATINGS.find((r) => r.key === e.key);
        if (hit) {
          e.preventDefault();
          rate(hit.rating);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, queue, rate]);

  useEffect(() => {
    if (queue && queue.length === 0 && done + removed > 0) onSessionEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.length]);

  if (queue === null) {
    return (
      <p className="animate-kiwi-pulse p-10 text-center text-sm text-ink-soft">Loading cards…</p>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-10 text-center">
        <p className="text-4xl">🎉</p>
        <h2 className="font-display mt-3 text-xl font-semibold">
          {done > 0
            ? `${done} card${done === 1 ? "" : "s"} reviewed — you're done for now.`
            : "Nothing due right now."}
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Cards come back exactly when you&apos;re about to forget them. Effortful on purpose —
          that&apos;s what builds durable memory.
        </p>
        <button
          onClick={load}
          className="mt-5 rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:border-kiwi-300"
        >
          Check again
        </button>
      </div>
    );
  }

  const card = queue[0];
  const total = startCount || queue.length;
  const progress = ((done + removed) / total) * 100;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="rounded-full bg-kiwi-100 px-2.5 py-1 font-semibold text-kiwi-700">
            {card.section_name}
          </span>
          <span className="tabular-nums text-ink-soft">
            {done + removed} of {total} · {queue.length} left
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#eceae4]">
          <div
            className="h-full rounded-full bg-kiwi-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div
        onClick={() => !flipped && setFlipped(true)}
        className={`flex min-h-[300px] flex-col rounded-2xl border border-line bg-white shadow-sm transition ${
          flipped ? "" : "cursor-pointer hover:border-kiwi-300 hover:shadow-md"
        }`}
      >
        <div className="flex flex-1 items-center justify-center px-8 py-10 text-center">
          <div className="w-full text-lg [&_p]:m-0">
            <Markdown content={card.front} />
          </div>
        </div>

        {flipped ? (
          <div className="border-t-2 border-dashed border-line bg-paper/60 px-8 py-8">
            <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-widest text-ink-soft">
              Answer
            </p>
            <div className="text-center">
              <Markdown content={card.back} />
            </div>
          </div>
        ) : (
          <div className="border-t border-line px-8 py-4 text-center">
            <button
              onClick={() => setFlipped(true)}
              className="rounded-xl bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:opacity-85"
            >
              Show answer
            </button>
            <p className="mt-2 text-xs text-ink-soft">
              Try to recall it first — press{" "}
              <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold">
                Space
              </kbd>
            </p>
          </div>
        )}
      </div>

      {/* Rating */}
      {flipped && (
        <>
          <p className="mb-2 mt-6 text-center text-xs text-ink-soft">How well did you recall it?</p>
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map((r) => (
              <button
                key={r.rating}
                onClick={() => rate(r.rating)}
                disabled={busy}
                className={`group rounded-xl px-3 py-3 text-white transition disabled:opacity-50 ${r.cls}`}
              >
                <span className="block text-sm font-bold">{r.label}</span>
                <span className="block text-[11px] opacity-80">{r.sub}</span>
                <kbd className="mt-1 inline-block rounded bg-white/20 px-1.5 text-[10px] font-semibold">
                  {r.key}
                </kbd>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-5 text-center">
        <button
          onClick={excludeCard}
          disabled={busy}
          className="text-xs text-ink-soft underline decoration-dotted underline-offset-2 hover:text-red-600 disabled:opacity-50"
          title="Removes this card and keeps it out of future rebuilds"
        >
          🚫 Not relevant to my course
        </button>
      </div>
    </div>
  );
}
