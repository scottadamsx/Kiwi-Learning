import { getDb, uid } from "./db";

// Ingestion: parse an uploaded file to plain text, then chunk it.
// PDF via unpdf (serverless-friendly pdfjs build); md/txt pass through.

export async function extractText(filename: string, mime: string, buf: Buffer): Promise<string> {
  const lower = filename.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const { extractText: pdfExtract } = await import("unpdf");
    const { text } = await pdfExtract(new Uint8Array(buf), { mergePages: true });
    return Array.isArray(text) ? text.join("\n\n") : text;
  }
  // Markdown, plain text, and anything text-like.
  return buf.toString("utf-8");
}

/**
 * Paragraph-aware chunking: split on blank lines, pack paragraphs into
 * ~CHUNK_CHARS windows with one-paragraph overlap so ideas that straddle a
 * boundary stay retrievable.
 */
export function chunkText(text: string, chunkChars = 2400): string[] {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const p of paragraphs) {
    // A single huge paragraph gets hard-split.
    if (p.length > chunkChars) {
      if (current.length) {
        chunks.push(current.join("\n\n"));
        current = [];
        currentLen = 0;
      }
      for (let i = 0; i < p.length; i += chunkChars) {
        chunks.push(p.slice(i, i + chunkChars));
      }
      continue;
    }
    if (currentLen + p.length > chunkChars && current.length) {
      chunks.push(current.join("\n\n"));
      const overlap = current[current.length - 1];
      current = overlap.length < chunkChars / 3 ? [overlap] : [];
      currentLen = current.reduce((n, s) => n + s.length, 0);
    }
    current.push(p);
    currentLen += p.length;
  }
  if (current.length) chunks.push(current.join("\n\n"));
  return chunks.filter((c) => c.trim().length > 40);
}

export async function ingestDocument(
  notebookId: string,
  filename: string,
  mime: string,
  buf: Buffer
): Promise<{ documentId: string; charCount: number; chunkCount: number }> {
  const text = await extractText(filename, mime, buf);
  if (!text || text.trim().length < 40) {
    throw new Error(`Couldn't extract readable text from ${filename}`);
  }
  const db = getDb();
  const documentId = uid("doc");
  const chunks = chunkText(text);

  const insertDoc = db.prepare(
    "INSERT INTO documents (id, notebook_id, filename, mime, char_count) VALUES (?, ?, ?, ?, ?)"
  );
  const insertChunk = db.prepare(
    "INSERT INTO chunks (id, notebook_id, document_id, idx, text) VALUES (?, ?, ?, ?, ?)"
  );
  db.transaction(() => {
    insertDoc.run(documentId, notebookId, filename, mime, text.length);
    chunks.forEach((c, i) => insertChunk.run(uid("chk"), notebookId, documentId, i, c));
  })();

  return { documentId, charCount: text.length, chunkCount: chunks.length };
}
