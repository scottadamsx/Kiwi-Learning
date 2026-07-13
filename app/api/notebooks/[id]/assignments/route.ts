import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createAssignment } from "@/lib/assignments";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const assignments = db
    .prepare(
      `SELECT a.*,
        (SELECT COUNT(*) FROM assignment_steps s WHERE s.assignment_id = a.id) AS step_count,
        (SELECT COUNT(*) FROM assignment_messages m WHERE m.assignment_id = a.id) AS message_count
       FROM assignments a WHERE a.notebook_id = ? ORDER BY a.created_at DESC`
    )
    .all(id);
  return NextResponse.json({ assignments });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { title, brief } = await req.json();
  if (!title?.trim() || !brief?.trim()) {
    return NextResponse.json({ error: "title and brief are required" }, { status: 400 });
  }
  const db = getDb();
  if (!db.prepare("SELECT id FROM notebooks WHERE id = ?").get(id)) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }
  return NextResponse.json(createAssignment(id, title.trim(), brief.trim()), { status: 201 });
}
