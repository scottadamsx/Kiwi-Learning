import Anthropic from "@anthropic-ai/sdk";
import { execFile, execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { getDb } from "./db";

// LLM provider layer. Two ways to run Kiwi, checked in order:
//   1. "api"          — ANTHROPIC_API_KEY / auth token / `ant` profile → direct SDK calls.
//   2. "claude-code"  — no key, but the `claude` CLI is installed → headless
//                       `claude -p` calls that ride the user's Claude Code
//                       subscription login. No API key needed.
// KIWI_PROVIDER=api|claude-code forces one.
//
// Model tiers — the right brain for each job, so tokens go where they matter:
//   plan     — outline extraction / curriculum planning (the hardest reasoning).
//              Defaults to Claude Fable on the Claude Code path.
//   content  — lessons, flashcards, quiz authoring.
//   fast     — grading samples, chat, assignment tutoring (frequent calls).
// Override with KIWI_MODEL_PLAN / KIWI_MODEL_CONTENT / KIWI_MODEL_FAST,
// or KIWI_MODEL to pin every tier to one model.

export type Provider = "api" | "claude-code" | "none";
export type Tier = "plan" | "content" | "fast";

declare global {
  // eslint-disable-next-line no-var
  var __kiwiAnthropic: Anthropic | undefined;
}

export function getClient(): Anthropic {
  if (!globalThis.__kiwiAnthropic) globalThis.__kiwiAnthropic = new Anthropic();
  return globalThis.__kiwiAnthropic;
}

export function apiCredsAvailable(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  try {
    return fs.existsSync(path.join(os.homedir(), ".config", "anthropic", "credentials"));
  } catch {
    return false;
  }
}

let cliPathCache: string | null | undefined;
export function claudeCliPath(): string | null {
  if (cliPathCache !== undefined) return cliPathCache;
  try {
    const found = execSync("which claude", { encoding: "utf-8" }).trim();
    if (found) {
      cliPathCache = found;
      return found;
    }
  } catch {
    // fall through to common install locations (server may lack shell PATH)
  }
  for (const p of [
    path.join(os.homedir(), ".local", "bin", "claude"),
    path.join(os.homedir(), ".claude", "local", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ]) {
    if (fs.existsSync(p)) {
      cliPathCache = p;
      return p;
    }
  }
  cliPathCache = null;
  return null;
}

export function provider(): Provider {
  const forced = process.env.KIWI_PROVIDER;
  if (forced === "api") return apiCredsAvailable() ? "api" : "none";
  if (forced === "claude-code") return claudeCliPath() ? "claude-code" : "none";
  if (apiCredsAvailable()) return "api";
  if (claudeCliPath()) return "claude-code";
  return "none";
}

/**
 * Resolve the model for a tier. `null` means "no --model flag" on the CLI
 * path (use the user's Claude Code default).
 */
export function modelFor(tier: Tier): string | null {
  if (process.env.KIWI_MODEL) return process.env.KIWI_MODEL; // pin everything
  const env = {
    plan: process.env.KIWI_MODEL_PLAN,
    content: process.env.KIWI_MODEL_CONTENT,
    fast: process.env.KIWI_MODEL_FAST,
  }[tier];
  if (env) return env;

  if (provider() === "claude-code") {
    // Subscription pricing → Fable is affordable for the one big planning call.
    if (tier === "plan") return "claude-fable-5";
    if (tier === "fast") return "claude-sonnet-4-6";
    return null; // content: whatever the user's Claude Code is set to
  }
  // API pricing → Opus for quality work, Sonnet for the frequent calls.
  if (tier === "fast") return "claude-sonnet-4-6";
  return "claude-opus-4-8";
}

/** Kept for display/back-compat (health endpoint, chat). */
export const MODEL = process.env.KIWI_MODEL || "claude-opus-4-8";

// ---------------------------------------------------------------------------
// Usage log — every call records tokens/cost so Settings can show where the
// budget actually goes.

function logUsage(row: {
  task: string;
  prov: Provider;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  ms: number;
}) {
  try {
    getDb()
      .prepare(
        `INSERT INTO usage_log (task, provider, model, input_tokens, output_tokens, cost_usd, ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(row.task, row.prov, row.model, row.input_tokens, row.output_tokens, row.cost_usd, row.ms);
  } catch {
    // usage logging must never break generation
  }
}

// ---------------------------------------------------------------------------
// Claude Code CLI backend: headless single-shot generation on the user's
// subscription. Prompt goes over stdin (can be hundreds of KB); the small
// system prompt rides as a flag.

interface CliResult {
  text: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
}

function runClaudeCli(opts: {
  system?: string;
  prompt: string;
  model: string | null;
}): Promise<CliResult> {
  const cli = claudeCliPath();
  if (!cli) {
    return Promise.reject(
      new Error("Claude Code CLI not found. Install it or add an ANTHROPIC_API_KEY.")
    );
  }
  const args = ["-p", "--output-format", "json", "--max-turns", "1"];
  if (opts.system) args.push("--append-system-prompt", opts.system);
  if (opts.model) args.push("--model", opts.model);

  return new Promise((resolve, reject) => {
    const child = execFile(
      cli,
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout: 900_000 },
      (err, stdout, stderr) => {
        const loginError = (msg: string) =>
          /log ?in|authenticat|credential|api key/i.test(msg)
            ? new Error(
                "Claude Code isn't logged in. Open a terminal, run `claude`, and use /login — then try again."
              )
            : null;
        if (err && !stdout) {
          const msg = (stderr || err.message).slice(0, 500);
          reject(loginError(msg) ?? new Error(`Claude Code call failed: ${msg}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.is_error || parsed.subtype !== "success") {
            const msg: string = String(parsed.result || parsed.error || "unknown error");
            reject(
              loginError(msg) ?? new Error(`Claude Code returned an error: ${msg.slice(0, 400)}`)
            );
            return;
          }
          const usage = parsed.usage ?? {};
          resolve({
            text: String(parsed.result ?? ""),
            model: opts.model ?? String(parsed.model ?? "claude-code-default"),
            input_tokens:
              (usage.input_tokens ?? 0) +
              (usage.cache_read_input_tokens ?? 0) +
              (usage.cache_creation_input_tokens ?? 0),
            output_tokens: usage.output_tokens ?? 0,
            cost_usd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null,
          });
        } catch {
          reject(new Error(`Couldn't parse Claude Code output: ${stdout.slice(0, 200)}`));
        }
      }
    );
    child.stdin?.write(opts.prompt);
    child.stdin?.end();
  });
}

