import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; aid: string }> }
) {
  const { id, aid } = await ctx.params;
  const db = getDb();
  const assignment = db
    .prepare("SELECT * FROM assignments WHERE id = ? AND notebook_id = ?")
    .get(aid, id);
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const messages = db
    .prepare("SELECT role, content, ts FROM assignment_messages WHERE assignment_id = ? ORDER BY id")
    .all(aid);
  const steps = db
    .prepare("SELECT kind, text, ts FROM assignment_steps WHERE assignment_id = ? ORDER BY id")
    .all(aid);
  return NextResponse.json({ assignment, messages, steps });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; aid: string }> }
) {
  const { id, aid } = await ctx.params;
  const { status } = await req.json();
  if (!["active", "done"].includes(status)) {
    return NextResponse.json({ error: "status must be active|done" }, { status: 400 });
  }
  const db = getDb();
  const r = db
    .prepare("UPDATE assignments SET status = ? WHERE id = ? AND notebook_id = ?")
    .run(status, aid, id);
  if (r.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; aid: string }> }
) {
  const { id, aid } = await ctx.params;
  getDb().prepare("DELETE FROM assignments WHERE id = ? AND notebook_id = ?").run(aid, id);
  return NextResponse.json({ ok: true });
}
