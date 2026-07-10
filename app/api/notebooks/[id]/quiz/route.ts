import { NextRequest, NextResponse } from "next/server";
import { generateQuiz } from "@/lib/generate";
import { getDb } from "@/lib/db";

export const maxDuration = 300;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const items = await generateQuiz(id);
    const db = getDb();
    const sectionName = db.prepare("SELECT name FROM sections WHERE id = ?");
    // Never send answer keys to the client.
    const safe = items.map((it) => {
      const p = it.payload as unknown as Record<string, unknown>;
      return {
        id: it.id,
        type: it.type,
        section_id: it.section_id,
        section_name: (sectionName.get(it.section_id) as { name: string } | undefined)?.name ?? "",
        question: p.question,
        options: it.type === "mcq" ? p.options : undefined,
      };
    });
    return NextResponse.json({ items: safe });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
