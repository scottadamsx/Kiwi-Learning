import { NextResponse } from "next/server";
import { authStatus, logout } from "@/lib/claude-auth";
import { claudeCliPath, isServerless } from "@/lib/anthropic";

// Who's signed in (Claude subscription), and sign out.

export async function GET() {
  const installed = !!claudeCliPath();
  if (!installed) {
    return NextResponse.json({
      installed: false,
      serverless: isServerless(),
      loggedIn: false,
    });
  }
  const status = await authStatus();
  return NextResponse.json({ installed: true, serverless: isServerless(), ...status });
}

export async function DELETE() {
  try {
    await logout();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
