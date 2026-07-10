import PageShell from "@/components/PageShell";

export const metadata = { title: "How it works — Kiwi Learning" };

export default function HowItWorksPage() {
  return (
    <PageShell title="How it works">
      <div className="space-y-6 text-sm leading-relaxed">
        <p className="text-base text-ink-soft">
          Kiwi is an adaptive study engine, not a media generator. Everything it builds is
          grounded in your uploads, and every interaction updates an honest estimate of how ready
          you actually are. Here&apos;s the whole machine, in order.
        </p>

        <Step n={1} title="Upload → Kiwi builds a picture">
          You drop in notes, textbook chapters, slides, PDFs. Kiwi parses everything into
          searchable passages, then runs a concept-extraction pass that organizes the material
          into <strong>modules → sections</strong> — a structured outline with importance weights
          (critical / core / minor) and prerequisite links between sections. This outline is the
          backbone everything else hangs on: every lesson, flashcard, and question is tagged to a
          section.
        </Step>

        <Step n={2} title="Lessons that cite your sources">
          Each section gets a lesson generated from the passages that cover it — plain-language
          explanation first, worked examples from your material, math rendered properly, and a
          diagram where a visual genuinely helps. Lessons cite back to your sources with [n]
          markers so you can verify anything. If you&apos;ve connected an Obsidian vault, Kiwi
          also reads your own related notes and tailors the lesson to what you already know.
        </Step>

        <Step n={3} title="Flashcards on a real forgetting curve">
          Cards are auto-written per section and scheduled with <strong>FSRS</strong> — the
          current best-in-class open spaced-repetition algorithm. You review a card right when
          recall has become effortful-but-possible (~90% predicted recall), which is exactly the
          moment review builds the most durable memory. It feels harder than rereading. That&apos;s
          the point: retrieval practice beats passive review, decisively.
        </Step>

        <Step n={4} title="Quizzes graded on understanding">
          Quizzes target your weakest sections and interleave topics (which reliably beats
          blocked practice). Multiple-choice distractors are grounded in real misconceptions. The
          signature feature is long-answer grading: instead of string-matching, Kiwi decomposes
          the ideal answer into key ideas, checks which ones <em>you actually expressed</em>,
          gives partial credit per idea, flags misconceptions, and hands back specific feedback.
          Each free-text grade is sampled multiple times independently — if the samples disagree,
          the grade is flagged <em>low-confidence</em> rather than presented as final.
        </Step>

        <Step n={5} title="The readiness meter">
          Every answer updates a per-section mastery estimate (Bayesian Knowledge Tracing: up
          when you&apos;re right, down when you&apos;re wrong, in real time). Readiness multiplies
          mastery by <em>current predicted recall</em> from the forgetting curve, then averages
          across sections weighted by importance. That&apos;s why the number drifts down on
          sections you haven&apos;t touched — you do forget, and an honest readiness score should
          say so. Tap any bar to see exactly what&apos;s dragging you down and practice it.
        </Step>

        <div className="rounded-2xl border border-kiwi-200 bg-kiwi-50 p-5">
          <h2 className="font-semibold text-kiwi-800">The honest fine print</h2>
          <p className="mt-1 text-kiwi-900">
            LLM grading of free-text answers is a genuinely useful <em>formative</em> grader for
            low-stakes study, but research is clear it shouldn&apos;t be the sole authority on a
            grade that counts. That&apos;s why Kiwi always shows the rubric breakdown, flags
            low-confidence grades, and frames readiness as &ldquo;your practice suggests
            you&apos;re about here&rdquo; — a well-founded estimate, not a certificate.
          </p>
        </div>
      </div>
    </PageShell>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="font-display mb-2 text-lg font-semibold">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-kiwi-600 text-xs font-bold text-white">
          {n}
        </span>
        {title}
      </h2>
      <p className="text-ink-soft">{children}</p>
    </section>
  );
}
