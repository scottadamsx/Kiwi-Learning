import { getDb, uid } from "./db";
import { generateJson } from "./anthropic";
import { searchChunks, formatSources } from "./retrieval";
import { learnerContext } from "./vault";

// Assignments: a dedicated tutor agent per assignment, running on the plan
// tier (Fable). It teaches instead of answering — fun, interactive
// explanations (analogies, Mermaid diagrams, mini-challenges) — and distills
// every exchange into a persistent learning log (steps taken, insights,
// skills) so there's a real record the student LEARNED it, not just got
// answers.

export interface AssignmentRow {
  id: string;
  notebook_id: string;
  title: string;
  brief: string;
  status: "active" | "done";
  created_at: string;
}

export interface LearningStep {
  kind: "step" | "insight" | "skill";
  text: string;
}

export function createAssignment(notebookId: string, title: string, brief: string): AssignmentRow {
  const db = getDb();
  const id = uid("asg");
  db.prepare("INSERT INTO assignments (id, notebook_id, title, brief) VALUES (?, ?, ?, ?)").run(
    id,
    notebookId,
    title,
    brief
  );
  return db.prepare("SELECT * FROM assignments WHERE id = ?").get(id) as AssignmentRow;
}

const TUTOR_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "learned"],
  properties: {
    reply: { type: "string" },
    learned: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text"],
        properties: {
          kind: { type: "string", enum: ["step", "insight", "skill"] },
          text: { type: "string" },
        },
      },
    },
  },
} as const;

export async function tutorTurn(
  assignment: AssignmentRow,
  message: string
): Promise<{ reply: string; learned: LearningStep[] }> {
  const db = getDb();

  const history = (
    db
      .prepare(
        "SELECT role, content FROM assignment_messages WHERE assignment_id = ? ORDER BY id DESC LIMIT 12"
      )
      .all(assignment.id) as { role: "user" | "assistant"; content: string }[]
  )
    .reverse()
    .map((h) => ({ ...h, content: h.content.slice(0, 1500) }));

  const recentSteps = (
    db
      .prepare(
        "SELECT kind, text FROM assignment_steps WHERE assignment_id = ? ORDER BY id DESC LIMIT 15"
      )
      .all(assignment.id) as LearningStep[]
  ).reverse();

  // Ground in the course material relevant to the assignment + this question.
  const chunks = searchChunks(assignment.notebook_id, `${assignment.title} ${message}`, 6);
  const { block } = formatSources(chunks, 1500);
  const personal = learnerContext(`${assignment.title} ${message}`, 2, 600);

  db.prepare(
    "INSERT INTO assignment_messages (assignment_id, role, content) VALUES (?, 'user', ?)"
  ).run(assignment.id, message);

  const result = await generateJson<{ reply: string; learned: LearningStep[] }>({
    system: `You are Kiwi, an exceptional personal tutor helping a student complete an assignment BY LEARNING IT — never by doing it for them.

Teaching style — make it genuinely fun and interactive:
- Explain with vivid analogies and concrete mini-examples before formalism.
- When a picture would land better than a paragraph, draw one: a \`\`\`mermaid diagram (flowchart, sequence, mindmap). Use Markdown tables for comparisons and $...$ LaTeX for math.
- Be playful and encouraging (an emoji or two is fine), but never at the cost of rigor.
- Teach Socratically: break the problem into steps, do the NEXT step together, and end almost every reply with a small challenge or check-question the student can answer to move forward.
- If they ask you to just write the answer/essay/code for them, decline warmly and instead scaffold: outline the approach, work one example, and hand the pen back.
- Ground explanations in the course sources when relevant; if the assignment needs something the sources don't cover, say so and teach it anyway, clearly marked as beyond the uploads.

Learning log: after your reply, record what THIS exchange added, as short past-tense entries the student could show as evidence of learning ("Worked through the chain rule on the first integral", "Realized recursion needs a base case"). kind: "step" = work completed toward the assignment, "insight" = something understood, "skill" = something they can now do. 0-3 entries; empty array if the exchange was trivial chit-chat.

The assignment:
"""
${assignment.brief.slice(0, 6000)}
"""

Course sources relevant right now:
${block}
${personal ? `\nThe student's own notes (for tailoring, not as a source of facts):\n${personal}` : ""}
${recentSteps.length ? `\nLearning log so far (don't repeat these):\n${recentSteps.map((s) => `- [${s.kind}] ${s.text}`).join("\n")}` : ""}`,
    prompt: `${
      history.length
        ? `Conversation so far:\n${history
            .map((h) => `${h.role === "user" ? "Student" : "Kiwi"}: ${h.content}`)
            .join("\n\n")}\n\n`
        : ""
    }Student: ${message}`,
    schema: TUTOR_REPLY_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 8000,
    tier: "plan", // the tutor runs on the big brain — Fable on Claude Code
    effort: "high",
    task: "assignment",
  });

  const reply = result.reply ?? "";
  const learned = (result.learned ?? []).filter((s) => s.text?.trim()).slice(0, 3);

  const insertStep = db.prepare(
    "INSERT INTO assignment_steps (assignment_id, kind, text) VALUES (?, ?, ?)"
  );
  db.transaction(() => {
    db.prepare(
      "INSERT INTO assignment_messages (assignment_id, role, content) VALUES (?, 'assistant', ?)"
    ).run(assignment.id, reply);
    for (const s of learned) {
      insertStep.run(assignment.id, ["step", "insight", "skill"].includes(s.kind) ? s.kind : "step", s.text);
    }
  })();

  return { reply, learned };
}
