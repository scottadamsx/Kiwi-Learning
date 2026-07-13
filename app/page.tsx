"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface NotebookCard {
  id: string;
  name: string;
  status: string;
  created_at: string;
  document_count: number;
  section_count: number;
  due_cards: number;
}

export default function Home() {
  const [notebooks, setNotebooks] = useState<NotebookCard[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [health, setHealth] = useState<{ has_credentials: boolean; model: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/notebooks");
    const data = await res.json();
    setNotebooks(data.notebooks ?? []);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
  }, [load]);

  async function create() {
    if (!name.trim() || creating) return;
    setCreating(true);
    const res = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreating(false);
    if (res.ok) {
      setName("");
      load();
    }
  }

  async function remove(id: string, nbName: string) {
    if (!confirm(`Delete "${nbName}" and everything in it?`)) return;
    await fetch(`/api/notebooks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Your notebooks</h1>
        <p className="mt-3 max-w-xl text-ink-soft">
          Upload your notes, slides, and readings. Kiwi maps them into modules and sections, then
          builds lessons, flashcards, and understanding-graded quizzes — and shows you a live,
          honest readiness score.
        </p>
      </header>

      {health && !health.has_credentials && (
        <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Not signed in.</strong> Sign in with your Claude subscription on the{" "}
          <Link href="/connectors" className="font-semibold underline">
            Connectors
          </Link>{" "}
          page to turn on lessons, grading, quizzes, and chat. Uploading works without it.
        </div>
      )}

      <div className="mb-10 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New notebook — e.g. BIO 201 Midterm"
          className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-kiwi-400 focus:ring-2 focus:ring-kiwi-100"
        />
        <button
          onClick={create}
          disabled={creating || !name.trim()}
          className="rounded-xl bg-kiwi-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-kiwi-700 disabled:opacity-40"
        >
          Create
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {notebooks.map((nb) => (
          <div
            key={nb.id}
            className="group relative rounded-2xl border border-line bg-white p-5 transition hover:border-kiwi-300 hover:shadow-sm"
          >
            <Link href={`/notebooks/${nb.id}`} className="block">
              <h2 className="font-display text-lg font-semibold">{nb.name}</h2>
              <p className="mt-1 text-xs text-ink-soft">
                {nb.document_count} source{nb.document_count === 1 ? "" : "s"} ·{" "}
                {nb.section_count} section{nb.section_count === 1 ? "" : "s"}
                {nb.due_cards > 0 && (
                  <span className="ml-2 rounded-full bg-kiwi-100 px-2 py-0.5 font-semibold text-kiwi-700">
                    {nb.due_cards} due
                  </span>
                )}
              </p>
              <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-soft/70">
                {nb.status === "processing" ? (
                  <span className="animate-kiwi-pulse text-kiwi-600">building…</span>
                ) : nb.status === "error" ? (
                  <span className="text-red-600">error</span>
                ) : nb.status === "ready" ? (
                  <span className="text-kiwi-600">ready</span>
                ) : (
                  "empty"
                )}
              </p>
            </Link>
            <button
              onClick={() => remove(nb.id, nb.name)}
              className="absolute right-3 top-3 hidden rounded-lg px-2 py-1 text-xs text-ink-soft hover:bg-red-50 hover:text-red-600 group-hover:block"
              title="Delete notebook"
            >
              ✕
            </button>
          </div>
        ))}
        {notebooks.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
            No notebooks yet — create one above, then drop in your course material.
          </div>
        )}
      </div>
    </main>
  );
}
