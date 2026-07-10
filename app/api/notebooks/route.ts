import { NextRequest, NextResponse } from "next/server";
import { getDb, uid } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const notebooks = db
    .prepare(
      `SELECT n.*,
        (SELECT COUNT(*) FROM documents d WHERE d.notebook_id = n.id) AS document_count,
        (SELECT COUNT(*) FROM sections s WHERE s.notebook_id = n.id) AS section_count,
        (SELECT COUNT(*) FROM cards c WHERE c.notebook_id = n.id AND c.due <= datetime('now')) AS due_cards
       FROM notebooks n ORDER BY n.created_at DESC`
    )
    .all();
  return NextResponse.json({ notebooks });
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const db = getDb();
  const id = uid("nb");
  db.prepare("INSERT INTO notebooks (id, name) VALUES (?, ?)").run(id, name.trim());
  return NextResponse.json({ id, name: name.trim() }, { status: 201 });
}
