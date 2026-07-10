import { NextResponse } from "next/server";
import { execFile } from "child_process";

// Opens the native macOS folder picker (Finder's "choose folder" dialog) on
// the machine running the server. Works because Kiwi is local-first — the
// server and the browser are the same computer. On other platforms the client
// falls back to typing the path.

export const maxDuration = 300;

function chooseFolderMac(): Promise<{ path?: string; canceled?: boolean }> {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      [
        "-e",
        'tell application "System Events" to activate',
        "-e",
        'POSIX path of (choose folder with prompt "Choose your Obsidian vault (or any notes folder)")',
      ],
      { timeout: 180_000 },
      (err, stdout, stderr) => {
        if (err) {
          // Exit code 1 with "User canceled" means the dialog was dismissed.
          if (`${stderr}${err.message}`.includes("canceled")) resolve({ canceled: true });
          else reject(new Error(stderr.trim() || err.message));
          return;
        }
        resolve({ path: stdout.trim() });
      }
    );
  });
}

export async function POST() {
  if (process.platform !== "darwin") {
    return NextResponse.json(
      { error: "Native folder picker is only available on macOS — type the path instead." },
      { status: 501 }
    );
  }
  try {
    const result = await chooseFolderMac();
    if (result.canceled) return NextResponse.json({ canceled: true });
    return NextResponse.json({ path: result.path });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Folder picker failed" },
      { status: 500 }
    );
  }
}
