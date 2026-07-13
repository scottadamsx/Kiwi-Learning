import { NextRequest, NextResponse } from "next/server";
import { getOrGenerateLessonCheck } from "@/lib/generate";
import type { McqPayload } from "@/lib/types";

// The graded check at the end of a lesson. Answer keys never leave the server —
// the client posts an answer to /quiz/answer, which grades it and updates the
// section's BKT mastery (so reading + answering actually moves your readiness).

export const maxDuration = 300;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; sectionId: string }> }
) {
  const { id, sectionId } = await ctx.params;
  try {
    const items = await getOrGenerateLessonCheck(id, sectionId);
    return NextResponse.json({
      items: items.map((it) => {
        const p = it.payload as McqPayload;
        return { id: it.id, question: p.question, options: p.options };
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
