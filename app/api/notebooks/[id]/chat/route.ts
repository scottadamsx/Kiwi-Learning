import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getClient, MODEL } from "@/lib/anthropic";
import { searchChunks, formatSources } from "@/lib/retrieval";

// Grounded chat over the notebook's uploads — the NotebookLM core.
// Retrieval → generation with inline [n] citations → streamed to the client.
//
// Wire format: the response body starts with a JSON line of sources, then the
// marker line, then raw streamed text. The client splits on the marker.

import { CHAT_STREAM_MARKER as MARKER } from "@/lib/constants";

export const maxDuration = 300;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const messages = db
    .prepare(
      "SELECT role, content, sources, ts FROM chat_messages WHERE notebook_id = ? ORDER BY id"
    )
    .all(id);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { message } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const db = getDb();
  const notebook = db.prepare("SELECT name FROM notebooks WHERE id = ?").get(id) as
    | { name: string }
    | undefined;
  if (!notebook) return NextResponse.json({ error: "Notebook not found" }, { status: 404 });

  const chunks = searchChunks(id, message, 8);
  const { block, sources } = formatSources(chunks);

  const history = (
    db
      .prepare(
        "SELECT role, content FROM chat_messages WHERE notebook_id = ? ORDER BY id DESC LIMIT 10"
      )
      .all(id) as { role: "user" | "assistant"; content: string }[]
  ).reverse();

  db.prepare("INSERT INTO chat_messages (notebook_id, role, content) VALUES (?, 'user', ?)").run(
    id,
    message
  );

  const client = getClient();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    system: `You are the study assistant inside "${notebook.name}", answering ONLY from the learner's uploaded sources below. Ground every factual claim in the sources and cite inline with bracketed source numbers like [1] or [2][3] immediately after the claim. If the sources don't contain the answer, say so plainly rather than guessing — you may note what the sources DO cover. Use Markdown; use $...$ LaTeX for math. Be concise and direct.

Sources for this question:
${block}`,
    messages: [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: message },
    ],
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ sources }) + MARKER));
      let full = "";
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "\n\n_(The model declined to answer this request.)_";
          full += note;
          controller.enqueue(encoder.encode(note));
        }
      } catch (err) {
        const note = `\n\n_(Error: ${err instanceof Error ? err.message : "stream failed"})_`;
        full += note;
        controller.enqueue(encoder.encode(note));
      }
      db.prepare(
        "INSERT INTO chat_messages (notebook_id, role, content, sources) VALUES (?, 'assistant', ?, ?)"
      ).run(id, full, JSON.stringify(sources));
      controller.close();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
