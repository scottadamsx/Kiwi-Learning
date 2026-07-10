# Kiwi Learning Engine: Product Spec + Build Blueprint

*Prepared July 2026. An adaptive study engine, not a media generator. You upload your own material; the system understands it and builds lessons, flashcards, hands-on problems, interactive diagrams, and questions from it — then tracks how well you actually understand each concept and shows a live "readiness" percentage that rises as you master material and drifts down as you forget. Part 1 is the product/pedagogy spec. Part 2 is the technical build blueprint on the same uploads-grounded RAG core from the NotebookLM document. General academic subjects (any discipline), not coding.*

---

# PART 1 — PRODUCT SPEC

## The core idea

Most study tools test you with static right/wrong scoring and leave you to guess whether you're actually ready. Kiwi's difference is a **readiness meter grounded in understanding**: every interaction updates a per-concept mastery estimate, those roll up into one honest number ("you're 34% ready for this material"), and that number decides what you do next — more practice where you're weak, spaced review where you're fading, moving on where you've got it. Do badly and it might say 13% ready; the path forward is visible and it climbs as you improve.

The whole thing is grounded in the user's uploaded documents. Nothing is invented from thin air; lessons, questions, and reference answers all trace back to the source material, the same grounding discipline that makes the NotebookLM-style core trustworthy.

## What the learner experiences

**Upload → the system builds a picture.** You drop in your notes, textbook chapters, slides, PDFs. The engine parses everything, extracts the concepts, and organizes them into a concept map — a structured "picture" of what this material is about and how the ideas depend on each other. This concept map is the backbone everything else hangs on.

**Lessons.** For each concept, the engine generates a clear, source-grounded lesson — an explanation in plain language, worked examples pulled from or built on your material, and inline interactive diagrams where a visual helps. Lessons cite back to the source so you can verify and dig deeper, and they adapt in depth to how you're doing.

**Flashcards with real spaced repetition.** Cards are auto-generated per concept and scheduled with FSRS (the current best-in-class open scheduler, ~20–30% fewer reviews than old Anki-style SM-2 for the same retention). You review when a card is about to fade, not on a fixed calendar — which is both more efficient and, by design, harder in the productive way that actually builds memory.

**Hands-on examples.** Because this is general-academic rather than coding, "hands-on" means interactive problems, not a code sandbox: parameterized practice problems with step-by-step worked solutions and progressive hints, drag-to-build exercises (assemble the water cycle, order the steps of mitosis, label a diagram), and embeddable simulations where they exist (physics/chem/bio sims). Each problem is generated with a deterministic answer key so it can be auto-checked, and re-parameterized so you get endless fresh variants instead of memorizing one instance.

**Interactive diagrams.** The engine emits diagrams from text/JSON that render as manipulable visuals — concept flowcharts, mind maps, timelines, and knowledge graphs you can drag and rearrange. Building or completing a diagram yourself is itself a graded activity ("connect these concepts correctly").

**Questions, including long answers graded on understanding.** Multiple choice (with genuinely plausible distractors, not obvious throwaways), short answer, and long answer. The long-answer grading is the signature feature: instead of matching a string, the engine breaks the ideal answer into its key ideas, checks which ones you actually expressed, gives partial credit, identifies misconceptions, and hands back specific formative feedback ("you nailed X and Y, you missed Z, and this part suggests a common mix-up about W"). The number matters less than the map of what you understood.

**The readiness meter.** Always visible. Per-concept mastery bars plus one overall readiness percentage for the material (or a specific exam/section). It goes up when you answer well, down when you don't, and slowly drifts down over time on concepts you haven't touched — because you do forget, and an honest readiness score should reflect that. Tapping the meter shows exactly which concepts are dragging it down and what to do about them.

## The learning science it's built on (and why)

Kiwi deliberately uses established, interpretable methods rather than flashy ones:

- **Testing effect / retrieval practice.** Every study action is a retrieval attempt (a question, a card, a diagram to build), not passive re-reading — because being tested produces far better retention than reviewing.
- **Spacing + desirable difficulty.** FSRS schedules reviews for the moment recall has become effortful-but-still-possible (~85–90% predicted recall), which is exactly when review builds the most durable memory.
- **Interleaving.** Practice sessions mix concepts rather than draining one topic, which reliably beats blocked practice on delayed tests.
- **Mastery-based progression.** A concept isn't "done" until its mastery estimate clears a bar (~90–95%); below that it stays in rotation. This is Bloom's mastery learning, mapped onto a per-concept gate.

