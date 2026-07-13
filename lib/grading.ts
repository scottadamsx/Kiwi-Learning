import { getDb } from "./db";
import { generateJson } from "./anthropic";
import { chunksForSection } from "./retrieval";
import { applyBkt } from "./mastery";
import type { GradeResult, McqPayload, OpenPayload, QuizItem } from "./types";

// The understanding-based grading engine. Free-text answers are graded against
// the reference answer + decomposed key ideas (partial credit per idea), with
// misconception detection and formative feedback.
//
// Adaptive sampling (token efficiency): grade once first. A decisive score
// (0 or 5) is accepted as-is; a borderline score triggers additional
// independent samples, and disagreement flags the grade as low-confidence
// rather than presenting it as final. Every grade is formative — the rubric
// breakdown is always shown to the learner.

const MAX_SAMPLES = Math.max(1, Number(process.env.KIWI_GRADER_SAMPLES ?? 3));

interface GraderOutput {
  key_idea_coverage: { idea: string; covered: boolean; evidence: string }[];
  misconceptions: string[];
  score_0_to_5: number;
  feedback: string;
}

const GRADER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["key_idea_coverage", "misconceptions", "score_0_to_5", "feedback"],
  properties: {
    key_idea_coverage: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["idea", "covered", "evidence"],
        properties: {
          idea: { type: "string" },
          covered: { type: "boolean" },
          evidence: { type: "string" },
        },
      },
    },
    misconceptions: { type: "array", items: { type: "string" } },
    score_0_to_5: { type: "integer" },
    feedback: { type: "string" },
  },
} as const;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function gradeOpenAnswer(
  item: QuizItem,
  studentAnswer: string
): Promise<GradeResult> {
  const payload = item.payload as OpenPayload;
  const sources = chunksForSection(item.notebook_id, item.section_id, 2)
    .map((c) => c.text.slice(0, 900))
    .join("\n---\n");

  const prompt = `Grade this student answer on UNDERSTANDING, not string matching.

Question: ${payload.question}

Reference answer (full credit): ${payload.reference_answer}

Key ideas a complete answer must express:
${payload.key_ideas.map((k, i) => `${i + 1}. ${k}`).join("\n")}

Source material (ground truth):
${sources}

Student answer:
"""
${studentAnswer.slice(0, 4000)}
"""

Grade it:
- For each key idea, decide whether the student actually expressed it (paraphrase counts; fluent words without the idea do not). Quote the student's own words as evidence when covered; use "" when not.
- List any misconceptions the answer reveals (empty array if none).
- score_0_to_5: 5 = all key ideas, accurate; give partial credit per idea covered; 0 = nothing relevant. Judge meaning, not length or style.
- feedback: 2-4 sentences of specific, formative feedback — name what they nailed, what they missed, and any mix-up you spotted. Address the student directly.
- Before finalizing, verify every claim in your feedback against the source material; do not invent errors.`;

  const gradeOnce = () =>
    generateJson<GraderOutput>({
      system:
        "You are a rigorous, fair grader for a personal study tool. Grades are formative first-pass estimates, never a final authority.",
      prompt,
      schema: GRADER_SCHEMA,
      maxTokens: 4000,
      tier: "fast",
      effort: "medium",
      task: "grading",
    });

  // Adaptive sampling: one grade first; decisive extremes (0 or 5) stand
  // alone, borderline scores get independent second opinions.
  const samples: GraderOutput[] = [await gradeOnce()];
  const first = Math.max(0, Math.min(5, samples[0].score_0_to_5));
  if (MAX_SAMPLES > 1 && first !== 0 && first !== 5) {
    samples.push(
      ...(await Promise.all(Array.from({ length: MAX_SAMPLES - 1 }, gradeOnce)))
    );
  }

  const scores = samples.map((s) => Math.max(0, Math.min(5, s.score_0_to_5)));
  const med = median(scores);
  const disagreement = Math.max(...scores) - Math.min(...scores);
  // The sample whose score is closest to the median provides the narrative.
  const primary = samples[scores.findIndex((s) => Math.abs(s - med) === Math.min(...scores.map((x) => Math.abs(x - med))))];

  const score = med / 5;
  return {
    score,
    correct: score >= 0.6,
    feedback: primary.feedback,
    key_idea_coverage: primary.key_idea_coverage,
    misconceptions: primary.misconceptions.filter(Boolean),
    low_confidence: disagreement >= 2,
    sample_scores: scores,
  };
}

export function gradeMcq(item: QuizItem, selectedIndex: number): GradeResult {
  const payload = item.payload as McqPayload;
  const correct = selectedIndex === payload.answer_index;
  return {
    score: correct ? 1 : 0,
    correct,
    feedback: correct
      ? `Correct. ${payload.explanation}`
      : `Not quite — the answer is "${payload.options[payload.answer_index]}". ${payload.explanation}`,
  };
}

/** Grade any quiz item, record the attempt, and update BKT mastery. */
export async function gradeAndRecord(
  itemId: string,
  answer: { selected_index?: number; text?: string }
): Promise<GradeResult> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM quiz_items WHERE id = ?").get(itemId) as
    | { id: string; notebook_id: string; section_id: string; type: string; payload: string }
    | undefined;
  if (!row) throw new Error("Quiz item not found");

  const item: QuizItem = {
    id: row.id,
    notebook_id: row.notebook_id,
    section_id: row.section_id,
    type: row.type as QuizItem["type"],
    payload: JSON.parse(row.payload),
  };

  let result: GradeResult;
  let answerText: string;
  if (item.type === "mcq") {
    const idx = answer.selected_index ?? -1;
    result = gradeMcq(item, idx);
    answerText = String(idx);
  } else {
    const text = (answer.text ?? "").trim();
    if (!text) throw new Error("Empty answer");
    result = await gradeOpenAnswer(item, text);
    answerText = text;
  }

  db.prepare(
    `INSERT INTO attempts (item_id, section_id, notebook_id, answer, score, correct, feedback)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    item.id,
    item.section_id,
    item.notebook_id,
    answerText,
    result.score,
    result.correct ? 1 : 0,
    JSON.stringify(result)
  );

  applyBkt(item.section_id, result.correct);
  return result;
}
