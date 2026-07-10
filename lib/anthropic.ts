import Anthropic from "@anthropic-ai/sdk";

// Single server-side client. Credentials resolve from ANTHROPIC_API_KEY,
// ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile — never hardcoded.

declare global {
  // eslint-disable-next-line no-var
  var __kiwiAnthropic: Anthropic | undefined;
}

export function getClient(): Anthropic {
  if (!globalThis.__kiwiAnthropic) globalThis.__kiwiAnthropic = new Anthropic();
  return globalThis.__kiwiAnthropic;
}

export const MODEL = process.env.KIWI_MODEL || "claude-opus-4-8";

export function hasCredentials(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  // `ant auth login` stores a profile the SDK resolves automatically.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("os") as typeof import("os");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    return fs.existsSync(path.join(os.homedir(), ".config", "anthropic", "credentials"));
  } catch {
    return false;
  }
}

/**
 * One structured-output call: the response is constrained to `schema`
 * (JSON Schema with additionalProperties:false throughout) and parsed.
 */
export async function generateJson<T>(opts: {
  system?: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<T> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
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
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty model response");
  return JSON.parse(text) as T;
}

/** Plain markdown/text generation (lessons). Streams internally to avoid HTTP timeouts. */
export async function generateText(opts: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<string> {
  const client = getClient();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
    messages: [{ role: "user", content: opts.prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error("The model declined this request (safety refusal).");
  }
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}