## Honest scope and limits (important)

The one place to be careful is grading. LLM grading of free-text answers is good enough to be a **first-pass grader and a genuinely useful feedback engine for low-stakes study**, but the research is clear that it is **not** trustworthy as the sole authority on a grade that counts. Agreement with human graders is typically moderate (often QWK 0.3–0.68), drops on higher-order and interpretive answers, and models can be self-inconsistent and confidently wrong in their justifications. Kiwi's design response: treat every grade as formative, always show the rubric breakdown so the learner sees the reasoning, let them contest it, and flag low-confidence grades rather than presenting them as final. For a personal study tool this is exactly the right trade; just don't market it as an exam-grade authority.

The readiness percentage is likewise a well-founded estimate, not a guarantee — there is no single canonical "readiness" formula in the literature, so Kiwi's is a defensible synthesis (weighted, forgetting-decayed mastery), best framed to users as "your practice suggests you're about here," not a certified score.

---

# PART 2 — BUILD BLUEPRINT

## Architecture at a glance

Kiwi sits on the uploads-grounded RAG core from the NotebookLM document (ingestion → chunk/embed/index → grounded generation with citations), and adds three new subsystems: a **content generator** (lessons, cards, problems, diagrams, questions), a **grading engine** (understanding-based), and a **mastery/scheduling engine** (the readiness meter). One Postgres holds documents, the concept map, generated items, per-card FSRS state, and per-concept mastery.

## Ingestion → concept map

Reuse the RAG ingestion (Docling/PyMuPDF parsing, recursive+parent-document chunking, BGE-M3 embeddings, pgvector). Then add a **concept-extraction pass**: an LLM reads the source and produces a structured concept map — a list of concepts (knowledge components), their descriptions, importance weights, and prerequisite/dependency edges between them. This map is stored as a graph and becomes the organizing spine: every lesson, card, problem, and question is tagged to one or more concept IDs, and the readiness meter aggregates along it. Importance weights (Critical/Moderate/Minor, or exam-blueprint-derived) drive how much each concept counts toward overall readiness.

## Content generation

All generation is grounded: retrieve the relevant source passages, then generate against them so output stays factual and cites back.

- **Lessons:** LLM generates Markdown/MDX per concept; render with `react-markdown` + KaTeX for math, with diagrams embedded inline.
- **Flashcards:** generate Q/A pairs per concept, tagged to concept IDs.
- **Parameterized problems:** the LLM emits a problem *template as JSON* — a parameter generator (value ranges/constraints), question text with slots, a deterministic answer key/verifier, and a graded list of hints plus a step-by-step worked solution. Validate generated math answers server-side with **SymPy** or **math.js** rather than trusting the model, then re-parameterize for infinite self-checked variants.
- **MCQs:** use **overgenerate-and-rank** for distractors (generate many, filter for plausibility), ground distractors in likely misconceptions, and QC with a *different* model plus heuristic checks — never let the generating model be the sole judge of its own distractor quality.
- **Long/short-answer items:** generate the question grounded in a passage, then generate reference answers at each credit band (full/partial/none) and derive the rubric from them, all citing the source. This reference-plus-rubric bundle is what the grader uses later.

## Interactive diagrams and hands-on UI (all MIT/ISC — commercially safe)

