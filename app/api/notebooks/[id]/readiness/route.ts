import { NextRequest, NextResponse } from "next/server";
import { computeReadiness } from "@/lib/mastery";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return NextResponse.json(computeReadiness(id));
}
