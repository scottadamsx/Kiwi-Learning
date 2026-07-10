"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useEffect, useId, useRef, useState } from "react";

// Markdown renderer for lessons, cards, quiz feedback, and chat.
// KaTeX for math, Mermaid for diagrams, [n] citation chips when enabled.

function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
        const { svg } = await mermaid.render(`m${id}`, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  if (error) {
    return <pre className="text-xs">{code}</pre>;
  }
  return <div ref={ref} className="my-4 flex justify-center overflow-x-auto" />;
}

function withCitations(text: string): React.ReactNode[] {
  const parts = text.split(/(\[\d{1,2}\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d{1,2})\]$/);
    if (m) {
      return (
        <span key={i} className="cite-chip" title={`Source ${m[1]}`}>
          {m[1]}
        </span>
      );
    }
    return part;
  });
}

export default function Markdown({
  content,
  citations = false,
}: {
  content: string;
  citations?: boolean;
}) {
  return (
    <div className="prose-kiwi">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code(props) {
            const { className, children } = props;
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            if (lang === "mermaid") {
              return <MermaidBlock code={String(children).trim()} />;
            }
            return <code className={className}>{children}</code>;
          },
          ...(citations
            ? {
                p(props) {
                  return <p>{mapCitations(props.children)}</p>;
                },
                li(props) {
                  return <li>{mapCitations(props.children)}</li>;
                },
              }
            : {}),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function mapCitations(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") return withCitations(children);
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string" ? <span key={i}>{withCitations(c)}</span> : c
    );
  }
  return children;
}
