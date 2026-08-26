import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { toStrictJsonSchema } from "./schema";
import type { JsonRequest, LlmAdapter, LlmClient, LlmErrorInfo } from "./types";

/**
 * Adapters that run on an installed CLI instead of an API key.
 *
 * Claude Code and Codex are already paid for by a subscription and already
 * logged in on the machine the server runs on. So there is no key to enter:
 * `create()` ignores the apiKey argument, and the settings form saves a
 * sentinel instead of a secret. What the "check key" ping verifies here is
 * that the binary exists and the login hasn't expired.
 *
 * Neither CLI enforces a response schema, so the schema goes into the system
 * prompt as text and the answer is cut down to its outermost JSON. Both points
 * are weaker guarantees than the API adapters give — the price of not paying
 * per token.
 *
 * The subprocess runs in the OS temp dir on purpose: in the project directory
 * Claude Code would pick up CLAUDE.md and session state, and the model would
 * answer as a coding agent standing in someone's repo.
 */

/**
 * Nothing upstream bounds a subprocess: a CLI that stops to ask something it
 * cannot ask — an expired login, a permission prompt — would hold the request
 * open forever. Generous enough for a slow model, short enough that a stuck
 * process turns into an error a person can read.
 */
const CLI_TIMEOUT_MS = 120_000;

class CliExitError extends Error {
  constructor(cmd: string, code: number | null, stderr: string) {
    super(`${cmd} exited with ${code}: ${stderr.slice(0, 2000)}`);
    this.name = "CliExitError";
  }
}

function runCli(cmd: string, args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: tmpdir(),
      env: process.env,
      timeout: CLI_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));

    // ENOENT (binary not on PATH) lands here, not in "close"
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve(out);
      // A killed process has no exit code, so say what happened instead of
      // reporting "exited with null" and leaving the classifier to guess.
      else if (signal) reject(new CliExitError(cmd, code, `killed after ${CLI_TIMEOUT_MS}ms (${signal})`));
      else reject(new CliExitError(cmd, code, err || out));
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

/** The schema travels as prompt text — the CLIs have no structured-output flag. */
function systemWithSchema(req: JsonRequest): string {
  return (
    `${req.system}\n\n` +
    `Answer with a single JSON object that conforms to this JSON Schema. ` +
    `No markdown fences, no prose before or after the JSON:\n` +
    JSON.stringify(toStrictJsonSchema(req.schema))
  );
}

/**
 * Cut the answer down to its first complete JSON value — fences and politeness
 * fall away with the slice.
 *
 * Slicing to the *last* closing brace looked simpler and was wrong: asked for
 * JSON and nothing else, these CLIs still append a sentence of commentary often
 * enough to matter, and one brace in that sentence drags the slice past the end
 * of the object. The caller parses this outside the retry wrapper, so a bad
 * slice is not a retry, it is an error in someone's face. Counting depth costs
 * a loop and ends the guessing.
 */
function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.search(/[{[]/);
  if (start < 0) return trimmed;

  const closerFor = trimmed[start] === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      // Depth back to zero on the matching kind of bracket: the value is whole
      if (depth === 0 && ch === closerFor) return trimmed.slice(start, i + 1);
    }
  }

  // Never closed — hand back what there is and let the parse error say so
  return trimmed.slice(start);
}

/**
 * Both CLIs report trouble as an exit code with prose in stderr, so unlike the
 * API adapters this classifier reads text, not typed exceptions. The patterns
 * are deliberately broad: a missed match degrades into "unknown", which is
 * shown to the user rather than retried.
 */
