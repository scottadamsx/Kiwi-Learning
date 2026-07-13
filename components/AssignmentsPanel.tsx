"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";

/**
 * A network-level fetch failure ("Load failed" / "Failed to fetch") almost
 * always means the tab is running a stale build against a restarted server —
 * say that instead of leaking the browser's cryptic message.
 */
const STALE_TAB =
  "Couldn't reach the server. If Kiwi was just updated, refresh the page (⌘⇧R) and try again.";

async function postFiles(url: string, files: File[]): Promise<Response> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  try {
    return await fetch(url, { method: "POST", body: form });
  } catch {
    throw new Error(STALE_TAB);
  }
}

/** Shared helper: send files to the universal extractor and get their text back. */
async function extractFiles(
  files: File[]
): Promise<{ text: string; names: string[]; errors: string[] }> {
  const res = await postFiles("/api/extract", files);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't read those files");

  const results = (data.results ?? []) as {
    filename: string;
    ok: boolean;
    text?: string;
    error?: string;
  }[];
  const good = results.filter((r) => r.ok && r.text);
  return {
    text: good.map((r) => `--- ${r.filename} ---\n${r.text}`).join("\n\n"),
    names: good.map((r) => r.filename),
    errors: results.filter((r) => !r.ok).map((r) => `${r.filename}: ${r.error}`),
  };
}

// Assignments: a dedicated Fable-powered tutor per assignment. It teaches the
// work instead of doing it, and every exchange feeds a persistent learning
// log — real evidence you learned it.

interface AssignmentListItem {
  id: string;
  title: string;
  status: "active" | "done";
  created_at: string;
  step_count: number;
  message_count: number;
}

