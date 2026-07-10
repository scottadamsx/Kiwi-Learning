import { getDb, uid } from "./db";
import { generateJson } from "./anthropic";
import { exclusionPromptBlock, listExclusions, matchesExclusion } from "./exclusions";
import type { Chunk } from "./types";

// The concept-extraction pass: read the uploads and produce the structured
// outline — modules (major topic areas) containing sections (learnable units),
// with importance weights, prerequisite edges, and chunk tags. This outline is
// the backbone every lesson, card, question, and the readiness meter hangs on.

const MAX_OUTLINE_INPUT_CHARS = 300_000;

interface OutlineSection {
  name: string;
  description: string;
  importance: "critical" | "moderate" | "minor";
  chunk_numbers: number[];
  prerequisites: string[];
}
interface OutlineModule {
  name: string;
  description: string;
  sections: OutlineSection[];
}
interface OutlineResult {
  modules: OutlineModule[];
}

const OUTLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["modules"],
  properties: {
    modules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "sections"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          sections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "description", "importance", "chunk_numbers", "prerequisites"],
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                importance: { type: "string", enum: ["critical", "moderate", "minor"] },
                chunk_numbers: { type: "array", items: { type: "integer" } },
                prerequisites: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
} as const;

const IMPORTANCE: Record<string, 1 | 2 | 3> = { minor: 1, moderate: 2, critical: 3 };

export async function buildOutline(notebookId: string): Promise<void> {
  const db = getDb();
  const chunks = db
    .prepare(
      `SELECT c.* , d.filename FROM chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.notebook_id = ? ORDER BY d.created_at, c.idx`
    )
    .all(notebookId) as (Chunk & { filename: string })[];
  if (chunks.length === 0) throw new Error("No documents to analyze");

  // Number every chunk so the model can tag sections to source material.
  let budget = MAX_OUTLINE_INPUT_CHARS;
  const numbered: string[] = [];
  const included: (Chunk & { filename: string })[] = [];
  for (const c of chunks) {
    if (budget - c.text.length < 0) break;
    numbered.push(`<chunk n="${numbered.length + 1}" document="${c.filename}">\n${c.text}\n</chunk>`);
    included.push(c);
    budget -= c.text.length;
  }

  const outline = await generateJson<OutlineResult>({
    system:
      "You are the curriculum architect for an adaptive study engine. You read a learner's uploaded material and produce a faithful, well-structured course outline. You never invent topics that are not in the material.",
    prompt: `Read the source material below and organize it into a course outline.

Rules:
- Group the material into 2-6 MODULES (major topic areas), each containing 2-8 SECTIONS.
- A section is one learnable unit: a coherent idea a student can study, practice, and master in one sitting. Name sections as concrete topics ("Photosynthesis light reactions"), not chapter labels ("Chapter 3").
- Every section must be grounded in the material. Set chunk_numbers to the chunks (by their n attribute) that cover it — at least one per section.
- importance reflects how much the section should count toward exam readiness: critical for load-bearing ideas, moderate for standard content, minor for peripheral detail.
- prerequisites lists the exact names of OTHER sections (from this same outline) a student should understand first. Use [] when there are none. Only include real conceptual dependencies.
- Order modules and sections in the sequence a student should learn them.
${exclusionPromptBlock(listExclusions(notebookId, "section"), "topics/sections")}
${numbered.join("\n\n")}`,
    schema: OUTLINE_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 16000,
  });

  if (!outline.modules?.length) throw new Error("Outline extraction returned no modules");

  // Persist: modules, sections, chunk tags, prerequisite edges.
  const insertModule = db.prepare(
    "INSERT INTO modules (id, notebook_id, name, description, position) VALUES (?, ?, ?, ?, ?)"
  );
  const insertSection = db.prepare(
    `INSERT INTO sections (id, notebook_id, module_id, name, description, importance, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertTag = db.prepare(
    "INSERT OR IGNORE INTO chunk_sections (chunk_id, section_id) VALUES (?, ?)"
  );
  const insertEdge = db.prepare(
    "INSERT OR IGNORE INTO section_edges (notebook_id, from_section, to_section) VALUES (?, ?, ?)"
  );

  const excludedSections = listExclusions(notebookId, "section");

  db.transaction(() => {
    // Rebuild the outline from scratch on reprocess.
    db.prepare("DELETE FROM modules WHERE notebook_id = ?").run(notebookId);
    db.prepare("DELETE FROM sections WHERE notebook_id = ?").run(notebookId);

    const idByName = new Map<string, string>();
    const prereqs: { section: string; prereqName: string }[] = [];

    outline.modules.forEach((m, mi) => {
      const moduleId = uid("mod");
      insertModule.run(moduleId, notebookId, m.name, m.description ?? "", mi);
      m.sections.forEach((s, si) => {
        const sectionId = uid("sec");
        insertSection.run(
          sectionId,
          notebookId,
          moduleId,
          s.name,
          s.description,
          IMPORTANCE[s.importance] ?? 2,
          si
        );
        // A previously-rejected topic that reappears stays excluded.
        if (matchesExclusion(s.name, excludedSections)) {
          db.prepare("UPDATE sections SET excluded = 1 WHERE id = ?").run(sectionId);
        }
        idByName.set(s.name.toLowerCase(), sectionId);
        for (const n of s.chunk_numbers ?? []) {
          const chunk = included[n - 1];
          if (chunk) insertTag.run(chunk.id, sectionId);
        }
        for (const p of s.prerequisites ?? []) prereqs.push({ section: sectionId, prereqName: p });
      });
    });

    for (const { section, prereqName } of prereqs) {
      const from = idByName.get(prereqName.toLowerCase());
      if (from && from !== section) insertEdge.run(notebookId, from, section);
    }
  })();
}
