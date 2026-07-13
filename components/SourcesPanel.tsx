"use client";

import { useRef, useState } from "react";
import type { NotebookDetail } from "./Workspace";
import KiwiGame from "./KiwiGame";

function fileIcon(filename: string, mime: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (mime.startsWith("image/")) return "🖼";
  if (ext === ".pdf") return "📕";
  if ([".doc", ".docx", ".odt", ".rtf"].includes(ext)) return "📘";
  if ([".ppt", ".pptx", ".odp"].includes(ext)) return "📊";
  if ([".xls", ".xlsx", ".ods", ".csv", ".tsv"].includes(ext)) return "📗";
  if (ext === ".epub") return "📚";
  if (ext === ".ipynb") return "📓";
  if ([".js", ".ts", ".tsx", ".py", ".java", ".c", ".cpp", ".go", ".rs", ".sql"].includes(ext))
    return "💻";
  return "📝";
}

export default function SourcesPanel({
  detail,
  onChanged,
}: {
  detail: NotebookDetail;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const notebookId = detail.notebook.id;
  const processing = detail.notebook.status === "processing";

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setErrors([]);
    setNotices([]);
    const form = new FormData();
    list.forEach((f) => form.append("files", f));
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/documents`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      const results = (data.results ?? []) as {
        filename: string;
        ok: boolean;
        error?: string;
        via?: string;
      }[];
      setErrors(results.filter((r) => !r.ok).map((f) => `${f.filename}: ${f.error}`));
      setNotices(
        results
          .filter((r) => r.ok && r.via === "vision transcription")
          .map((r) => `${r.filename} — read with vision (image transcribed to text)`)
      );
    } catch {
      setErrors([
        "Couldn't reach the server. If Kiwi was just updated, refresh the page (⌘⇧R) and try again.",
      ]);
    } finally {
      setUploading(false);
      onChanged();
    }
  }

  async function build() {
    const res = await fetch(`/api/notebooks/${notebookId}/process`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrors([data.error ?? "Couldn't start processing"]);
    }
    onChanged();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6" style={{ width: "100%" }}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
          dragOver ? "border-kiwi-400 bg-kiwi-50" : "border-line bg-white hover:border-kiwi-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <p className="text-3xl">📄</p>
        <p className="mt-2 text-sm font-semibold">
          {uploading ? (
            <span className="animate-kiwi-pulse">
              Uploading &amp; reading… (images are transcribed, so give them a moment)
            </span>
          ) : (
            "Drop any files here or click to browse"
          )}
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          PDFs · Word · PowerPoint · Excel · pages of notes as photos or screenshots · ebooks ·
          Markdown · CSV · code · anything text
        </p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}

      {notices.length > 0 && (
        <div className="rounded-xl border border-kiwi-200 bg-kiwi-50 p-3 text-xs text-kiwi-800">
          {notices.map((n, i) => (
            <p key={i}>👁 {n}</p>
          ))}
        </div>
      )}

      {detail.documents.length > 0 && (
        <div className="rounded-2xl border border-line bg-white">
          <ul className="divide-y divide-line">
            {detail.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span>{fileIcon(d.filename, d.mime)}</span>
                <span className="flex-1 truncate">{d.filename}</span>
                <span className="text-xs text-ink-soft">
                  {(d.char_count / 1000).toFixed(0)}k chars
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.documents.length > 0 && (
        <div className="text-center">
          <button
            onClick={build}
            disabled={processing}
            className="rounded-xl bg-kiwi-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-kiwi-700 disabled:opacity-50"
          >
            {processing ? (
              <span className="animate-kiwi-pulse">
                {detail.notebook.status_message ?? "Building study set…"}
              </span>
            ) : detail.sections.length > 0 ? (
              "Rebuild study set"
            ) : (
              "Build study set"
            )}
          </button>
          <p className="mt-2 text-xs text-ink-soft">
            Kiwi reads everything, maps modules &amp; sections with prerequisites, and writes
            flashcards for each section.
            {detail.sections.length > 0 &&
              " Rebuilding replaces the outline, lessons, and cards — anything you marked 🚫 not-relevant stays excluded."}
          </p>
          {detail.notebook.status === "error" && (
            <p className="mt-2 text-xs font-medium text-red-600">
              {detail.notebook.status_message ?? "Something went wrong — try again."}
            </p>
          )}
          {/* Break out of the narrow column so the game gets real estate. */}
          {processing && (
            <div className="mt-8 w-[calc(100vw-3rem)] max-w-[980px] -translate-x-1/2 [margin-left:50%]">
              <KiwiGame />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
