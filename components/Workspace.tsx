"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  DocumentRow,
  Module,
  Notebook,
  Readiness,
  Section,
  SectionEdge,
} from "@/lib/types";
import OverviewPanel from "./OverviewPanel";
import SourcesPanel from "./SourcesPanel";
import LearnPanel from "./LearnPanel";
import ReviewPanel from "./ReviewPanel";
import QuizPanel from "./QuizPanel";
import ChatPanel from "./ChatPanel";
import MapPanel from "./MapPanel";

export interface NotebookDetail {
  notebook: Notebook;
  documents: DocumentRow[];
  modules: Module[];
  sections: Section[];
  edges: SectionEdge[];
  lesson_section_ids: string[];
}

const TABS = ["Overview", "Learn", "Review", "Quiz", "Chat", "Map", "Sources"] as const;
export type Tab = (typeof TABS)[number];

export default function Workspace({ notebookId }: { notebookId: string }) {
  const [detail, setDetail] = useState<NotebookDetail | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const [d, r] = await Promise.all([
      fetch(`/api/notebooks/${notebookId}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/notebooks/${notebookId}/readiness`).then((res) => (res.ok ? res.json() : null)),
    ]);
    if (d) setDetail(d);
    if (r) setReadiness(r);
    return d as NotebookDetail | null;
  }, [notebookId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while the study set is being built.
  useEffect(() => {
    if (detail?.notebook.status === "processing" && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const d = await refresh();
        if (d && d.notebook.status !== "processing" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 2500);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [detail?.notebook.status, refresh]);

  const hasOutline = (detail?.sections.length ?? 0) > 0;
  const overall = readiness?.overall ?? 0;

  const emptyStateTab = useMemo(() => {
    if (!detail) return null;
    if (detail.documents.length === 0 || !hasOutline) return "Sources" as Tab;
    return null;
  }, [detail, hasOutline]);

  useEffect(() => {
    if (emptyStateTab && tab === "Overview" && !hasOutline) setTab(emptyStateTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emptyStateTab]);

  if (!detail) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-soft">
        <span className="animate-kiwi-pulse">Loading notebook…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6">
      <header className="mb-5 flex flex-wrap items-center gap-4">
        <Link
          href="/"
          className="rounded-lg border border-line bg-white px-2.5 py-1 text-sm text-ink-soft hover:border-kiwi-300 hover:text-ink"
          title="All notebooks"
        >
          ←
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {detail.notebook.name}
        </h1>
        {hasOutline && (
          <div
            className="ml-auto flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5"
            title="Readiness: forgetting-adjusted mastery, weighted by importance"
          >
            <ReadinessRing value={overall} size={26} />
            <span className="text-sm font-semibold">{Math.round(overall * 100)}% ready</span>
            {(readiness?.due_cards ?? 0) > 0 && (
              <button
                onClick={() => setTab("Review")}
                className="ml-1 rounded-full bg-kiwi-100 px-2 py-0.5 text-xs font-semibold text-kiwi-700 hover:bg-kiwi-200"
              >
                {readiness!.due_cards} due
              </button>
            )}
          </div>
        )}
      </header>

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "border-kiwi-600 text-kiwi-700"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="flex-1">
        {tab === "Overview" && (
          <OverviewPanel detail={detail} readiness={readiness} onNavigate={setTab} />
        )}
        {tab === "Learn" && <LearnPanel detail={detail} readiness={readiness} />}
        {tab === "Review" && (
          <ReviewPanel notebookId={notebookId} onSessionEnd={refresh} />
        )}
        {tab === "Quiz" && <QuizPanel notebookId={notebookId} onGraded={refresh} />}
        {tab === "Chat" && <ChatPanel notebookId={notebookId} />}
        {tab === "Map" && <MapPanel detail={detail} readiness={readiness} />}
        {tab === "Sources" && <SourcesPanel detail={detail} onChanged={refresh} />}
      </div>
    </div>
  );
}

export function ReadinessRing({ value, size = 40 }: { value: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const hue = 8 + pct * 100; // red → green
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eceae4" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`hsl(${hue} 65% 42%)`}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
