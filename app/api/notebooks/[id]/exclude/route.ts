import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { recordExclusion, removeExclusion, type ExclusionKind } from "@/lib/exclusions";

// "Not relevant to my course": removes the item now AND remembers the
// rejection so rebuilt sets don't bring it back. Sections are soft-excluded
// (restorable); cards and quiz items are deleted with their text recorded.

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { kind, ref_id, undo } = (await req.json()) as {
    kind: ExclusionKind;
    ref_id: string;
    undo?: boolean;
  };
  if (!["card", "quiz", "section"].includes(kind) || !ref_id) {
    return NextResponse.json({ error: "kind (card|quiz|section) and ref_id required" }, { status: 400 });
  }
  const db = getDb();

  if (kind === "section") {
    const section = db
      .prepare("SELECT id, name FROM sections WHERE id = ? AND notebook_id = ?")
      .get(ref_id, id) as { id: string; name: string } | undefined;
    if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
    if (undo) {
      db.prepare("UPDATE sections SET excluded = 0 WHERE id = ?").run(section.id);
      removeExclusion(id, "section", section.name);
    } else {
      db.prepare("UPDATE sections SET excluded = 1 WHERE id = ?").run(section.id);
      recordExclusion(id, "section", section.name);
    }
    return NextResponse.json({ ok: true });
  }

  if (kind === "card") {
    const card = db
      .prepare("SELECT id, front FROM cards WHERE id = ? AND notebook_id = ?")
      .get(ref_id, id) as { id: string; front: string } | undefined;
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    recordExclusion(id, "card", card.front);
    db.prepare("DELETE FROM cards WHERE id = ?").run(card.id);
    return NextResponse.json({ ok: true });
  }

  // quiz
  const item = db
    .prepare("SELECT id, payload FROM quiz_items WHERE id = ? AND notebook_id = ?")
    .get(ref_id, id) as { id: string; payload: string } | undefined;
  if (!item) return NextResponse.json({ error: "Quiz item not found" }, { status: 404 });
  try {
    const question = JSON.parse(item.payload)?.question;
    if (question) recordExclusion(id, "quiz", question);
  } catch {
    // unparseable payload — still delete the item
  }
  db.prepare("DELETE FROM quiz_items WHERE id = ?").run(item.id);
  return NextResponse.json({ ok: true });
}