interface Step {
  kind: "step" | "insight" | "skill";
  text: string;
  ts?: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

const KIND_META: Record<Step["kind"], { icon: string; label: string; cls: string }> = {
  step: { icon: "🧭", label: "Step", cls: "text-sky-700" },
  insight: { icon: "💡", label: "Insight", cls: "text-amber-700" },
  skill: { icon: "🛠", label: "Skill", cls: "text-kiwi-700" },
};

export default function AssignmentsPanel({ notebookId }: { notebookId: string }) {
  const [list, setList] = useState<AssignmentListItem[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/assignments`);
    const data = await res.json();
    setList(data.assignments ?? []);
  }, [notebookId]);

  useEffect(() => {
    load();
  }, [load]);

  if (openId) {
    return (
      <AssignmentView
        notebookId={notebookId}
        assignmentId={openId}
        onBack={() => {
          setOpenId(null);
          load();
        }}
      />
    );
  }

  return <AssignmentList notebookId={notebookId} list={list} onOpen={setOpenId} onChanged={load} />;
}

function AssignmentList({
  notebookId,
  list,
  onOpen,
  onChanged,
}: {
  notebookId: string;
  list: AssignmentListItem[] | null;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [attached, setAttached] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0 || reading) return;
    setReading(true);
    setError(null);
    try {
      const { text, names, errors } = await extractFiles(list);
      if (text) {
        setBrief((b) => (b.trim() ? `${b.trim()}\n\n${text}` : text));
        setAttached((a) => [...a, ...names]);
        // Name the assignment after the first file if the title is still empty.
        if (!title.trim() && names[0]) {
          setTitle(names[0].replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
        }
      }
      if (errors.length) setError(errors.join(" · "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read those files");
    } finally {
      setReading(false);
    }
  }

  async function create() {
    if (!title.trim() || !brief.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, brief }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't create assignment");
        return;
      }
      setTitle("");
      setBrief("");
      onOpen(data.id);
    } catch {
      setError(STALE_TAB);
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}" and its learning log?`)) return;
    await fetch(`/api/notebooks/${notebookId}/assignments/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-line bg-white p-6">
        <h2 className="font-display text-lg font-semibold">📝 New assignment</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Drop in the assignment file — PDF, Word, slides, or even a screenshot — or paste the
          brief. You get a dedicated tutor that helps you <em>learn</em> it, step by step, with
          diagrams and challenges, while logging everything you master along the way.
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title — e.g. Essay 2: Causes of WWI"
          className="mt-4 w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-kiwi-400 focus:ring-2 focus:ring-kiwi-100"
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`mt-2 rounded-xl transition ${dragOver ? "ring-2 ring-kiwi-400" : ""}`}
        >
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={5}
            placeholder="Paste the assignment instructions — or drop the assignment PDF / Word doc / screenshot right here."
            className="w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-kiwi-400 focus:ring-2 focus:ring-kiwi-100"
          />
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={reading}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-kiwi-300 hover:text-ink disabled:opacity-50"
          >
            {reading ? (
              <span className="animate-kiwi-pulse">Reading file…</span>
            ) : (
              "📎 Attach assignment file"
            )}
          </button>
          {attached.map((n) => (
            <span
              key={n}
              className="rounded-full bg-kiwi-100 px-2 py-0.5 text-[11px] font-medium text-kiwi-700"
            >
              ✓ {n}
            </span>
          ))}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          onClick={create}
          disabled={creating || reading || !title.trim() || !brief.trim()}
          className="mt-3 rounded-xl bg-kiwi-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-40"
        >
          {creating ? "Creating…" : "Start with my tutor"}
        </button>
      </div>

      {list === null ? (
        <p className="animate-kiwi-pulse text-center text-sm text-ink-soft">Loading…</p>
      ) : list.length > 0 ? (
        <div className="space-y-2">
          {list.map((a) => (
            <div
              key={a.id}
              className="group flex items-center gap-3 rounded-xl border border-line bg-white p-4 transition hover:border-kiwi-300"
            >
              <button onClick={() => onOpen(a.id)} className="flex-1 text-left">
                <span className="text-sm font-semibold">
                  {a.status === "done" && "✅ "}
                  {a.title}
                </span>
                <span className="block text-xs text-ink-soft">
                  {a.step_count} learning-log entries · {Math.floor(a.message_count / 2)} exchanges
                </span>
              </button>
              <button
                onClick={() => remove(a.id, a.title)}
                className="hidden rounded-lg px-2 py-1 text-xs text-ink-soft hover:bg-red-50 hover:text-red-600 group-hover:block"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssignmentView({
  notebookId,
  assignmentId,
  onBack,
}: {
  notebookId: string;
  assignmentId: string;
  onBack: () => void;
}) {
  const [assignment, setAssignment] = useState<{ title: string; brief: string; status: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);

  // Share your draft, a screenshot of your work, or extra handouts mid-conversation.
  async function attachToChat(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0 || reading) return;
    setReading(true);
    setAttachError(null);
    try {
      const { text, names, errors } = await extractFiles(list);
      if (text) {
        setInput((v) =>
          `${v.trim() ? v.trim() + "\n\n" : ""}Here's ${names.join(", ")}:\n\n${text}`.slice(0, 20000)
        );
      }
      if (errors.length) setAttachError(errors.join(" · "));
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Couldn't read that file");
    } finally {
      setReading(false);
    }
  }

  useEffect(() => {
    fetch(`/api/notebooks/${notebookId}/assignments/${assignmentId}`)
      .then((r) => r.json())
      .then((d) => {
        setAssignment(d.assignment);
        setMessages(d.messages ?? []);
        setSteps(d.steps ?? []);
      })
      .catch(() => {});
  }, [notebookId, assignmentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [
      ...m,
      { role: "user", content: message },
      { role: "assistant", content: "", pending: true },
    ]);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/assignments/${assignmentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      }).catch(() => {
        throw new Error(STALE_TAB);
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Tutor call failed");
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: data.reply };
        return copy;
      });
      if (data.learned?.length) setSteps((s) => [...s, ...data.learned]);
    } catch (err) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `_${err instanceof Error ? err.message : "Something went wrong."}_`,
        };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone() {
    if (!assignment) return;
    const status = assignment.status === "done" ? "active" : "done";
    await fetch(`/api/notebooks/${notebookId}/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setAssignment((a) => (a ? { ...a, status } : a));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="text-sm text-kiwi-700 hover:underline">
          ← All assignments
        </button>
        <h2 className="font-display text-xl font-semibold">{assignment?.title ?? "…"}</h2>
        <button
          onClick={toggleDone}
          className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${
            assignment?.status === "done"
              ? "bg-kiwi-100 text-kiwi-700"
              : "border border-line text-ink-soft hover:border-kiwi-300"
          }`}
        >
          {assignment?.status === "done" ? "✅ Completed" : "Mark complete"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex h-[calc(100vh-320px)] flex-col rounded-2xl border border-line bg-white p-4">
          <div className="flex-1 space-y-4 overflow-y-auto pb-3">
            {messages.length === 0 && (
              <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">
                Your tutor has read the assignment and your course sources. Say hi, or ask
                &ldquo;where do I even start?&rdquo; — it teaches, it doesn&apos;t just answer. 🥝
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-kiwi-600 px-4 py-2.5 text-sm text-white"
                >
                  {m.content}
                </div>
              ) : (
                <div
                  key={i}
                  className="max-w-[95%] rounded-2xl rounded-bl-md border border-line bg-paper px-5 py-3.5"
                >
                  {m.pending ? (
                    <span className="animate-kiwi-pulse text-sm text-ink-soft">
                      Tutor is thinking hard (Fable-grade thinking takes a moment)…
                    </span>
                  ) : (
                    <Markdown content={m.content} />
                  )}
                </div>
              )
            )}
            <div ref={bottomRef} />
          </div>
          {attachError && (
            <p className="border-t border-line pt-2 text-xs text-red-600">{attachError}</p>
          )}
          <div className="flex gap-2 border-t border-line pt-3">
            <input
              ref={chatFileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && attachToChat(e.target.files)}
            />
            <button
              onClick={() => chatFileRef.current?.click()}
              disabled={busy || reading}
              title="Attach a file — your draft, a screenshot, extra handouts"
              className="rounded-xl border border-line px-3 py-2.5 text-sm text-ink-soft hover:border-kiwi-300 hover:text-ink disabled:opacity-50"
            >
              {reading ? "…" : "📎"}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask, answer the challenge, or share your attempt…"
              disabled={busy}
              className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-kiwi-400 focus:ring-2 focus:ring-kiwi-100 disabled:opacity-60"
            />
            <button
              onClick={send}
              disabled={busy || reading || !input.trim()}
              className="rounded-xl bg-kiwi-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>

        <aside className="h-[calc(100vh-320px)] overflow-y-auto rounded-2xl border border-line bg-white p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            Learning log · {steps.length}
          </h3>
          <p className="mt-1 text-[11px] text-ink-soft">
            Evidence you actually learned it — filled in automatically as you work.
          </p>
          <ol className="mt-3 space-y-2.5">
            {steps.map((s, i) => {
              const meta = KIND_META[s.kind] ?? KIND_META.step;
              return (
                <li key={i} className="flex gap-2 text-sm">
                  <span>{meta.icon}</span>
                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <p className="text-[13px] leading-snug">{s.text}</p>
                  </div>
                </li>
              );
            })}
            {steps.length === 0 && (
              <li className="text-xs text-ink-soft">Nothing yet — start working!</li>
            )}
          </ol>
        </aside>
      </div>
    </div>
  );
}
