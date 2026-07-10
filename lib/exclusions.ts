import { getDb } from "./db";

// "Not relevant to my course" memory. When the learner rejects a flashcard,
// quiz question, or whole section, the rejected text is recorded here. It
// outlives rebuilds: regeneration prompts tell the model what was rejected,
// and a post-filter catches near-duplicates that slip through anyway.

export type ExclusionKind = "card" | "quiz" | "section";

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function recordExclusion(notebookId: string, kind: ExclusionKind, refText: string) {
  if (!refText.trim()) return;
  const db = getDb();
  const exists = db
    .prepare(
      "SELECT 1 FROM exclusions WHERE notebook_id = ? AND kind = ? AND ref_text = ? LIMIT 1"
    )
    .get(notebookId, kind, refText);
  if (!exists) {
    db.prepare("INSERT INTO exclusions (notebook_id, kind, ref_text) VALUES (?, ?, ?)").run(
      notebookId,
      kind,
      refText
    );
  }
}

export function removeExclusion(notebookId: string, kind: ExclusionKind, refText: string) {
  getDb()
    .prepare("DELETE FROM exclusions WHERE notebook_id = ? AND kind = ? AND ref_text = ?")
    .run(notebookId, kind, refText);
}

export function listExclusions(notebookId: string, kind: ExclusionKind): string[] {
  const rows = getDb()
    .prepare("SELECT ref_text FROM exclusions WHERE notebook_id = ? AND kind = ? ORDER BY id")
    .all(notebookId, kind) as { ref_text: string }[];
  return rows.map((r) => r.ref_text);
}

/** Normalized-match check: exact match or one string containing the other. */
export function matchesExclusion(text: string, excluded: string[]): boolean {
  const n = normalize(text);
  if (!n) return false;
  return excluded.some((e) => {
    const ne = normalize(e);
    return ne === n || (ne.length > 12 && n.includes(ne)) || (n.length > 12 && ne.includes(n));
  });
}

/** Prompt block telling the model what the learner already rejected. */
export function exclusionPromptBlock(items: string[], label: string): string {
  if (items.length === 0) return "";
  return `\nThe learner marked the following ${label} as NOT part of their course. Do not create anything covering the same content:\n${items
    .slice(0, 40)
    .map((t) => `- ${t.slice(0, 200)}`)
    .join("\n")}\n`;
}
