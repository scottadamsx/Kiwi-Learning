import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// One SQLite database holds documents, chunks, the module/section outline,
// generated content, per-card FSRS state, per-section BKT mastery, and chat
// history. Survives dev-server hot reloads via globalThis.

const DATA_DIR = path.join(process.cwd(), "data");

declare global {
  // eslint-disable-next-line no-var
  var __kiwiDb: Database.Database | undefined;
}

function init(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "kiwi.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'empty',
      status_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      char_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_notebook ON chunks(notebook_id);
    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_modules_notebook ON modules(notebook_id);
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 2,
      position INTEGER NOT NULL DEFAULT 0,
      mastery REAL NOT NULL DEFAULT 0.2,
      last_activity TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sections_notebook ON sections(notebook_id);
    CREATE TABLE IF NOT EXISTS section_edges (
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      from_section TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      to_section TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      PRIMARY KEY (from_section, to_section)
    );
    CREATE TABLE IF NOT EXISTS chunk_sections (
      chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      PRIMARY KEY (chunk_id, section_id)
    );
    CREATE TABLE IF NOT EXISTS lessons (
      section_id TEXT PRIMARY KEY REFERENCES sections(id) ON DELETE CASCADE,
      content_md TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      fsrs_state TEXT NOT NULL,
      due TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cards_notebook_due ON cards(notebook_id, due);
    CREATE TABLE IF NOT EXISTS review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL,
      ts TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS quiz_items (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL REFERENCES quiz_items(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL,
      notebook_id TEXT NOT NULL,
      answer TEXT NOT NULL,
      score REAL NOT NULL,
      correct INTEGER NOT NULL,
      feedback TEXT,
      ts TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS exclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      ref_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_exclusions_notebook ON exclusions(notebook_id, kind);
    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL,
      ms INTEGER NOT NULL DEFAULT 0,
      ts TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      brief TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS assignment_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      ts TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS assignment_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      ts TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT,
      ts TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Additive migrations for databases created before these columns existed.
  try {
    db.exec("ALTER TABLE sections ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0");
  } catch {
    // column already exists
  }
  // 'quiz' = adaptive quiz items; 'lesson' = the check at the end of a lesson.
  try {
    db.exec("ALTER TABLE quiz_items ADD COLUMN source TEXT NOT NULL DEFAULT 'quiz'");
  } catch {
    // column already exists
  }
  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__kiwiDb) globalThis.__kiwiDb = init();
  return globalThis.__kiwiDb;
}

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
