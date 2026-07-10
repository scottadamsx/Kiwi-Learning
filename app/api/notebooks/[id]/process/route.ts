import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { processNotebook } from "@/lib/generate";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const notebook = db.prepare("SELECT status FROM notebooks WHERE id = ?").get(id) as
    | { status: string }
    | undefined;
  if (!notebook) return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  if (notebook.status === "processing") {
    return NextResponse.json({ error: "Already processing" }, { status: 409 });
  }
  const docCount = (
    db.prepare("SELECT COUNT(*) AS n FROM documents WHERE notebook_id = ?").get(id) as { n: number }
  ).n;
  if (docCount === 0) {
    return NextResponse.json({ error: "Upload at least one document first" }, { status: 400 });
  }

  // Fire and forget; the client polls notebook status.
  processNotebook(id).catch(() => {});
  return NextResponse.json({ started: true });
}