function classifyCliError(err: unknown): LlmErrorInfo {
  if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
    // The binary isn't there — no retry will install it
    return { kind: "auth", retriable: false, retryAfterMs: null };
  }

  const text = err instanceof Error ? err.message : String(err);

  if (/log ?in|logged out|authenticat|api key|credential|unauthorized|401|403/i.test(text)) {
    return { kind: "auth", retriable: false, retryAfterMs: null };
  }
  if (/usage limit|limit reached|quota/i.test(text)) {
    // The subscription window is spent — resets in hours, not in a retry loop
    return { kind: "daily_quota", retriable: false, retryAfterMs: null };
  }
  if (/rate.?limit|too many|429/i.test(text)) {
    return { kind: "rate_limit", retriable: true, retryAfterMs: null };
  }
  if (/overloaded|529|503/i.test(text)) {
    return { kind: "overloaded", retriable: true, retryAfterMs: null };
  }
  return { kind: "unknown", retriable: false, retryAfterMs: null };
}

/**
 * Claude Code in print mode: prompt on stdin, one JSON envelope on stdout.
 *
 * `--system-prompt` replaces the coding-agent system prompt entirely — without
 * that the model introduces itself as Claude Code and reaches for tools. The
 * model ids are the CLI's own aliases (opus/sonnet/haiku), which survive model
 * releases; "default" passes no flag at all and follows the CLI's settings.
 */
async function runClaude(req: JsonRequest, model: string): Promise<string> {
  /*
   * `--tools ""` leaves the model with no tools at all. Print mode would
   * otherwise hand a coding agent the file system of the machine hosting the
   * server, with a person's own diary text sitting in the prompt — and the
   * only thing wanted back here is a paragraph of JSON.
   */
  const args = [
    "-p",
    "--output-format",
    "json",
    "--tools",
    "",
    "--system-prompt",
    systemWithSchema(req),
  ];
  if (model !== "default") args.push("--model", model);

  const out = await runCli("claude", args, req.prompt);

  const envelope = JSON.parse(out) as { is_error?: boolean; result?: string; subtype?: string };
  if (envelope.is_error || typeof envelope.result !== "string") {
    throw new Error(`claude returned ${envelope.subtype ?? "error"}: ${envelope.result ?? out.slice(0, 500)}`);
  }
  return extractJson(envelope.result);
}

/**
 * Codex in exec mode. No system-prompt flag exists, so system and prompt are
 * concatenated; the final message goes to a file because stdout carries logs.
 * The read-only sandbox is deliberate: the model is here to answer, not to act.
 */
async function runCodex(req: JsonRequest, model: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "curio-codex-"));
  const outFile = join(dir, "last-message.txt");
  try {
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--output-last-message",
      outFile,
      "-",
    ];
    if (model !== "default") args.splice(1, 0, "-m", model);

    await runCli("codex", args, `${systemWithSchema(req)}\n\n${req.prompt}`);
    return extractJson(await readFile(outFile, "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function cliClient(
  provider: "claude-code" | "codex",
  model: string,
  run: (req: JsonRequest, model: string) => Promise<string>
): LlmClient {
  return {
    provider,
    model,
    generateJson: (req) => run(req, model),

    // ponytail: no token stream over a subprocess — one delta with the whole
    // answer at the end. Parse `--output-format stream-json` if live typing matters.
    async streamJson(req, onDelta) {
      const text = await run(req, model);
      onDelta(text);
      return text;
    },
  };
}

export const claudeCodeAdapter: LlmAdapter = {
  id: "claude-code",
  label: "Claude Code (CLI)",
  keyHelpUrl: "https://claude.com/claude-code",
  needsKey: false,
  models: [
    { id: "default", label: "Default" },
    { id: "opus", label: "Claude Opus" },
    { id: "sonnet", label: "Claude Sonnet" },
    { id: "haiku", label: "Claude Haiku" },
  ],
  create: (_apiKey, model) => cliClient("claude-code", model, runClaude),
  classifyError: classifyCliError,
};

export const codexAdapter: LlmAdapter = {
  id: "codex",
  label: "Codex (CLI)",
  keyHelpUrl: "https://developers.openai.com/codex/cli",
  needsKey: false,
  models: [{ id: "default", label: "Default" }],
  create: (_apiKey, model) => cliClient("codex", model, runCodex),
  classifyError: classifyCliError,
};
