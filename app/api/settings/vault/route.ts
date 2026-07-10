import { NextRequest, NextResponse } from "next/server";
import { clearVaultPath, setVaultPath, vaultStatus } from "@/lib/vault";

export async function GET() {
  return NextResponse.json(vaultStatus());
}

export async function POST(req: NextRequest) {
  const { path: vaultPath } = await req.json();
  if (!vaultPath || typeof vaultPath !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  const result = setVaultPath(vaultPath);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(vaultStatus());
}

export async function DELETE() {
  clearVaultPath();
  return NextResponse.json({ connected: false });
}
