// Shared types across the engine, API routes, and UI.
//
// Hierarchy: Notebook → Modules → Sections.
// Sections are the learnable units: each has its own lesson, flashcards,
// quiz items, and a BKT mastery estimate. Readiness rolls up
// section → module → notebook.

export type NotebookStatus = "empty" | "ready" | "processing" | "error";

export interface Notebook {
  id: string;
  name: string;
  status: NotebookStatus;
  status_message: string | null;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  notebook_id: string;
  filename: string;
  mime: string;
  char_count: number;
  created_at: string;
}

export interface Chunk {
  id: string;
  notebook_id: string;
  document_id: string;
  idx: number;
  text: string;
}

export interface Module {
  id: string;
  notebook_id: string;
  name: string;
  description: string;
  position: number;
}

// Importance: 3 = Critical, 2 = Moderate, 1 = Minor
export interface Section {
  id: string;
  notebook_id: string;
  module_id: string;
  name: string;
  description: string;
  importance: 1 | 2 | 3;
  position: number;
  mastery: number; // BKT P(L)
  last_activity: string | null;
  excluded: number; // 1 = learner marked "not part of my course"
}

// Prerequisite edge: from_section should be learned before to_section.
export interface SectionEdge {
  from_section: string;
  to_section: string;
}

export interface CardRow {
  id: string;
  notebook_id: string;
  section_id: string;
  front: string;
  back: string;
  fsrs_state: string; // JSON-serialized ts-fsrs Card
  due: string;
}

export type QuizItemType = "mcq" | "short" | "long";

export interface McqPayload {
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
}

export interface OpenPayload {
  question: string;
  reference_answer: string;
  key_ideas: string[]; // decomposed ideal answer — the grading rubric
}

export interface QuizItem {
  id: string;
  notebook_id: string;
  section_id: string;
  type: QuizItemType;
  payload: McqPayload | OpenPayload;
}

export interface GradeResult {
  score: number; // 0..1
  correct: boolean;
  feedback: string;
  key_idea_coverage?: { idea: string; covered: boolean; evidence: string }[];
  misconceptions?: string[];
  low_confidence?: boolean; // grader samples disagreed — treat grade as tentative
  sample_scores?: number[];
}

export interface SectionReadiness {
  section_id: string;
  module_id: string;
  name: string;
  importance: number;
  mastery: number; // P(L)
  retrievability: number; // R — predicted current recall
  effective: number; // m* = P(L) × R
}

export interface ModuleReadiness {
  module_id: string;
  name: string;
  readiness: number;
  sections: SectionReadiness[];
}

export interface Readiness {
  overall: number; // 0..1 weighted
  modules: ModuleReadiness[];
  due_cards: number;
}

export interface ChatSource {
  n: number;
  chunk_id: string;
  document: string;
  excerpt: string;
}
