import { NextResponse } from "next/server";
import { hasCredentials, MODEL } from "@/lib/anthropic";

export async function GET() {
  return NextResponse.json({ has_credentials: hasCredentials(), model: MODEL });
}
