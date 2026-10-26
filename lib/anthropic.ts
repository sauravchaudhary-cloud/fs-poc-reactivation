// Anthropic client factory: builds a standard @anthropic-ai/sdk client for the chosen model,
// always in low-effort mode, with the model name passed through to the loop in lib/ai.ts.
import Anthropic from "@anthropic-ai/sdk";

// The Anthropic models the UI can pick between, keyed the way the switch sends them.
export const ANTHROPIC_MODELS: Record<string, string> = {
  haiku: "claude-haiku-5-5",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
  fable: "claude-fable-5-1",
};

// A ready-to-use Anthropic client for a model key ("haiku", "sonnet", "opus", "fable").
// The caller still passes `model` to each `messages.create` call; this just wires the key.
export function anthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
}

// Resolves a UI model key to the Anthropic model identifier. Falls back to haiku.
export function anthropicModel(key: string): string {
  return ANTHROPIC_MODELS[key] ?? ANTHROPIC_MODELS.haiku;
}
