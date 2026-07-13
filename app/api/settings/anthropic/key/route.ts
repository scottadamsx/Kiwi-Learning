import { NextRequest, NextResponse } from "next/server";
import { getStoredApiKey, setStoredApiKey, testConnection } from "@/lib/anthropic";

export const maxDuration = 300;

// Save an API key pasted into the Connectors UI (no terminal needed), then
// immediately test it. Stored in the local settings table.

export async function POST(req: NextRequest) {
  const { key } = await req.json();
  if (!key || typeof key !== "string" || !key.trim()) {
    return NextResponse.json({ error: "Paste your API key first." }, { status: 400 });
  }
  if (!/^sk-ant-/.test(key.trim())) {
    return NextResponse.json(
      { error: "That doesn't look like an Anthropic API key (they start with sk-ant-)." },
      { status: 400 }
    );
  }
  // Try the new key without disturbing the current connection until it proves
  // out — a broken key must never hijack a working Claude Code login.
  const previous = getStoredApiKey();
  setStoredApiKey(key.trim());
  const result = await testConnection();
  if (!result.ok) {
    setStoredApiKey(previous); // roll back to whatever worked before
    return NextResponse.json(
      { ok: false, error: `That key didn't work: ${result.error}` },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  setStoredApiKey(null);
  return NextResponse.json({ ok: true });
}
