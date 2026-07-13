import MiniSearch from "minisearch";
import { getDb } from "./db";
import type { Chunk } from "./types";

// Grounded retrieval over a notebook's chunks. BM25-style keyword search via
// MiniSearch, built per-notebook and cached in-process. Every generation and
// chat call retrieves through here so output stays grounded in the uploads.

interface IndexedChunk {
  id: string;
  text: string;
  document_id: string;
}

const cache = new Map<string, { index: MiniSearch<IndexedChunk>; count: number }>();

function buildIndex(notebookId: string): MiniSearch<IndexedChunk> {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, text, document_id FROM chunks WHERE notebook_id = ?")
    .all(notebookId) as IndexedChunk[];
  const index = new MiniSearch<IndexedChunk>({
    fields: ["text"],
    storeFields: ["text", "document_id"],
    searchOptions: { boost: {}, fuzzy: 0.15, prefix: true },
  });
  index.addAll(rows);
  const cached = { index, count: rows.length };
  cache.set(notebookId, cached);
  return index;
}

export function invalidateIndex(notebookId: string) {
  cache.delete(notebookId);
}

export function searchChunks(notebookId: string, query: string, limit = 8): Chunk[] {
  const db = getDb();
  const currentCount = (
    db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE notebook_id = ?").get(notebookId) as {
      n: number;
    }
  ).n;
  const cached = cache.get(notebookId);
  const index = cached && cached.count === currentCount ? cached.index : buildIndex(notebookId);

  const hits = index.search(query).slice(0, limit);
  if (hits.length === 0) {
    // Fall back to the first chunks so answers are still grounded in something.
    return db
      .prepare("SELECT * FROM chunks WHERE notebook_id = ? ORDER BY idx LIMIT ?")
      .all(notebookId, limit) as Chunk[];
  }
  const byId = db.prepare("SELECT * FROM chunks WHERE id = ?");
  return hits.map((h) => byId.get(h.id) as Chunk).filter(Boolean);
}

/** Chunks tagged to a section during outline extraction (plus keyword fallback). */
export function chunksForSection(notebookId: string, sectionId: string, limit = 10): Chunk[] {
  const db = getDb();
  const tagged = db
    .prepare(
      `SELECT c.* FROM chunks c
       JOIN chunk_sections cs ON cs.chunk_id = c.id
       WHERE cs.section_id = ? ORDER BY c.idx LIMIT ?`
    )
    .all(sectionId, limit) as Chunk[];
  if (tagged.length > 0) return tagged;

  const section = db
    .prepare("SELECT name, description FROM sections WHERE id = ?")
    .get(sectionId) as { name: string; description: string } | undefined;
  if (!section) return [];
  return searchChunks(notebookId, `${section.name} ${section.description}`, limit);
}

export function formatSources(
  chunks: Chunk[],
  clip = 1800 // token efficiency: full 2.4k chunks × 8 per question adds up fast
): {
  block: string;
  sources: { n: number; chunk_id: string; document: string; excerpt: string }[];
} {
  const db = getDb();
  const docName = db.prepare("SELECT filename FROM documents WHERE id = ?");
  const sources = chunks.map((c, i) => {
    const doc = docName.get(c.document_id) as { filename: string } | undefined;
    return {
      n: i + 1,
      chunk_id: c.id,
      document: doc?.filename ?? "unknown",
      excerpt: c.text.slice(0, 200),
    };
  });
  const block = chunks
    .map(
      (c, i) =>
        `<source n="${i + 1}" document="${sources[i].document}">\n${c.text.slice(0, clip)}\n</source>`
    )
    .join("\n\n");
  return { block, sources };
}
