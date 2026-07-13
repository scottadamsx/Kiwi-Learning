"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import GAMES from "@/lib/games-manifest.json";

// Kiwi Games — the full 88-game arcade, playable while the engine generates.
// Each game is a self-contained page under /kiwi-games/g/<id>.html rendered in
// a sandboxed iframe. The game draws at its natural size and we scale it to
// fill whatever width the panel gives us (never past 1:1, so it stays crisp).

interface GameMeta {
  id: string;
  title: string;
  rule: string;
}

const ALL = GAMES as GameMeta[];

// Local 2-player games need a second human — skip them when you're waiting alone.
const TWO_PLAYER = new Set(["duelpong", "cycleduel", "tankduel", "sumo", "twokiwis", "hunterprey"]);
const SOLO = ALL.filter((g) => !TWO_PLAYER.has(g.id));

// The arcade pages are laid out for roughly this canvas.
const NATURAL_W = 980;
const NATURAL_H = 700;

export default function KiwiGame() {
  const [game, setGame] = useState<GameMeta | null>(null);
  const [picking, setPicking] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [scale, setScale] = useState(1);
  const shellRef = useRef<HTMLDivElement>(null);

  // Pick client-side only — a random choice during render breaks hydration.
  useEffect(() => {
    setGame((g) => g ?? SOLO[Math.floor(Math.random() * SOLO.length)]);
  }, []);

  // Fit the game to the panel: scale to the available width, capped at 1:1.
  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / NATURAL_W));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [game]);

  const shuffle = useCallback(() => {
    setGame((current) => {
      const pool = SOLO.filter((g) => g.id !== current?.id);
      return pool[Math.floor(Math.random() * pool.length)];
    });
    setNonce((n) => n + 1);
    setPicking(false);
  }, []);

  return (
    <div
      ref={shellRef}
      className="mx-auto w-full max-w-[980px] overflow-hidden rounded-2xl border border-line bg-white"
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-kiwi-600">
          🥝 Kiwi Games
        </span>
        <span className="shrink-0 text-sm font-semibold">{game?.title ?? "…"}</span>
        <span className="hidden truncate text-xs text-ink-soft md:block">{game?.rule}</span>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            onClick={() => setPicking((p) => !p)}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-stone-100"
          >
            {ALL.length} games ▾
          </button>
          <button
            onClick={shuffle}
            className="rounded-lg bg-kiwi-600 px-3 py-1 text-xs font-semibold text-white hover:bg-kiwi-700"
          >
            🎲 Shuffle
          </button>
        </div>
      </div>

      {picking && (
        <div className="max-h-52 overflow-y-auto border-b border-line bg-paper p-2">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {ALL.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setGame(g);
                  setNonce((n) => n + 1);
                  setPicking(false);
                }}
                title={g.rule}
                className={`truncate rounded-md px-2 py-1 text-left text-xs hover:bg-kiwi-100 ${
                  g.id === game?.id ? "bg-kiwi-100 font-semibold text-kiwi-800" : "text-ink-soft"
                }`}
              >
                {g.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scaled viewport: the iframe renders at natural size, then scales to fit. */}
      <div style={{ height: NATURAL_H * scale, overflow: "hidden" }}>
        {game && (
          <iframe
            key={`${game.id}-${nonce}`}
            src={`/kiwi-games/g/${game.id}.html`}
            title={game.title}
            sandbox="allow-scripts allow-same-origin"
            style={{
              width: NATURAL_W,
              height: NATURAL_H,
              border: 0,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        )}
      </div>
    </div>
  );
}
