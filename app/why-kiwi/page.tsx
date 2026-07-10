import PageShell from "@/components/PageShell";

export const metadata = { title: "Why Kiwi vs NotebookLM — Kiwi Learning" };

const ROWS: { dim: string; nlm: string; kiwi: string }[] = [
  {
    dim: "What it fundamentally is",
    nlm: "A research assistant: chat with your documents, get summaries, audio overviews.",
    kiwi: "A study engine: your documents become a course — outline, lessons, flashcards, quizzes — with one job: get you exam-ready.",
  },
  {
    dim: "Knows if you're ready?",
    nlm: "No. It can quiz you casually, but nothing tracks what you know.",
    kiwi: "A live readiness % built from per-section mastery (Bayesian Knowledge Tracing) × predicted recall (FSRS forgetting curve), weighted by importance. It goes down when you'd forget — honestly.",
  },
  {
    dim: "Memory over time",
    nlm: "Stateless between sessions — every chat starts from zero knowledge about you.",
    kiwi: "Every card review and quiz answer updates your model. Reviews are scheduled for the exact moment you're about to forget (FSRS, ~20-30% fewer reviews than classic Anki scheduling).",
  },
  {
    dim: "Assessment",
    nlm: "Conversational Q&A; no grading, no partial credit, no misconception detection.",
    kiwi: "MCQs with misconception-grounded distractors, plus free-text answers graded on understanding: key-idea partial credit, evidence quotes from your own words, misconception flags — and grades sampled multiple times, with disagreement flagged instead of hidden.",
  },
  {
    dim: "Structure",
    nlm: "Flat source list + chat.",
    kiwi: "Modules → sections with importance weights and prerequisite edges — a knowledge graph you can see, colored by your mastery.",
  },
  {
    dim: "Knows you",
    nlm: "Only what's in the uploaded sources.",
    kiwi: "Connect your Obsidian vault and lessons are written against what you already know — building on your notes, skipping what you've mastered, correcting what you got wrong.",
  },
  {
    dim: "Your data",
    nlm: "Lives in Google's cloud.",
    kiwi: "Local-first: one SQLite file on your machine. Source excerpts go to the model API during generation; nothing else leaves.",
  },
  {
    dim: "Grounding",
    nlm: "Strong — answers cite sources.",
    kiwi: "Same discipline, everywhere: chat, lessons, cards, and quiz questions all trace back to your uploads with citations. If it's not in your sources, Kiwi says so.",
  },
];

export default function WhyKiwiPage() {
  return (
    <PageShell title="How Kiwi is different from NotebookLM">
      <p className="mb-6 max-w-2xl text-sm text-ink-soft">
        NotebookLM is excellent at helping you <em>read</em>. Kiwi exists for the part that comes
        after: actually <em>learning</em> the material and knowing — with a number — whether
        you&apos;re ready. Same grounded-in-your-sources trust; a completely different engine on
        top.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-stone-50 text-left">
              <th className="p-4 font-semibold"> </th>
              <th className="p-4 font-semibold text-ink-soft">NotebookLM</th>
              <th className="p-4 font-semibold text-kiwi-700">🥝 Kiwi Learning</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.dim} className="border-b border-line align-top last:border-0">
                <td className="w-40 p-4 font-semibold">{r.dim}</td>
                <td className="p-4 text-ink-soft">{r.nlm}</td>
                <td className="p-4">{r.kiwi}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-2xl border border-kiwi-200 bg-kiwi-50 p-5 text-sm text-kiwi-900">
        <p>
          <strong>The one-sentence version:</strong> NotebookLM answers questions about your
          documents; Kiwi turns your documents into an adaptive course that tests you, remembers
          how you did, schedules your forgetting, and tells you honestly how ready you are.
        </p>
      </div>
    </PageShell>
  );
}
