import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deserializeCard, reviewCard, serializeCard } from "@/lib/fsrs";
import { applyBkt } from "@/lib/mastery";

// GET: due cards for a review session (interleaved across sections).
// POST: record a rating (1 Again, 2 Hard, 3 Good, 4 Easy) → FSRS + BKT update.

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
  const db = getDb();
  // Interleave: order by due date but shuffle within the batch client-side.
  const cards = db
    .prepare(
      `SELECT c.id, c.section_id, c.front, c.back, c.due, s.name AS section_name
       FROM cards c JOIN sections s ON s.id = c.section_id
       WHERE c.notebook_id = ? AND c.due <= ? ORDER BY c.due LIMIT ?`
    )
    .all(id, new Date().toISOString(), limit);
  const total = (
    db
      .prepare("SELECT COUNT(*) AS n FROM cards WHERE notebook_id = ? AND due <= ?")
      .get(id, new Date().toISOString()) as { n: number }
  ).n;
  return NextResponse.json({ cards, total_due: total });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { card_id, rating } = await req.json();
  if (!card_id || ![1, 2, 3, 4].includes(rating)) {
    return NextResponse.json({ error: "card_id and rating (1-4) required" }, { status: 400 });
  }
  const db = getDb();
  const row = db
    .prepare("SELECT id, section_id, fsrs_state FROM cards WHERE id = ? AND notebook_id = ?")
    .get(card_id, id) as { id: string; section_id: string; fsrs_state: string } | undefined;
  if (!row) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const updated = reviewCard(deserializeCard(row.fsrs_state), rating);
  db.prepare("UPDATE cards SET fsrs_state = ?, due = ? WHERE id = ?").run(
    serializeCard(updated),
    updated.due.toISOString(),
    row.id
  );
  db.prepare("INSERT INTO review_logs (card_id, rating) VALUES (?, ?)").run(row.id, rating);

  // A retrieval attempt is evidence for BKT too: Good/Easy count as correct.
  applyBkt(row.section_id, rating >= 3);

  return NextResponse.json({ next_due: updated.due.toISOString() });
}