/**
 * Pull the JSON object out of a possibly-fenced, possibly-chatty reply.
 *
 * Order matters: parse the whole reply FIRST. Generated content legitimately
 * contains ``` fences (Mermaid diagrams, code samples) *inside* JSON string
 * values — stripping "the first fenced block" would yank the diagram out of
 * the middle of a perfectly good JSON object and throw the object away.
 */
function extractJson(text: string): string {
  const trimmed = text.trim();

  const isParseable = (s: string) => {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  };

  // 1. The reply is already pure JSON (the common case).
  if (isParseable(trimmed)) return trimmed;

  // 2. The whole reply is wrapped in one ```json fence.
  const wrapped = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (wrapped && isParseable(wrapped[1].trim())) return wrapped[1].trim();

  // 3. Prose around a JSON object: take the outermost braces and verify.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const candidate = trimmed.slice(start, end + 1);
    if (isParseable(candidate)) return candidate;
  }

  throw new Error("Model reply contained no valid JSON object");
}

// ---------------------------------------------------------------------------
// Public generation API — same signatures regardless of provider.

export interface GenOpts {
  system?: string;
  prompt: string;
  maxTokens?: number;
  tier?: Tier; // default "content"
  effort?: "low" | "medium" | "high" | "xhigh" | "max"; // API path only
  task?: string; // usage-log label
}

export async function generateJson<T>(opts: GenOpts & { schema: Record<string, unknown> }): Promise<T> {
  const p = provider();
  if (p === "none") throw noProviderError();
  const tier = opts.tier ?? "content";
  const model = modelFor(tier);
  const started = Date.now();

  if (p === "claude-code") {
    const res = await runClaudeCli({
      system: opts.system,
      model,
      prompt: `${opts.prompt}

Respond with ONLY a single valid JSON object that conforms to this JSON Schema — no prose before or after, no markdown fences:
${JSON.stringify(opts.schema)}`,
    });
    logUsage({
      task: opts.task ?? "json",
      prov: p,
      model: res.model,
      input_tokens: res.input_tokens,
      output_tokens: res.output_tokens,
      cost_usd: res.cost_usd,
      ms: Date.now() - started,
    });
    return JSON.parse(extractJson(res.text)) as T;
  }

  const client = getClient();
  const response = await client.messages.create({
    model: model!,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: opts.system } : {}),
    output_config: {
      format: { type: "json_schema", schema: opts.schema },
      ...(opts.effort ? { effort: opts.effort } : {}),
    },
    messages: [{ role: "user", content: opts.prompt }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this request (safety refusal).");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Generation hit the output-token limit; try smaller inputs.");
  }
  logUsage({
    task: opts.task ?? "json",
    prov: p,
    model: model!,
    input_tokens:
      response.usage.input_tokens +
      (response.usage.cache_read_input_tokens ?? 0) +
      (response.usage.cache_creation_input_tokens ?? 0),
    output_tokens: response.usage.output_tokens,
    cost_usd: null,
    ms: Date.now() - started,
  });
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty model response");
  return JSON.parse(text) as T;
}

export async function generateText(opts: GenOpts): Promise<string> {
  const p = provider();
  if (p === "none") throw noProviderError();
  const tier = opts.tier ?? "content";
  const model = modelFor(tier);
  const started = Date.now();

  if (p === "claude-code") {
    const res = await runClaudeCli({ system: opts.system, model, prompt: opts.prompt });
    logUsage({
      task: opts.task ?? "text",
      prov: p,
      model: res.model,
      input_tokens: res.input_tokens,
      output_tokens: res.output_tokens,
      cost_usd: res.cost_usd,
      ms: Date.now() - started,
    });
    return res.text;
  }

  const client = getClient();
  const stream = client.messages.stream({
    model: model!,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
    messages: [{ role: "user", content: opts.prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error("The model declined this request (safety refusal).");
  }
  logUsage({
    task: opts.task ?? "text",
    prov: p,
    model: model!,
    input_tokens:
      message.usage.input_tokens +
      (message.usage.cache_read_input_tokens ?? 0) +
      (message.usage.cache_creation_input_tokens ?? 0),
    output_tokens: message.usage.output_tokens,
    cost_usd: null,
    ms: Date.now() - started,
  });
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function noProviderError(): Error {
  return new Error(
    "No way to reach Claude. Either log into Claude Code (run `claude`, then /login) or add an ANTHROPIC_API_KEY in .env.local."
  );
}

/** Quick end-to-end check of whichever provider is active. */
export async function testConnection(): Promise<{ ok: boolean; provider: Provider; error?: string }> {
  const p = provider();
  if (p === "none") return { ok: false, provider: p, error: noProviderError().message };
  try {
    await generateText({ prompt: "Reply with exactly: OK", tier: "fast", task: "healthcheck" });
    return { ok: true, provider: p };
  } catch (err) {
    return { ok: false, provider: p, error: err instanceof Error ? err.message : String(err) };
  }
}
