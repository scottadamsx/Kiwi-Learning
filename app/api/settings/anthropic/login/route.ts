import { NextResponse } from "next/server";
import { launchClaudeLogin } from "@/lib/anthropic";

// Optional local convenience: open Terminal and start `claude` so the user can
// sign in with their Claude Code subscription instead of pasting a key. Only
// works when Kiwi runs on the user's own Mac.

export async function POST() {
  try {
    await launchClaudeLogin();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
