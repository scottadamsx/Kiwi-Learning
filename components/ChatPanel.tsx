"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatSource } from "@/lib/types";
import { CHAT_STREAM_MARKER } from "@/lib/constants";
import Markdown from "./Markdown";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  streaming?: boolean;
}

// Grounded chat over the notebook's sources — answers cite [n] chips that map
// to the source list under each reply.

export default function ChatPanel({ notebookId }: { notebookId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/chat`);
    const data = await res.json();
    setMessages(
      (data.messages ?? []).map((m: { role: string; content: string; sources: string | null }) => ({
        role: m.role,
        content: m.content,
        sources: m.sources ? JSON.parse(m.sources) : undefined,
      }))
    );
  }, [notebookId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

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
      { role: "assistant", content: "", streaming: true },
    ]);

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Chat failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sources: ChatSource[] | undefined;
      let answer = "";

      const update = () =>
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: answer, sources, streaming: true };
          return copy;
        });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (!sources) {
          const at = buffer.indexOf(CHAT_STREAM_MARKER);
          if (at === -1) continue;
          try {
            sources = JSON.parse(buffer.slice(0, at)).sources;
          } catch {
            sources = [];
          }
          buffer = buffer.slice(at + CHAT_STREAM_MARKER.length);
        }
        answer = buffer;
        update();
      }
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: answer, sources };
        return copy;
      });
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

  return (
    <div className="mx-auto flex h-[calc(100vh-280px)] max-w-3xl flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
            Ask anything about your uploaded material. Every answer is grounded in your sources and
            cited — if it&apos;s not in your documents, Kiwi says so.
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-kiwi-600 px-4 py-2.5 text-sm text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className="max-w-[95%] rounded-2xl rounded-bl-md border border-line bg-white px-5 py-3.5">
              {m.content ? (
                <Markdown content={m.content} citations />
              ) : (
                <span className="animate-kiwi-pulse text-sm text-ink-soft">Reading your sources…</span>
              )}
              {m.sources && m.sources.length > 0 && !m.streaming && (
                <details className="mt-3 border-t border-line pt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
                    {m.sources.length} sources
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {m.sources.map((s) => (
                      <li key={s.n} className="flex gap-2 text-xs text-ink-soft">
                        <span className="cite-chip !align-baseline">{s.n}</span>
                        <span>
                          <strong>{s.document}</strong> — {s.excerpt}…
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-line pt-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask your sources…"
          disabled={busy}
          className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-kiwi-400 focus:ring-2 focus:ring-kiwi-100 disabled:opacity-60"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-xl bg-kiwi-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-kiwi-700 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
