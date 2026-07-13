import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { getClient, claudeCliPath, modelFor, provider } from "./anthropic";

// Image → text. Kiwi accepts screenshots, photos of whiteboards/textbook pages,
// scanned handouts, and diagrams by having Claude transcribe them into study
// material. Works on both provider paths:
//   api          — image content block on the Messages API.
//   claude-code  — write a temp file and let the CLI's Read tool see it.

const PROMPT = `Transcribe this image into clean Markdown for a student's study notes.

- Transcribe ALL text verbatim (headings, body, labels, captions, handwriting).
- Render math as $...$ / $$...$$ LaTeX and tables as Markdown tables.
- For diagrams, charts, or figures: describe what it shows and the relationships it depicts, in enough detail to study from.
- Output ONLY the transcription — no preamble, no "here is", no commentary.
- If the image contains no readable content, output exactly: NO_CONTENT`;

const MIME_BY_EXT: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export function isImage(filename: string, mime: string): boolean {
  if (mime.startsWith("image/")) return true;
  return path.extname(filename).toLowerCase() in MIME_BY_EXT;
}

function normalizedMime(filename: string, mime: string): string {
  const byExt = MIME_BY_EXT[path.extname(filename).toLowerCase()];
  if (byExt) return byExt;
  // Claude accepts png/jpeg/gif/webp only; anything else gets sent as png and
  // will error clearly rather than silently producing garbage.
  return mime.startsWith("image/") ? mime : "image/png";
}

function transcribeViaCli(filename: string, buf: Buffer): Promise<string> {
  const cli = claudeCliPath();
  if (!cli) return Promise.reject(new Error("Claude Code CLI not found"));

  const tmp = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "kiwi-img-")),
    path.basename(filename).replace(/[^\w.-]/g, "_")
  );
  fs.writeFileSync(tmp, buf);

  const model = modelFor("content");
  const args = [
    "-p",
    "--output-format",
    "json",
    "--max-turns",
    "4",
    "--allowedTools",
    "Read",
    ...(model ? ["--model", model] : []),
  ];

  return new Promise((resolve, reject) => {
    const child = execFile(
      cli,
      args,
      { maxBuffer: 32 * 1024 * 1024, timeout: 300_000 },
      (err, stdout, stderr) => {
        fs.rm(path.dirname(tmp), { recursive: true, force: true }, () => {});
        if (err && !stdout) {
          reject(new Error(`Image transcription failed: ${(stderr || err.message).slice(0, 300)}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.is_error || parsed.subtype !== "success") {
            reject(new Error(String(parsed.result ?? "transcription error").slice(0, 300)));
            return;
          }
          resolve(String(parsed.result ?? ""));
        } catch {
          reject(new Error("Couldn't parse transcription output"));
        }
      }
    );
    child.stdin?.write(`Read the image file at ${tmp}\n\n${PROMPT}`);
    child.stdin?.end();
  });
}

async function transcribeViaApi(filename: string, mime: string, buf: Buffer): Promise<string> {
  const response = await getClient().messages.create({
    model: modelFor("content") ?? "claude-opus-4-8",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: normalizedMime(filename, mime) as "image/png",
              data: buf.toString("base64"),
            },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function transcribeImage(
  filename: string,
  mime: string,
  buf: Buffer
): Promise<string> {
  const p = provider();
  if (p === "none") {
    throw new Error(
      "Images need a Claude connection to transcribe. Log into Claude Code (`claude` → /login) or add an API key."
    );
  }
  const text = p === "api"
    ? await transcribeViaApi(filename, mime, buf)
    : await transcribeViaCli(filename, buf);

  const cleaned = text.trim();
  if (!cleaned || cleaned === "NO_CONTENT") {
    throw new Error("No readable text or diagram content found in this image");
  }
  return cleaned;
}
