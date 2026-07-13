import { getDb, uid } from "./db";
import { generateJson, generateText } from "./anthropic";
import { buildOutline } from "./outline";
import { chunksForSection } from "./retrieval";
import { newCardState, serializeCard } from "./fsrs";
import { weakestSections } from "./mastery";
import { exclusionPromptBlock, listExclusions, matchesExclusion } from "./exclusions";
import type { McqPayload, OpenPayload, QuizItem, Section } from "./types";

// Content generation. All of it is grounded: retrieve the relevant source
// passages, then generate against them so output stays factual.

function groundingBlock(notebookId: string, sectionId: string, maxChunks = 4, clip = 1400): string {
  return chunksForSection(notebookId, sectionId, maxChunks)
    .map((c, i) => `<source n="${i + 1}">\n${c.text.slice(0, clip)}\n</source>`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Flashcards — generated per section in batches, scheduled with FSRS.

interface CardGen {
  section_name: string;
  front: string;
  back: string;
}

const CARDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section_name", "front", "back"],
        properties: {
          section_name: { type: "string" },
          front: { type: "string" },
          back: { type: "string" },
        },
      },
    },
  },
} as const;

export async function generateCardsForSections(notebookId: string, sections: Section[]) {
  const db = getDb();
  const excludedCards = listExclusions(notebookId, "card");
  const active = sections.filter((s) => !s.excluded);
  const batches: Section[][] = [];
  for (let i = 0; i < active.length; i += 6) batches.push(active.slice(i, i + 6));

  for (const batch of batches) {
    const sectionBlocks = batch
      .map(
        (s) =>
          `## Section: ${s.name}\n${s.description}\n\nSource material:\n${groundingBlock(notebookId, s.id, 3, 1200)}`
      )
      .join("\n\n---\n\n");

    const result = await generateJson<{ cards: CardGen[] }>({
      system:
        "You write flashcards for spaced-repetition study. Cards test retrieval of one idea each, are answerable from the source material alone, and never invent facts.",
      prompt: `Write 3-5 flashcards for EACH section below.

Rules:
- One idea per card. The front is a question or cue that forces recall (not recognition); the back is a short, complete answer.
- Mix card types: definitions, why/how questions, applications, contrasts.
- Ground every card in the section's source material.
- Use Markdown; use $...$ LaTeX for math if the material has any.
- Set section_name to the exact section name shown.
${exclusionPromptBlock(excludedCards, "flashcards")}
${sectionBlocks}`,
      schema: CARDS_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 16000,
      tier: "content",
      effort: "medium",
      task: "cards",
    });

    const insert = db.prepare(
      "INSERT INTO cards (id, notebook_id, section_id, front, back, fsrs_state, due) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const byName = new Map(batch.map((s) => [s.name.toLowerCase(), s.id]));
    const now = new Date();
    db.transaction(() => {
      for (const c of result.cards ?? []) {
        const sectionId = byName.get(c.section_name.toLowerCase());
        if (!sectionId || !c.front || !c.back) continue;
        // Safety net: drop regenerated near-duplicates of rejected cards.
        if (matchesExclusion(c.front, excludedCards)) continue;
        const state = newCardState(now);
        insert.run(
          uid("card"),
          notebookId,
          sectionId,
          c.front,
          c.back,
          serializeCard(state),
          state.due.toISOString()
        );
      }
    })();
  }
}

// ---------------------------------------------------------------------------
// Processing pipeline: outline → flashcards. Runs in the background after the
// user clicks "Build study set"; the client polls notebook status.

export async function processNotebook(notebookId: string): Promise<void> {
  const db = getDb();
  const setStatus = (status: string, message: string | null) =>
    db
      .prepare("UPDATE notebooks SET status = ?, status_message = ? WHERE id = ?")
      .run(status, message, notebookId);

  try {
    setStatus("processing", "Reading your material and mapping modules & sections…");
    await buildOutline(notebookId);

    setStatus("processing", "Writing flashcards for every section…");
    const sections = db
      .prepare("SELECT * FROM sections WHERE notebook_id = ?")
      .all(notebookId) as Section[];
    db.prepare("DELETE FROM cards WHERE notebook_id = ?").run(notebookId);
    await generateCardsForSections(notebookId, sections);

    setStatus("ready", null);
  } catch (err) {
    setStatus("error", err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Lessons — generated on demand per section, cached.

export async function getOrGenerateLesson(notebookId: string, sectionId: string): Promise<string> {
  const db = getDb();
  const cached = db.prepare("SELECT content_md FROM lessons WHERE section_id = ?").get(sectionId) as
    | { content_md: string }
    | undefined;
  if (cached) return cached.content_md;

  const section = db.prepare("SELECT * FROM sections WHERE id = ?").get(sectionId) as
    | Section
    | undefined;
  if (!section) throw new Error("Section not found");

  const prereqs = db
    .prepare(
      `SELECT s.name FROM section_edges e JOIN sections s ON s.id = e.from_section
       WHERE e.to_section = ?`
    )
    .all(sectionId) as { name: string }[];

  // Personalization: if an Obsidian vault is connected, pull the learner's own
  // notes related to this topic so the lesson meets them where they are.
  const { learnerContext } = await import("./vault");
  const personal = learnerContext(`${section.name} ${section.description}`);

  const md = await generateText({
    system:
      "You are a patient, precise tutor writing a lesson for an adaptive study app. Everything you teach must come from the provided source material — cite sources inline as [1], [2] matching the source numbers. Never invent facts.",
    prompt: `Write a lesson on "${section.name}".

Section summary: ${section.description}
${prereqs.length ? `The student has already covered: ${prereqs.map((p) => p.name).join(", ")}.` : ""}
${
  personal
    ? `\nThe learner's own notes related to this topic (from their personal knowledge base) are below. Use them ONLY to personalize: connect new ideas to things they've already written about, skim past what their notes show they already understand, and gently correct anything their notes get wrong. Do NOT treat their notes as source material for facts.\n${personal}\n`
    : ""
}

Structure (use Markdown headings):
1. A plain-language explanation of the core idea — build intuition before formality.
2. One or two worked examples pulled from or built directly on the source material.
3. Where a visual genuinely helps, include ONE Mermaid diagram in a \`\`\`mermaid code block (flowchart or mindmap).
4. A short "Key takeaways" list.

Do NOT write practice questions — the app adds a graded check after the lesson.

Use $...$ / $$...$$ LaTeX for math. Cite source numbers inline like [1]. Keep it focused: this is one sitting's worth of study, not a textbook chapter.

Source material:
${groundingBlock(notebookId, sectionId, 6, 2400)}`,
    maxTokens: 8000,
    tier: "content",
    effort: "medium",
    task: "lesson",
  });

  db.prepare("INSERT OR REPLACE INTO lessons (section_id, content_md) VALUES (?, ?)").run(
    sectionId,
    md
  );
  return md;
}

// ---------------------------------------------------------------------------
// Lesson check — the graded questions at the end of a lesson. This is what
// makes reading a lesson actually move your mastery: retrieval practice, with
// instant right/wrong feedback and an explanation. Generated once per section
// and cached, so re-opening a lesson is free.

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options", "answer_index", "explanation"],
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer_index: { type: "integer" },
          explanation: { type: "string" },
        },
      },
    },
  },
} as const;

