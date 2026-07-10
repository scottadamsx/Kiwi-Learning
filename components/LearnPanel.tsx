"use client";

import { useEffect, useState } from "react";
import type { Readiness, Section } from "@/lib/types";
import type { NotebookDetail } from "./Workspace";
import Markdown from "./Markdown";

const IMPORTANCE_LABEL: Record<number, string> = { 3: "Critical", 2: "Core", 1: "Minor" };

export default function LearnPanel({
  detail,
  readiness,
}: {
  detail: NotebookDetail;
  readiness: Readiness | null;
}) {
  const [openSection, setOpenSection] = useState<Section | null>(null);

  if (detail.sections.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        Build the study set from the Sources tab first.
      </p>
    );
  }

  if (openSection) {
    return (
      <LessonView
        notebookId={detail.notebook.id}
        section={openSection}
        onBack={() => setOpenSection(null)}
      />
    );
  }

  const effectiveBySection = new Map(
    (readiness?.modules ?? []).flatMap((m) => m.sections).map((s) => [s.section_id, s.effective])
  );
  const prereqNames = (sectionId: string) =>
    detail.edges
      .filter((e) => e.to_section === sectionId)
      .map((e) => detail.sections.find((s) => s.id === e.from_section)?.name)
      .filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      {detail.modules.map((m, mi) => (
        <div key={m.id}>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-kiwi-600">
              Module {mi + 1}
            </span>
            <h2 className="font-display text-xl font-semibold">{m.name}</h2>
          </div>
          {m.description && <p className="mb-3 text-sm text-ink-soft">{m.description}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {detail.sections
              .filter((s) => s.module_id === m.id)
              .map((s) => {
                const eff = effectiveBySection.get(s.id) ?? 0;
                const prereqs = prereqNames(s.id);
                const hasLesson = detail.lesson_section_ids.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => setOpenSection(s)}
                    className="rounded-xl border border-line bg-white p-4 text-left transition hover:border-kiwi-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold">{s.name}</h3>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          s.importance === 3
                            ? "bg-red-50 text-red-700"
                            : s.importance === 2
                              ? "bg-kiwi-50 text-kiwi-700"
                              : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {IMPORTANCE_LABEL[s.importance]}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{s.description}</p>
                    {prereqs.length > 0 && (
                      <p className="mt-2 text-[11px] text-ink-soft/80">
                        Builds on: {prereqs.join(", ")}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eceae4]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, eff * 100)}%`,
                            background: `hsl(${8 + eff * 100} 65% 45%)`,
                          }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-ink-soft">
                        {Math.round(eff * 100)}%
                      </span>
                      <span className="text-[11px] text-kiwi-600">
                        {hasLesson ? "Lesson ready" : "Open lesson →"}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function LessonView({
  notebookId,
  section,
  onBack,
}: {
  notebookId: string;
  section: Section;
  onBack: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notebooks/${notebookId}/lesson/${section.id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed to load lesson");
        if (!cancelled) setContent(data.content);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [notebookId, section.id]);

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={onBack} className="mb-4 text-sm text-kiwi-700 hover:underline">
        ← Back to outline
      </button>
      <div className="rounded-2xl border border-line bg-white p-8">
        <p className="text-xs font-bold uppercase tracking-wider text-kiwi-600">Lesson</p>
        <h1 className="font-display mt-1 text-2xl font-semibold">{section.name}</h1>
        <div className="mt-5">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : content === null ? (
            <p className="animate-kiwi-pulse text-sm text-ink-soft">
              Writing this lesson from your sources… (first open takes ~30s, then it&apos;s cached)
            </p>
          ) : (
            <Markdown content={content} citations />
          )}
        </div>
      </div>
    </div>
  );
}