- **Mermaid.js** (MIT) — LLM emits text; renders flowcharts, mind maps, timelines, sequence/state diagrams. Cheapest and most reliable "explain this as a diagram."
- **React Flow / @xyflow** (MIT) — LLM emits `{nodes, edges}` JSON; fully interactive node graphs for concept maps, knowledge graphs, and drag-to-build exercises.
- **Excalidraw** (MIT) — editable hand-drawn canvas; convert Mermaid → Excalidraw for diagrams the learner can annotate.
- **Observable Plot / D3** (ISC) — the readiness dashboard visuals (mastery heatmaps, forgetting curves, due-forecasts).
- **dnd-kit** (MIT) — build custom manipulables (order-the-steps, labeling, sorting).
- **SurveyJS Form Library** (MIT, the free runtime — you do *not* need the paid Creator) — render LLM-generated quiz JSON with immediate feedback, scoring, timing.
- **H5P via h5p-standalone** (MIT) + **Lumi** authoring — optional, for richer interaction types like Branching Scenario.
- Embeddable sims: **PhET** (CC-BY, iframe with attribution — commercial OK) and **GeoGebra** (free apps but a paid license is required for a commercial SaaS — negotiate before shipping). **Avoid tldraw** (proprietary, watermark/paid key) — use Excalidraw instead.

## The grading engine (understanding, not string-match)

The pipeline that makes long-answer grading trustworthy-enough:

1. **Grade against a fixed rubric + reference answer + 2–3 graded exemplars**, using chain-of-thought *with the rubric in context*, temperature ~0.1, and structured JSON output (per-criterion score + evidence span + overall). Providing the reference answer and a decomposed rubric are the two biggest levers on accuracy; a coarse 0–5 (or small point) scale aligns with humans better than fine-grained scales.
2. **Decompose the ideal answer into key ideas / knowledge components** and grade coverage of each for partial credit — this is what produces meaning-based scoring and the "expressed vs missed" feedback in one pass.
3. **Add an embedding-similarity sanity check** (student vs reference) as a secondary signal — cheap and fast, but never the sole grader, because it rewards fluent paraphrase without checking correctness.
4. **Run a reasoning-verification pass before writing feedback** to cut hallucinated advice, and surface any misconception the answer reveals.
5. **Sample the grade 3× and use disagreement as an uncertainty flag**; low-confidence items get flagged (and, in any high-stakes context, routed to a human). Keep a small human-scored calibration set per subject and monitor agreement over time, since models drift toward leniency.

## The mastery + readiness engine (the heart of the product)

Two proven, interpretable, cheap components — no training run needed to operate, and they degrade gracefully with single-user data:

**Scheduling — FSRS (use `ts-fsrs`, MIT).** Ship the pre-trained default weights (works from day one, no data), set desired retention to 0.9, store each card's FSRS state (stability, difficulty, due date). On each answer call the scheduler; map your UI to Again/Hard/Good/Easy (or minimally wrong→Again, right→Good). Collect review logs from day one so you can optionally personalize weights later.

**Per-concept mastery — Bayesian Knowledge Tracing.** Keep a mastery probability P(L) per concept, starting ~0.2, with sensible fixed defaults (slip 0.1, guess 0.2, transit 0.15) rather than fitting parameters you don't yet have data for. On every answer, Bayes-update: mastery goes **up on correct, down on incorrect**, in real time, one cheap calculation per response. A concept counts as mastered at P(L) ≥ 0.9–0.95. (`pyBKT` exists if you want fitting later; for launch, the fixed-default update is a few lines.)

**Overall readiness %** — a weighted, forgetting-aware aggregate, mirroring how ALEKS and Duolingo combine signals without their data requirements:

- Compute a forgetting-adjusted score per concept: `m_i* = P(L)_i × R_i`, where `R_i` is the FSRS *retrievability* (predicted current recall) of that concept's cards. This is what makes readiness drift **down** over time on concepts you haven't reviewed — the honest "you're forgetting this" behavior.
- Readiness `= Σ(w_i · m_i*) / Σ(w_i)` across concepts, with `w_i` the importance weights from the concept map.

**Decision policy (what the meter drives):** concept below mastery and due → serve more practice (scaffold down if lapsing); mastered but retrievability fading → schedule a spaced review; mastered and strong → move on / unlock dependent concepts (prerequisite edges in the concept map). Build each session by interleaving due items across multiple concepts. Partial credit and hints-used feed the same mastery update, so effortful-but-successful work is rewarded appropriately.

**Dashboard:** per-concept mastery bars, an overall readiness gauge, a React Flow knowledge graph colored by mastery (instantly shows gaps and prerequisites), and Observable Plot views for the forgetting curve and review forecast.

## Recommended stack summary

