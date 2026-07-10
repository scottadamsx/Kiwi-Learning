import { getDb } from "./db";
import { deserializeCard, retrievability } from "./fsrs";
import type { CardRow, Readiness, SectionReadiness } from "./types";

// Per-section mastery via Bayesian Knowledge Tracing with fixed defaults
// (no fitting needed for launch), plus the forgetting-aware readiness rollup:
//   m*_i = P(L)_i × R_i,  readiness = Σ(w_i · m*_i) / Σ(w_i)

const P_INIT = 0.2;
const P_SLIP = 0.1; // knew it but answered wrong
const P_GUESS = 0.2; // didn't know it but answered right
const P_TRANSIT = 0.15; // learned it from this practice opportunity

/** One BKT update. Mastery goes up on correct, down on incorrect — in real time. */
export function bktUpdate(pL: number, correct: boolean): number {
  const posterior = correct
    ? (pL * (1 - P_SLIP)) / (pL * (1 - P_SLIP) + (1 - pL) * P_GUESS)
    : (pL * P_SLIP) / (pL * P_SLIP + (1 - pL) * (1 - P_GUESS));
  const next = posterior + (1 - posterior) * P_TRANSIT;
  return Math.max(0.01, Math.min(0.99, next));
}

export function applyBkt(sectionId: string, correct: boolean) {
  const db = getDb();
  const row = db.prepare("SELECT mastery FROM sections WHERE id = ?").get(sectionId) as
    | { mastery: number }
    | undefined;
  if (!row) return;
  const next = bktUpdate(row.mastery ?? P_INIT, correct);
  db.prepare(
    "UPDATE sections SET mastery = ?, last_activity = datetime('now') WHERE id = ?"
  ).run(next, sectionId);
}

/**
 * Section retrievability: mean FSRS retrievability of its cards. Sections with
 * no cards decay on a gentle exponential from last_activity (half-life ~30 days).
 */
function sectionRetrievability(sectionId: string, lastActivity: string | null): number {
  const db = getDb();
  const cards = db.prepare("SELECT fsrs_state FROM cards WHERE section_id = ?").all(sectionId) as Pick<
    CardRow,
    "fsrs_state"
  >[];
  const now = new Date();
  if (cards.length > 0) {
    const rs = cards.map((c) => retrievability(deserializeCard(c.fsrs_state), now));
    return rs.reduce((a, b) => a + b, 0) / rs.length;
  }
  if (!lastActivity) return 1;
  const days = (now.getTime() - new Date(lastActivity + "Z").getTime()) / 86_400_000;
  return Math.pow(0.5, Math.max(0, days) / 30);
}

export function computeReadiness(notebookId: string): Readiness {
  const db = getDb();
  const modules = db
    .prepare("SELECT id, name FROM modules WHERE notebook_id = ? ORDER BY position")
    .all(notebookId) as { id: string; name: string }[];
  const sections = db
    .prepare(
      "SELECT id, module_id, name, importance, mastery, last_activity FROM sections WHERE notebook_id = ? AND excluded = 0 ORDER BY position"
    )
    .all(notebookId) as {
    id: string;
    module_id: string;
    name: string;
    importance: number;
    mastery: number;
    last_activity: string | null;
  }[];

  const perSection: SectionReadiness[] = sections.map((s) => {
    const r = sectionRetrievability(s.id, s.last_activity);
    return {
      section_id: s.id,
      module_id: s.module_id,
      name: s.name,
      importance: s.importance,
      mastery: s.mastery,
      retrievability: r,
      effective: s.mastery * r,
    };
  });

  const weightedAvg = (items: SectionReadiness[]) => {
    const wSum = items.reduce((a, s) => a + s.importance, 0);
    if (wSum === 0) return 0;
    return items.reduce((a, s) => a + s.importance * s.effective, 0) / wSum;
  };

  const moduleRollups = modules.map((m) => {
    const ss = perSection.filter((s) => s.module_id === m.id);
    return { module_id: m.id, name: m.name, readiness: weightedAvg(ss), sections: ss };
  });

  const dueCards = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM cards c JOIN sections s ON s.id = c.section_id
         WHERE c.notebook_id = ? AND c.due <= ? AND s.excluded = 0`
      )
      .get(notebookId, new Date().toISOString()) as { n: number }
  ).n;

  return { overall: weightedAvg(perSection), modules: moduleRollups, due_cards: dueCards };
}

/**
 * Decision policy targets: weakest sections first (lowest effective mastery,
 * weighted up by importance) — this is what quiz generation practices.
 */
export function weakestSections(notebookId: string, count: number): SectionReadiness[] {
  const r = computeReadiness(notebookId);
  return r.modules
    .flatMap((m) => m.sections)
    .sort((a, b) => a.effective / a.importance - b.effective / b.importance)
    .slice(0, count);
}
