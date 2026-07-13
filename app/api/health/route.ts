import { NextResponse } from "next/server";
import {
  apiCredsAvailable,
  canLaunchLogin,
  claudeCliPath,
  isServerless,
  MODEL,
  provider,
} from "@/lib/anthropic";

export async function GET() {
  const p = provider();
  return NextResponse.json({
    provider: p,
    has_credentials: p !== "none",
    api_key: apiCredsAvailable(),
    claude_cli: !!claudeCliPath(),
    can_login: canLaunchLogin(),
    serverless: isServerless(),
    model: p === "claude-code" && !process.env.KIWI_MODEL ? "your Claude Code default" : MODEL,
  });
}