export async function getOrGenerateLessonCheck(
  notebookId: string,
  sectionId: string
): Promise<QuizItem[]> {
  const db = getDb();

  const cached = db
    .prepare(
      "SELECT id, section_id, type, payload FROM quiz_items WHERE section_id = ? AND source = 'lesson' ORDER BY id"
    )
    .all(sectionId) as { id: string; section_id: string; type: string; payload: string }[];
  if (cached.length > 0) {
    return cached.map((r) => ({
      id: r.id,
      notebook_id: notebookId,
      section_id: r.section_id,
      type: r.type as QuizItem["type"],
      payload: JSON.parse(r.payload),
    }));
  }

  const section = db.prepare("SELECT * FROM sections WHERE id = ?").get(sectionId) as
    | Section
    | undefined;
  if (!section) throw new Error("Section not found");

  const result = await generateJson<{
    questions: {
      question: string;
      options: string[];
      answer_index: number;
      explanation: string;
    }[];
  }>({
    system:
      "You write retrieval-practice questions for an adaptive study engine. Every question is answerable from the source material alone. Distractors are genuinely plausible — grounded in real misconceptions — never obvious throwaways.",
    prompt: `Write 4 multiple-choice questions checking whether the student understood the lesson on "${section.name}".

${section.description}

Rules:
- Exactly 4 options each; one correct (answer_index 0-3).
- Test understanding and application, not trivia or word-matching.
- Each distractor should reflect a mistake a real student would make.
- explanation: one or two sentences saying WHY the correct answer is right (and, where useful, why the tempting wrong one isn't). The student sees this immediately after answering.
- Use $...$ LaTeX for math; keep options short.

Source material:
${groundingBlock(notebookId, sectionId, 4, 1600)}`,
    schema: CHECK_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 6000,
    tier: "content",
    effort: "medium",
    task: "lesson-check",
  });

  const insert = db.prepare(
    "INSERT INTO quiz_items (id, notebook_id, section_id, type, payload, source) VALUES (?, ?, ?, 'mcq', ?, 'lesson')"
  );
  const items: QuizItem[] = [];
  db.transaction(() => {
    for (const q of result.questions ?? []) {
      if (!q.question || !q.options || q.options.length < 2) continue;
      const payload: McqPayload = {
        question: q.question,
        options: q.options,
        answer_index: Math.max(0, Math.min(q.answer_index, q.options.length - 1)),
        explanation: q.explanation ?? "",
      };
      const id = uid("qi");
      insert.run(id, notebookId, sectionId, JSON.stringify(payload));
      items.push({ id, notebook_id: notebookId, section_id: sectionId, type: "mcq", payload });
    }
  })();

  if (items.length === 0) throw new Error("Couldn't generate check questions for this lesson");
  return items;
}

