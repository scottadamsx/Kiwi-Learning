import { NextResponse } from "next/server";
import { apiCredsAvailable, claudeCliPath, MODEL, provider } from "@/lib/anthropic";

export async function GET() {
  const p = provider();
  return NextResponse.json({
    provider: p,
    has_credentials: p !== "none",
    api_key: apiCredsAvailable(),
    claude_cli: !!claudeCliPath(),
    model: p === "claude-code" && !process.env.KIWI_MODEL ? "your Claude Code default" : MODEL,
  });
}
