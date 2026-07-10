import { NextRequest, NextResponse } from "next/server";
import { gradeAndRecord } from "@/lib/grading";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { item_id, selected_index, text } = await req.json();
  if (!item_id) return NextResponse.json({ error: "item_id required" }, { status: 400 });
  try {
    const result = await gradeAndRecord(item_id, { selected_index, text });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
