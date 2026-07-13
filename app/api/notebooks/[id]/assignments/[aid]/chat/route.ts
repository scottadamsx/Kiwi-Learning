import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tutorTurn, type AssignmentRow } from "@/lib/assignments";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; aid: string }> }
) {
  const { id, aid } = await ctx.params;
  const { message } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });

  const db = getDb();
  const assignment = db
    .prepare("SELECT * FROM assignments WHERE id = ? AND notebook_id = ?")
    .get(aid, id) as AssignmentRow | undefined;
  if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

  try {
    const result = await tutorTurn(assignment, message.trim());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
