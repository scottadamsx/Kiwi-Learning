# 🥝 Kiwi Learning

An adaptive study engine — the NotebookLM idea, pointed at actually getting you ready for an exam.
Upload your notes, slides, and readings; Kiwi maps them into **modules → sections**, then builds
lessons, FSRS-scheduled flashcards, and understanding-graded quizzes from *your* material — and
tracks a live, honest **readiness %** that rises as you master sections and drifts down as you forget.

Built from the spec in [`kiwi-learning.md`](./kiwi-learning.md).

## Quick start

```bash
npm install
cp .env.local.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                        # http://localhost:3000
```

1. Create a notebook, drop in PDFs / Markdown / text on the **Sources** tab.
2. Click **Build study set** — Kiwi reads everything and produces the module/section outline
   (with importance weights and prerequisite edges) plus flashcards for every section.
3. Study: **Learn** (grounded lessons with citations, math, and Mermaid diagrams), **Review**
   (FSRS spaced repetition), **Quiz** (adaptive, targets your weakest sections), **Chat**
   (grounded Q&A with inline `[n]` citations), **Map** (knowledge graph colored by mastery).

## How the engine works

| Piece | Implementation |
|---|---|
| Ingestion | PDF via `unpdf`, md/txt passthrough; paragraph-aware chunking (`lib/ingest.ts`) |
| Retrieval | BM25-style keyword search via MiniSearch + section→chunk tags; every generation is grounded (`lib/retrieval.ts`) |
| Outline | One structured-output pass produces modules, sections, importance, prereq edges, chunk tags (`lib/outline.ts`) |
| Scheduling | FSRS (`ts-fsrs`, pretrained weights, retention 0.9); full card state persisted (`lib/fsrs.ts`) |
| Mastery | Bayesian Knowledge Tracing per section, fixed defaults (slip .1, guess .2, transit .15) — up on correct, down on incorrect (`lib/mastery.ts`) |
| Readiness | `m*ᵢ = P(L)ᵢ × Rᵢ` (mastery × FSRS retrievability), importance-weighted average — forgetting makes it drift down honestly |
| Grading | Free-text answers graded against reference answer + decomposed key ideas: per-idea partial credit, misconception detection, formative feedback; sampled N× (default 3) with disagreement flagged as a **low-confidence grade** (`lib/grading.ts`) |
| Chat | Retrieval → streamed answer with inline `[n]` citations mapped to source excerpts |
| Personalization | Connect an Obsidian vault (Connectors page) — lessons query your own notes to build on what you already know (`lib/vault.ts`, read-only) |

All Claude calls use structured outputs (`output_config.format`) on `claude-opus-4-8`
(override with `KIWI_MODEL`). Data lives in a local SQLite file at `data/kiwi.db`.

## Pages

Beyond the notebook workspace: `/how-it-works` (the engine, in plain language),
`/why-kiwi` (vs NotebookLM), `/connectors` (Obsidian vault), `/settings` (keys, model, data).

## Honest scope

LLM grading is a **formative first-pass**, not an authority — that's why the rubric breakdown is
always shown, and why disagreeing grader samples get flagged instead of averaged away. The
readiness number is framed as "your practice suggests you're about here," not a certificate.

## Roadmap to market

- Auth + multi-tenant Postgres/pgvector (swap `lib/db.ts`; schema is already relational)
- Parameterized hands-on problems with SymPy/math.js server-side verification
- Drag-to-build exercises (dnd-kit) and Excalidraw annotation
- Embedding-based retrieval upgrade (pgvector) and MCQ distractor QC with a second model
- Review-log export so FSRS weights can be personalized later
