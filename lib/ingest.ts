import path from "path";
import { getDb, uid } from "./db";
import { isImage, transcribeImage } from "./vision";

// Ingestion: turn ANY uploaded file into study-ready text, then chunk it.
//
//   Documents  (pdf, docx, pptx, xlsx, odt, odp, ods, rtf, epub, html, csv) → officeparser
//   Images     (png, jpg, gif, webp, heic…)                                 → Claude vision transcription
//   Notebooks  (.ipynb)                                                     → markdown + code cells
//   Data       (json, xml, yaml, tsv…)                                      → pretty-printed text
//   Text/code  (md, txt, py, ts, java, sql, …)                              → passthrough
//   Anything else                                                           → decoded if it's really text,
//                                                                             otherwise a clear error

// Formats officeparser can parse (its SupportedFileType union).
type OfficeFileType =
  | "docx" | "pptx" | "xlsx" | "odt" | "odp" | "ods"
  | "pdf" | "rtf" | "md" | "html" | "csv" | "epub";

const OFFICE_BY_EXT: Record<string, OfficeFileType> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".pptx": "pptx",
  ".xlsx": "xlsx",
  ".odt": "odt",
  ".odp": "odp",
  ".ods": "ods",
  ".rtf": "rtf",
  ".epub": "epub",
  ".csv": "csv",
};

// Pre-2007 binary Office formats have no open parser — tell the user how to fix it.
const LEGACY_OFFICE: Record<string, string> = {
  ".doc": "Word 97–2003",
  ".ppt": "PowerPoint 97–2003",
  ".xls": "Excel 97–2003",
};

// Files that are already plain text — no parsing needed, just decode.
const TEXT_EXTS = new Set([
  ".txt", ".md", ".markdown", ".mdx", ".rst", ".org", ".tex", ".bib", ".log",
  ".json", ".jsonl", ".ndjson", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env",
  ".tsv", ".srt", ".vtt",
  ".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".h", ".cpp", ".hpp", ".cs", ".php", ".pl", ".lua", ".r", ".m", ".scala", ".sh", ".bash",
  ".zsh", ".ps1", ".sql", ".graphql", ".proto", ".css", ".scss", ".less", ".vue", ".svelte",
]);

/** Heuristic: does this buffer look like human-readable text rather than binary? */
function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 4096);
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false; // NUL → binary
    // Control characters outside tab/newline/carriage-return/escape.
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious++;
  }
  return suspicious / sample.length < 0.1;
}

/** Jupyter notebooks: keep markdown prose and source code, drop outputs/base64. */
function extractNotebook(raw: string): string {
  const nb = JSON.parse(raw);
  const parts: string[] = [];
  for (const cell of nb.cells ?? []) {
    const src = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? "");
    if (!src.trim()) continue;
    if (cell.cell_type === "markdown") parts.push(src);
    else if (cell.cell_type === "code") parts.push("```\n" + src + "\n```");
  }
  return parts.join("\n\n");
}

/** HTML → text (officeparser handles .html files; this covers inline/other cases). */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export async function extractText(
  filename: string,
  mime: string,
  buf: Buffer
): Promise<{ text: string; via: string }> {
  const ext = path.extname(filename).toLowerCase();

  // 1. Images → vision transcription.
  if (isImage(filename, mime)) {
    return { text: await transcribeImage(filename, mime, buf), via: "vision transcription" };
  }

  // 2. Jupyter notebooks.
  if (ext === ".ipynb") {
    try {
      return { text: extractNotebook(buf.toString("utf-8")), via: "notebook" };
    } catch {
      return { text: buf.toString("utf-8"), via: "text" };
    }
  }

  // 3. Legacy binary Office formats — actionable error rather than garbage.
  if (LEGACY_OFFICE[ext]) {
    throw new Error(
      `${LEGACY_OFFICE[ext]} files can't be read directly. Open it and "Save As" the modern format (.${ext === ".doc" ? "docx" : ext === ".ppt" ? "pptx" : "xlsx"}) or export to PDF, then upload that.`
    );
  }

  // 4. Rich documents, spreadsheets, slides, ebooks.
  const officeType = OFFICE_BY_EXT[ext] ?? (mime === "application/pdf" ? "pdf" : undefined);
  if (officeType) {
    const { parseOffice } = await import("officeparser");
    try {
      const ast = await parseOffice(buf, { fileType: officeType });
      const text = typeof ast?.toText === "function" ? ast.toText() : "";
      if (text?.trim()) return { text, via: officeType };
    } catch {
      // fall through to the PDF-specific parser below
    }
    // unpdf is a stronger PDF text extractor — use it as the PDF fallback.
    if (officeType === "pdf") {
      const { extractText: pdfExtract } = await import("unpdf");
      const { text } = await pdfExtract(new Uint8Array(buf), { mergePages: true });
      const merged = Array.isArray(text) ? text.join("\n\n") : text;
      if (merged?.trim()) return { text: merged, via: "pdf" };
      throw new Error(
        "This PDF has no extractable text (it's probably a scan). Export the pages as images and upload those — Kiwi reads images with vision."
      );
    }
    throw new Error(`Couldn't extract any text from this ${officeType.toUpperCase()} file.`);
  }

  // 5. HTML.
  if (ext === ".htm" || ext === ".html" || mime === "text/html") {
    return { text: stripHtml(buf.toString("utf-8")), via: "html" };
  }

  // 6. Known text/code formats.
  if (TEXT_EXTS.has(ext) || mime.startsWith("text/")) {
    return { text: buf.toString("utf-8"), via: "text" };
  }

  // 7. Unknown extension: accept it if it's genuinely text.
  if (looksLikeText(buf)) {
    return { text: buf.toString("utf-8"), via: "text" };
  }

  throw new Error(
    `Kiwi can't read ${ext || "this file type"} yet. It handles documents (PDF, Word, PowerPoint, Excel, Pages exports), images, ebooks, notebooks, and any text or code file.`
  );
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
): Promise<{ documentId: string; charCount: number; chunkCount: number; via: string }> {
  const { text, via } = await extractText(filename, mime, buf);
  if (!text || text.trim().length < 40) {
    throw new Error(`Couldn't find readable content in ${filename}`);
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

  return { documentId, charCount: text.length, chunkCount: chunks.length, via };
}
