"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Kiwi Games — Word Break. A pocket word game shown while the engine is
// generating (lessons, quizzes), same game family as Kiwi IDE's engage
// content. Guess the 5-letter word in 6 tries.

const POOL = [
  "brain", "study", "learn", "smart", "focus", "think", "chart", "grade",
  "notes", "logic", "mango", "kiwis", "fruit", "plant", "green", "paper",
  "essay", "tutor", "score", "recap", "prime", "atoms", "cells", "graph",
  "angle", "ratio", "solve", "prove", "quill", "index",
];

type LetterState = "hit" | "near" | "miss";

function scoreGuess(guess: string, answer: string): LetterState[] {
  const result: LetterState[] = Array(5).fill("miss");
  const remaining: Record<string, number> = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) result[i] = "hit";
    else remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === "hit") continue;
    if (remaining[guess[i]] > 0) {
      result[i] = "near";
      remaining[guess[i]] -= 1;
    }
  }
  return result;
}

const TILE: Record<LetterState, string> = {
  hit: "bg-kiwi-500 border-kiwi-500 text-white",
  near: "bg-amber-400 border-amber-400 text-white",
  miss: "bg-stone-300 border-stone-300 text-white",
};

export default function KiwiGame() {
  const [answer, setAnswer] = useState(() => POOL[Math.floor(Math.random() * POOL.length)]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const won = guesses.includes(answer);
  const lost = !won && guesses.length >= 6;

  const reset = useCallback(() => {
    setAnswer(POOL[Math.floor(Math.random() * POOL.length)]);
    setGuesses([]);
    setCurrent("");
    setMessage(null);
  }, []);

  const submit = useCallback(() => {
    if (current.length !== 5) {
      setMessage("5 letters needed");
      return;
    }
    setGuesses((g) => [...g, current]);
    setCurrent("");
    setMessage(null);
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (won || lost) return;
      if (e.key === "Enter") submit();
      else if (e.key === "Backspace") setCurrent((c) => c.slice(0, -1));
      else if (/^[a-zA-Z]$/.test(e.key)) setCurrent((c) => (c + e.key.toLowerCase()).slice(0, 5));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, won, lost]);

  const keyStates = useMemo(() => {
    const map = new Map<string, LetterState>();
    for (const g of guesses) {
      const score = scoreGuess(g, answer);
      g.split("").forEach((ch, i) => {
        const prev = map.get(ch);
        const next = score[i];
        if (prev === "hit") return;
        if (prev === "near" && next === "miss") return;
        map.set(ch, next);
      });
    }
    return map;
  }, [guesses, answer]);

  const rows = [...guesses];
  if (!won && rows.length < 6) rows.push(current.padEnd(5, " "));
  while (rows.length < 6) rows.push("     ");

  return (
    <div className="mx-auto w-fit rounded-2xl border border-line bg-white p-5 text-center select-none">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-kiwi-600">
        🥝 Kiwi Games · Word Break
      </p>
      <p className="mb-3 text-xs text-ink-soft">Guess the 5-letter word while you wait</p>

      <div className="space-y-1">
        {rows.map((row, ri) => {
          const scored = ri < guesses.length ? scoreGuess(guesses[ri], answer) : null;
          return (
            <div key={ri} className="flex justify-center gap-1">
              {row.split("").map((ch, ci) => (
                <div
                  key={ci}
                  className={`flex h-9 w-9 items-center justify-center rounded-md border text-sm font-bold uppercase ${
                    scored ? TILE[scored[ci]] : ch !== " " ? "border-kiwi-300 bg-kiwi-50" : "border-line bg-white"
                  }`}
                >
                  {ch.trim()}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {message && <p className="mt-2 text-xs text-amber-700">{message}</p>}
      {won && <p className="mt-2 text-sm font-semibold text-kiwi-700">Got it! 🎉</p>}
      {lost && (
        <p className="mt-2 text-sm text-ink-soft">
          It was <span className="font-bold uppercase">{answer}</span>
        </p>
      )}

      {won || lost ? (
        <button
          onClick={reset}
          className="mt-2 rounded-lg bg-kiwi-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-kiwi-700"
        >
          Play again
        </button>
      ) : (
        <div className="mt-3 space-y-1">
          {["qwertyuiop", "asdfghjkl", "zxcvbnm"].map((rowKeys, i) => (
            <div key={i} className="flex justify-center gap-0.5">
              {i === 2 && (
                <button
                  onClick={submit}
                  className="rounded bg-kiwi-600 px-1.5 text-[10px] font-bold text-white"
                >
                  GO
                </button>
              )}
              {rowKeys.split("").map((k) => {
                const st = keyStates.get(k);
                return (
                  <button
                    key={k}
                    onClick={() => setCurrent((c) => (c + k).slice(0, 5))}
                    className={`h-7 w-6 rounded text-[11px] font-semibold uppercase ${
                      st ? TILE[st] : "bg-stone-100 hover:bg-stone-200"
                    }`}
                  >
                    {k}
                  </button>
                );
              })}
              {i === 2 && (
                <button
                  onClick={() => setCurrent((c) => c.slice(0, -1))}
                  className="rounded bg-stone-200 px-1.5 text-[10px] font-bold"
                >
                  ⌫
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
