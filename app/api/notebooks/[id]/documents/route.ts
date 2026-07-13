import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestDocument } from "@/lib/ingest";
import { invalidateIndex } from "@/lib/retrieval";

// Image transcription can take a while; allow the full window.
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const notebook = db.prepare("SELECT id FROM notebooks WHERE id = ?").get(id);
  if (!notebook) return NextResponse.json({ error: "Notebook not found" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: {
    filename: string;
    ok: boolean;
    error?: string;
    chunks?: number;
    via?: string;
  }[] = [];
  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const { chunkCount, via } = await ingestDocument(
        id,
        file.name,
        file.type || "application/octet-stream",
        buf
      );
      results.push({ filename: file.name, ok: true, chunks: chunkCount, via });
    } catch (err) {
      results.push({
        filename: file.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  invalidateIndex(id);
  return NextResponse.json({ results });
}
