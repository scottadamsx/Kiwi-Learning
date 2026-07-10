import { NextResponse } from "next/server";
import { testConnection } from "@/lib/anthropic";

export const maxDuration = 300;

export async function POST() {
  const result = await testConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