Next.js (App Router) + React + TypeScript + Tailwind + shadcn/ui on top of the RAG core (FastAPI or Node backend, Postgres + pgvector, an open LLM via vLLM/Ollama or a cheap API through LiteLLM). Content rendering: react-markdown + KaTeX. Diagrams: Mermaid + React Flow + Excalidraw. Data viz: Observable Plot / D3. Quizzes: SurveyJS Form Library. Manipulables: dnd-kit (+ optional H5P/PhET/GeoGebra embeds). Scheduling: ts-fsrs. Mastery: BKT (fixed defaults → pyBKT later). Every core library is MIT/BSD/ISC and safe to ship commercially; the only license watch-outs are tldraw (avoid), GeoGebra (paid commercial license), PhET (attribution required), and treating AGPL/GPL platforms (Anki, Moodle, Open edX, Scholarsome) as architecture references only, never code to import.

## Build order

Start with the trio that delivers the core loop: **ingestion → concept map → grounded lessons + auto-generated flashcards on FSRS**, with a simple BKT mastery bar. That alone is a usable, differentiated study tool. Layer in **MCQ and understanding-graded long answers** next (this is where the real differentiation lives), then **parameterized hands-on problems and interactive diagrams**, and finally the **full readiness meter with forgetting-decay and the knowledge-graph dashboard**. A close reference to study is **OpenTutor** (upload → AI notes/quizzes/flashcards, adaptive tutor, FSRS built in) — verify its license before reusing any code.

---

## Sources

**Spaced repetition & mastery modeling**
- FSRS algorithm & benchmark — https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler and https://github.com/open-spaced-repetition/srs-benchmark
- ts-fsrs / py-fsrs / fsrs-rs (MIT) — https://github.com/open-spaced-repetition/ts-fsrs · https://github.com/open-spaced-repetition/py-fsrs · https://github.com/open-spaced-repetition/fsrs-rs
- Bayesian Knowledge Tracing + pyBKT — https://en.wikipedia.org/wiki/Bayesian_knowledge_tracing and https://github.com/CAHLR/pyBKT (paper https://arxiv.org/abs/2105.00385)
- Duolingo Half-Life Regression — https://research.duolingo.com/papers/settles.acl16.pdf and https://github.com/duolingo/halflife-regression
- ALEKS / Knowledge Space Theory — https://jmatayoshi.github.io/publications/JMP2021_KST_ALEKS_preprint.pdf
- Desirable difficulties / interleaving (Bjork) — https://pmc.ncbi.nlm.nih.gov/articles/PMC5978518/

**LLM grading on understanding & question generation**
- Essay-scoring research synthesis (65 studies) — https://arxiv.org/pdf/2512.14561
- Higher-ed reliability (negative result) — https://arxiv.org/abs/2508.02442
- GPT-4 ASAG benchmark — https://arxiv.org/pdf/2309.09338
- Grounded question generation + graded reference answers — https://arxiv.org/pdf/2506.12066
- D-GEN distractor generation/eval (ACL 2025) — https://aclanthology.org/2025.findings-acl.174.pdf
- Self-consistency + selective human review — https://www.mdpi.com/2504-4990/8/3/74
- Temperature for LLM judges — https://arxiv.org/html/2603.28304v1
- Grading-scale (0–5) alignment — https://arxiv.org/html/2601.03444v1

**Open-source building blocks**
- H5P core (MIT) + h5p-standalone — https://h5p.org/ and https://github.com/tunapanda/h5p-standalone · Lumi https://lumi.education/en/
- Mermaid — https://mermaid.js.org/ · Excalidraw — https://github.com/excalidraw/excalidraw · React Flow — https://github.com/xyflow/xyflow
- D3 — https://d3js.org/ · Observable Plot — https://observablehq.com/plot/ · KaTeX — https://katex.org/
- SurveyJS Form Library (MIT) — https://github.com/surveyjs/survey-library · dnd-kit — https://github.com/clauderic/dnd-kit
- SymPy — https://www.sympy.org/ · math.js — https://mathjs.org/
- PhET licensing (CC-BY) — https://phet.colorado.edu/en/licensing/html · GeoGebra license — https://www.geogebra.org/license · tldraw license — https://tldraw.dev/legal
- OpenTutor (reference) — https://github.com/zijinz456/OpenTutor