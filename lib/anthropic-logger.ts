import fs from "node:fs";
import path from "node:path";

export type Tokens = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export type AnthropicApiCall = {
  id: string;
  timestamp: string; // ISO string
  timeFormatted: string; // e.g. "12:15:30"
  model: string;
  durationMs: number;
  speedTokPerSec: number; // generation speed (output tokens / second)
  tokens: Tokens & { total: number };
  cost: number; // US dollars
  costFormatted: string; // e.g. "$0.00312"
  stopReason: string;
  tools: string[];
  status: "success" | "error";
  error?: string;
  caller?: string;
};

export type AnthropicStats = {
  totalCalls: number;
  totalCost: number;
  totalTokens: number;
  totalDurationMs: number;
  avgDurationMs: number;
  avgSpeedTokPerSec: number;
};

type PerMillion = [input: number, output: number, cacheRead: number, cacheWrite: number];

// List prices per million tokens (USD): input, output, cache read, cache write.
export const ANTHROPIC_PRICING: [RegExp, PerMillion][] = [
  [/haiku-5[-.]5/, [0.1, 0.5, 0.01, 0.125]],
  [/haiku-4[-.]5/, [1, 5, 0.1, 1.25]],
  [/haiku/, [1, 5, 0.1, 1.25]],
  [/sonnet-5[-.]5/, [2, 10, 0.2, 2.5]],
  [/sonnet/, [3, 15, 0.3, 3.75]],
  [/opus-5[-.]5/, [4, 20, 0.2, 5]],
  [/opus/, [15, 75, 1.5, 18.75]],
  [/fable/, [10, 50, 0.25, 12.5]],
];

// Calculate US dollars for tokens based on model name.
export function calculateAnthropicCost(model: string, tokens: Tokens): number {
  const price = ANTHROPIC_PRICING.find(([pattern]) => pattern.test(model))?.[1] ?? [1, 5, 0.1, 1.25];
  const [input, output, cacheRead, cacheWrite] = price;
  const millionths =
    tokens.input * input + tokens.output * output + tokens.cacheRead * cacheRead + tokens.cacheWrite * cacheWrite;
  return millionths / 1e6;
}

const LOG_DIR = path.join(process.cwd(), "logs");
const HUMAN_LOG_FILE = path.join(LOG_DIR, "anthropic_api.log");
const JSONL_LOG_FILE = path.join(LOG_DIR, "anthropic_api.jsonl");

// In-memory ring buffer of recent calls (up to 500)
const inMemoryLogs: AnthropicApiCall[] = [];
const MAX_IN_MEMORY = 500;

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (e) {
    console.error("Failed to create log directory:", e);
  }
}

// Format cost to a clean string, e.g. "$0.00341" or "<$0.00001"
export function formatCost(cost: number): string {
  if (cost === 0) return "$0.00000";
  if (cost < 0.00001) return "<$0.00001";
  return "$" + cost.toFixed(5);
}

