import { NextRequest, NextResponse } from "next/server";
import { getOrGenerateLesson } from "@/lib/generate";

export const maxDuration = 300;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; sectionId: string }> }
) {
  const { id, sectionId } = await ctx.params;
  try {
    const content = await getOrGenerateLesson(id, sectionId);
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
