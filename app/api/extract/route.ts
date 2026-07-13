import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/ingest";

// Extract text from uploaded files WITHOUT attaching them to a notebook.
// Used by the Assignments panel so you can drop the assignment PDF (or a
// screenshot of it, a .docx, whatever) straight into the brief or the tutor
// chat. Same universal extractor the Sources upload uses.

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: {
    filename: string;
    ok: boolean;
    text?: string;
    via?: string;
    error?: string;
  }[] = [];

  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const { text, via } = await extractText(
        file.name,
        file.type || "application/octet-stream",
        buf
      );
      results.push({ filename: file.name, ok: true, text, via });
    } catch (err) {
      results.push({
        filename: file.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ results });
}