// Log a completed or failed Anthropic API call.
export function logAnthropicCall(params: {
  model: string;
  durationMs: number;
  tokens: Tokens;
  stopReason?: string;
  tools?: string[];
  status?: "success" | "error";
  error?: string;
  caller?: string;
}): AnthropicApiCall {
  ensureLogDir();

  const now = new Date();
  const timestamp = now.toISOString();
  const timeFormatted = now.toLocaleTimeString("en-GB", { hour12: false });
  const durationMs = Math.max(1, params.durationMs);

  const outputTokens = params.tokens.output || 0;
  // Generation speed in output tokens per second
  const speedTokPerSec = Number((outputTokens / (durationMs / 1000)).toFixed(1));

  const cost = calculateAnthropicCost(params.model, params.tokens);
  const costFormatted = formatCost(cost);
  const totalTokens = params.tokens.input + params.tokens.output + params.tokens.cacheRead + params.tokens.cacheWrite;

  const entry: AnthropicApiCall = {
    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp,
    timeFormatted,
    model: params.model,
    durationMs,
    speedTokPerSec,
    tokens: { ...params.tokens, total: totalTokens },
    cost,
    costFormatted,
    stopReason: params.stopReason ?? (params.status === "error" ? "error" : "end_turn"),
    tools: params.tools ?? [],
    status: params.status ?? (params.error ? "error" : "success"),
    error: params.error,
    caller: params.caller ?? "chat",
  };

  // Add to in-memory buffer
  inMemoryLogs.unshift(entry);
  if (inMemoryLogs.length > MAX_IN_MEMORY) {
    inMemoryLogs.pop();
  }

  // 1. Console Output with clear readable styling
  const cachedPart = params.tokens.cacheRead > 0 ? ` (${params.tokens.cacheRead} cached)` : "";
  const toolsPart = entry.tools.length ? ` · tools: [${entry.tools.join(", ")}]` : "";
  const errorPart = entry.error ? ` · ERROR: ${entry.error}` : "";
  console.log(
    `\x1b[35m[Anthropic API]\x1b[0m \x1b[1m${entry.model}\x1b[0m · \x1b[36m${entry.durationMs}ms\x1b[0m (\x1b[32m${entry.speedTokPerSec} tok/s\x1b[0m) · \x1b[33m${costFormatted}\x1b[0m · ${entry.tokens.input} in / ${entry.tokens.output} out${cachedPart}${toolsPart}${errorPart}`,
  );

  // 2. Append to human-readable log file
  try {
    const logLine = `[${timestamp}] MODEL: ${entry.model.padEnd(20)} | TIMING: ${(entry.durationMs + "ms").padStart(8)} | SPEED: ${(entry.speedTokPerSec + " tok/s").padStart(12)} | COST: ${costFormatted.padStart(10)} | TOKENS: ${String(entry.tokens.input).padStart(5)} in, ${String(entry.tokens.output).padStart(4)} out, ${String(entry.tokens.cacheRead).padStart(4)} cache_read | STOP: ${entry.stopReason}${toolsPart}${errorPart}\n`;
    fs.appendFileSync(HUMAN_LOG_FILE, logLine, "utf-8");
  } catch (err) {
    console.error("Failed to append to anthropic_api.log:", err);
  }

  // 3. Append to JSONL log file
  try {
    fs.appendFileSync(JSONL_LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    console.error("Failed to append to anthropic_api.jsonl:", err);
  }

  return entry;
}

// Get all recent logs and computed aggregate stats
export function getAnthropicLogs(): { calls: AnthropicApiCall[]; stats: AnthropicStats } {
  // If memory buffer is empty (e.g. server restart), populate from JSONL file if present
  if (inMemoryLogs.length === 0 && fs.existsSync(JSONL_LOG_FILE)) {
    try {
      const content = fs.readFileSync(JSONL_LOG_FILE, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      const parsed = lines
        .slice(-MAX_IN_MEMORY)
        .map((l) => {
          try {
            return JSON.parse(l) as AnthropicApiCall;
          } catch {
            return null;
          }
        })
        .filter((c): c is AnthropicApiCall => c !== null);
      inMemoryLogs.push(...parsed.reverse());
    } catch (e) {
      console.error("Failed to load historical Anthropic logs:", e);
    }
  }

  const calls = [...inMemoryLogs];
  const totalCalls = calls.length;
  const totalCost = calls.reduce((sum, c) => sum + c.cost, 0);
  const totalTokens = calls.reduce((sum, c) => sum + c.tokens.total, 0);
  const totalDurationMs = calls.reduce((sum, c) => sum + c.durationMs, 0);
  const avgDurationMs = totalCalls > 0 ? Math.round(totalDurationMs / totalCalls) : 0;
  const totalSpeed = calls.reduce((sum, c) => sum + c.speedTokPerSec, 0);
  const avgSpeedTokPerSec = totalCalls > 0 ? Number((totalSpeed / totalCalls).toFixed(1)) : 0;

  return {
    calls,
    stats: {
      totalCalls,
      totalCost,
      totalTokens,
      totalDurationMs,
      avgDurationMs,
      avgSpeedTokPerSec,
    },
  };
}

// Clear in-memory logs and log files
export function clearAnthropicLogs(): void {
  inMemoryLogs.length = 0;
  try {
    if (fs.existsSync(HUMAN_LOG_FILE)) fs.writeFileSync(HUMAN_LOG_FILE, "");
    if (fs.existsSync(JSONL_LOG_FILE)) fs.writeFileSync(JSONL_LOG_FILE, "");
  } catch (e) {
    console.error("Failed to clear log files:", e);
  }
}
