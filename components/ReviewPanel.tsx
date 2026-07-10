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

// Flashcard review session. Cards are FSRS-scheduled; ratings feed both the
// scheduler and the section's BKT mastery. The queue is shuffled so practice
// interleaves sections instead of draining one topic.

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
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/review?limit=30`);
    const data = await res.json();
    const cards: DueCard[] = data.cards ?? [];
    // Interleave sections.
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    setQueue(cards);
    setDone(0);
    setFlipped(false);
  }, [notebookId]);

  useEffect(() => {
    load();
  }, [load]);

  async function rate(rating: 1 | 2 | 3 | 4) {
    if (!queue || queue.length === 0 || busy) return;
    setBusy(true);
    const card = queue[0];
    await fetch(`/api/notebooks/${notebookId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: card.id, rating }),
    });
    setBusy(false);
    setFlipped(false);
    setDone((d) => d + 1);
    setQueue((q) => (q ? q.slice(1) : q));
  }

  useEffect(() => {
    if (queue && queue.length === 0 && done > 0) onSessionEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue?.length]);

  if (queue === null) {
    return <p className="animate-kiwi-pulse p-10 text-center text-sm text-ink-soft">Loading cards…</p>;
  }

  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-10 text-center">
        <p className="text-3xl">🎉</p>
        <h2 className="font-display mt-2 text-xl font-semibold">
          {done > 0 ? `Nice — ${done} card${done === 1 ? "" : "s"} reviewed.` : "Nothing due right now."}
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Cards come back exactly when you&apos;re about to forget them — effortful on purpose,
          because that&apos;s what builds durable memory.
        </p>
        <button onClick={load} className="mt-4 text-sm text-kiwi-700 underline">
          Check again
        </button>
      </div>
    );
  }

  const card = queue[0];

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-3 text-center text-xs text-ink-soft">
        {queue.length} left · <span className="font-medium text-kiwi-700">{card.section_name}</span>
      </p>
      <div
        onClick={() => setFlipped(true)}
        className={`min-h-64 rounded-2xl border border-line bg-white p-8 shadow-sm transition ${
          flipped ? "" : "cursor-pointer hover:border-kiwi-300"
        }`}
      >
        <Markdown content={card.front} />
        {flipped ? (
          <>
            <hr className="my-5 border-line" />
            <Markdown content={card.back} />
          </>
        ) : (
          <p className="mt-6 text-center text-xs text-ink-soft">
            Try to recall the answer, then click to flip
          </p>
        )}
      </div>

      {flipped && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          <RateButton label="Again" sub="forgot" color="bg-red-600 hover:bg-red-700" onClick={() => rate(1)} disabled={busy} />
          <RateButton label="Hard" sub="barely" color="bg-amber-600 hover:bg-amber-700" onClick={() => rate(2)} disabled={busy} />
          <RateButton label="Good" sub="with effort" color="bg-kiwi-600 hover:bg-kiwi-700" onClick={() => rate(3)} disabled={busy} />
          <RateButton label="Easy" sub="instantly" color="bg-sky-600 hover:bg-sky-700" onClick={() => rate(4)} disabled={busy} />
        </div>
      )}
    </div>
  );
}

function RateButton({
  label,
  sub,
  color,
  onClick,
  disabled,
}: {
  label: string;
  sub: string;
  color: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-3 py-2.5 text-white transition disabled:opacity-50 ${color}`}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="block text-[10px] opacity-80">{sub}</span>
    </button>
  );
}
