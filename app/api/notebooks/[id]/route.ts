import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const notebook = db.prepare("SELECT * FROM notebooks WHERE id = ?").get(id);
  if (!notebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const documents = db
    .prepare("SELECT id, filename, mime, char_count, created_at FROM documents WHERE notebook_id = ? ORDER BY created_at")
    .all(id);
  const modules = db
    .prepare("SELECT * FROM modules WHERE notebook_id = ? ORDER BY position")
    .all(id);
  const sections = db
    .prepare("SELECT * FROM sections WHERE notebook_id = ? ORDER BY position")
    .all(id);
  const edges = db
    .prepare("SELECT from_section, to_section FROM section_edges WHERE notebook_id = ?")
    .all(id);
  const lessons = db
    .prepare(
      "SELECT l.section_id FROM lessons l JOIN sections s ON s.id = l.section_id WHERE s.notebook_id = ?"
    )
    .all(id) as { section_id: string }[];

  return NextResponse.json({
    notebook,
    documents,
    modules,
    sections,
    edges,
    lesson_section_ids: lessons.map((l) => l.section_id),
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  db.prepare("DELETE FROM notebooks WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