// ---------------------------------------------------------------------------
// Quiz generation — targets the weakest sections (interleaved), mixing MCQs
// with genuinely plausible distractors, short answers, and one long answer
// graded on understanding.

interface QuizGenItem {
  section_name: string;
  type: "mcq" | "short" | "long";
  question: string;
  options: string[]; // empty for open items
  answer_index: number; // -1 for open items
  explanation: string; // "" for open items
  reference_answer: string; // "" for mcq
  key_ideas: string[]; // [] for mcq
}

const QUIZ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "section_name",
          "type",
          "question",
          "options",
          "answer_index",
          "explanation",
          "reference_answer",
          "key_ideas",
        ],
        properties: {
          section_name: { type: "string" },
          type: { type: "string", enum: ["mcq", "short", "long"] },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer_index: { type: "integer" },
          explanation: { type: "string" },
          reference_answer: { type: "string" },
          key_ideas: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export async function generateQuiz(notebookId: string): Promise<QuizItem[]> {
  const db = getDb();
  const targets = weakestSections(notebookId, 4);
  if (targets.length === 0) throw new Error("No sections yet — build the study set first");

  const sectionBlocks = targets
    .map(
      (t) =>
        `## Section: ${t.name} (current mastery ${(t.mastery * 100).toFixed(0)}%)\nSource material:\n${groundingBlock(notebookId, t.section_id, 3, 1200)}`
    )
    .join("\n\n---\n\n");

  const result = await generateJson<{ items: QuizGenItem[] }>({
    system:
      "You write assessment items for an adaptive study engine. Every item is answerable from the source material alone. Distractors must be genuinely plausible — grounded in likely misconceptions — never obvious throwaways.",
    prompt: `Create a practice quiz over the sections below (the student's weakest). Interleave sections rather than grouping.

Produce:
- One multiple-choice question PER section: exactly 4 options, one correct (set answer_index 0-3), each distractor reflecting a real misconception a student might hold. Include a one-sentence explanation of the correct answer. Set reference_answer "" and key_ideas [].
- TWO short-answer questions (1-3 sentence answers) on the two weakest sections. Set options [], answer_index -1, explanation "". Provide reference_answer and 2-3 key_ideas (the distinct ideas a full answer must express).
- ONE long-answer question on the single weakest section, requiring explanation or synthesis. Set options [], answer_index -1, explanation "". Provide a model reference_answer and 3-5 key_ideas.

Use $...$ LaTeX for math. Set section_name to the exact section name shown.
${exclusionPromptBlock(listExclusions(notebookId, "quiz"), "quiz questions")}
${sectionBlocks}`,
    schema: QUIZ_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 12000,
    tier: "content",
    effort: "medium",
    task: "quiz",
  });

  const byName = new Map(targets.map((t) => [t.name.toLowerCase(), t.section_id]));
  const insert = db.prepare(
    "INSERT INTO quiz_items (id, notebook_id, section_id, type, payload) VALUES (?, ?, ?, ?, ?)"
  );
  const items: QuizItem[] = [];
  const excludedQuiz = listExclusions(notebookId, "quiz");
  db.transaction(() => {
    for (const it of result.items ?? []) {
      const sectionId = byName.get(it.section_name.toLowerCase());
      if (!sectionId || !it.question) continue;
      if (matchesExclusion(it.question, excludedQuiz)) continue;
      let payload: McqPayload | OpenPayload;
      if (it.type === "mcq") {
        if (!it.options || it.options.length < 2 || it.answer_index < 0) continue;
        payload = {
          question: it.question,
          options: it.options,
          answer_index: Math.min(it.answer_index, it.options.length - 1),
          explanation: it.explanation ?? "",
        };
      } else {
        payload = {
          question: it.question,
          reference_answer: it.reference_answer ?? "",
          key_ideas: it.key_ideas ?? [],
        };
      }
      const id = uid("qi");
      insert.run(id, notebookId, sectionId, it.type, JSON.stringify(payload));
      items.push({ id, notebook_id: notebookId, section_id: sectionId, type: it.type, payload });
    }
  })();

  if (items.length === 0) throw new Error("Quiz generation produced no usable items");
  return items;
}
