import { NextRequest, NextResponse } from "next/server";
import { startLogin, submitLoginCode } from "@/lib/claude-auth";

export const maxDuration = 300;

// POST            → start the login, return the OAuth URL for the UI to open.
// POST { code }   → finish it with the code the browser handed back.

export async function POST(req: NextRequest) {
  let body: { code?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body = "start login"
  }

  try {
    if (body.code?.trim()) {
      const status = await submitLoginCode(body.code);
      return NextResponse.json({ ok: true, ...status });
    }
    const { url } = await startLogin();
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
