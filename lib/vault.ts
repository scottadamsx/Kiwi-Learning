import fs from "fs";
import path from "path";
import MiniSearch from "minisearch";
import { getDb } from "./db";

// Personal knowledge connection: point Kiwi at an Obsidian vault (or any
// folder of Markdown notes). Kiwi queries it when writing lessons so it can
// see what the learner already knows — connecting new material to their
// existing notes and calibrating depth. Read-only; nothing is written to the
// vault, and no vault content leaves the machine except inside model prompts.

const MAX_FILES = 4000;
const MAX_FILE_BYTES = 200_000;
const SKIP_DIRS = new Set([".obsidian", ".git", ".trash", "node_modules"]);

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function getVaultPath(): string | null {
  return getSetting("vault_path");
}

export function setVaultPath(p: string): { ok: boolean; error?: string; file_count?: number } {
  const resolved = path.resolve(p.trim());
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return { ok: false, error: "Not a folder" };
  } catch {
    return { ok: false, error: "Folder not found" };
  }
  setSetting("vault_path", resolved);
  vaultCache = null; // reindex on next query
  return { ok: true, file_count: listVaultFiles(resolved).length };
}

export function clearVaultPath() {
  getDb().prepare("DELETE FROM settings WHERE key = 'vault_path'").run();
  vaultCache = null;
}

interface VaultNote {
  id: string; // relative path
  title: string;
  text: string;
}

function listVaultFiles(root: string): string[] {
  const out: string[] = [];
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    return out;
  }
  const walk = (dir: string) => {
    if (out.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      // Stay inside the vault root even through symlinks.
      let real: string;
      try {
        real = fs.realpathSync(full);
      } catch {
        continue;
      }
      if (!real.startsWith(realRoot)) continue;
      if (e.isDirectory()) walk(full);
      else if (/\.(md|markdown|txt)$/i.test(e.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

let vaultCache: { root: string; builtAt: number; index: MiniSearch<VaultNote> } | null = null;
const CACHE_TTL_MS = 5 * 60_000;

function getVaultIndex(): MiniSearch<VaultNote> | null {
  const root = getVaultPath();
  if (!root) return null;
  if (vaultCache && vaultCache.root === root && Date.now() - vaultCache.builtAt < CACHE_TTL_MS) {
    return vaultCache.index;
  }
  const files = listVaultFiles(root);
  const index = new MiniSearch<VaultNote>({
    fields: ["title", "text"],
    storeFields: ["title", "text"],
    searchOptions: { boost: { title: 2 }, fuzzy: 0.15, prefix: true },
  });
  for (const f of files) {
    try {
      if (fs.statSync(f).size > MAX_FILE_BYTES) continue;
      const text = fs.readFileSync(f, "utf-8");
      index.add({
        id: path.relative(root, f),
        title: path.basename(f).replace(/\.(md|markdown|txt)$/i, ""),
        text,
      });
    } catch {
      // unreadable file — skip
    }
  }
  vaultCache = { root, builtAt: Date.now(), index };
  return index;
}

export function vaultStatus(): { connected: boolean; path?: string; file_count?: number } {
  const root = getVaultPath();
  if (!root) return { connected: false };
  try {
    return { connected: true, path: root, file_count: listVaultFiles(root).length };
  } catch {
    return { connected: false };
  }
}

/**
 * Query the learner's notes for material related to a topic. Returns a prompt
 * block (or "" when no vault / no matches) used to personalize lessons.
 */
export function learnerContext(topic: string, maxNotes = 3, clip = 900): string {
  const index = getVaultIndex();
  if (!index) return "";
  const hits = index.search(topic).slice(0, maxNotes);
  if (hits.length === 0) return "";
  const blocks = hits
    .map((h) => {
      const note = h as unknown as VaultNote & { title: string; text: string };
      return `<learner_note title="${note.title}">\n${String(note.text).slice(0, clip)}\n</learner_note>`;
    })
    .join("\n");
  return blocks;
}
