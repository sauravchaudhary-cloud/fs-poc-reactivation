// ponytail: Gemini behind the same `messages.create`, through Google's OpenAI-compatible API, so the loop, the tools
// and `vet` run unchanged on a free key. Drop this file once testing is on Claude.
import type Anthropic from "@anthropic-ai/sdk";

// Gemini's own message, carried in the assistant turn's content: its thought signatures must go back as they came.
type GeminiBlock = { type: "gemini"; message: GeminiMessage };
type GeminiMessage = { content?: string | null; tool_calls?: ToolCall[] };
type ToolCall = { id?: string; function: { name: string; arguments?: string } };
// Google's chat completion, as much of it as the loop reads.
type Completion = {
  choices: { message: GeminiMessage; finish_reason: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};
// A model on a key: free quotas are per model and per Google project, so each pair rests from its own limits.
type Pair = { model: string; apiKey: string; keyNumber: number; id: string }; // id: "<model> <key number>"

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});

// `list`: the keys, one per Google project, comma-separated. They take turns with the models (comma-separated, fastest
// first): each call goes to the first model, on the first key, that isn't resting from a limit.
export function geminiClient(list: string) {
  const keys = list
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  // Pair id → when its rest ends. ponytail: in memory, so each instance finds out for itself, with one wasted call.
  const rests = new Map<string, number>();
  const create = async (request: Anthropic.MessageCreateParamsNonStreaming) => {
    const body = toOpenAI(request);
    const pairs = request.model
      .split(",")
      .flatMap((model) => keys.map((apiKey, i) => ({ model, apiKey, keyNumber: i + 1, id: `${model} ${i + 1}` })));
    const { json, pair } = await send(body, pairs, rests);
    return toAnthropic(json, pair);
  };
  return { messages: { create } } as unknown as Anthropic;
}

// The request in OpenAI's shape, all but the model, which `send` picks.
function toOpenAI(request: Anthropic.MessageCreateParamsNonStreaming) {
  const system = (request.system as Anthropic.TextBlockParam[]).map((b) => b.text).join("\n");
  const messages = [{ role: "system", content: system }, ...request.messages.flatMap(toOpenAIMessages)];
  const tools = request.tools!.map((tool) => {
    const { name, description, input_schema: parameters } = tool as Anthropic.Tool;
    return { type: "function", function: { name, description, parameters } };
  });
  return { max_tokens: request.max_tokens, reasoning_effort: "low", messages, tools };
}

// One message in OpenAI's shape: an assistant turn goes back as Gemini's own message, and each block of a user turn is
// a tool result or a line of text.
function toOpenAIMessages(message: Anthropic.MessageParam): unknown[] {
  if (typeof message.content === "string") return [{ role: message.role, content: message.content }];
  if (message.role === "assistant")
    return [(message.content as unknown as GeminiBlock[]).find((b) => b.type === "gemini")!.message];
  return message.content.map((block) =>
    block.type === "tool_result"
      ? { role: "tool", tool_call_id: block.tool_use_id, content: block.content }
      : { role: "user", content: (block as Anthropic.TextBlockParam).text },
  );
}

// Posts to the first pair that isn't resting. A limit (429: "retry in 24s" for a minute's, "retry in 51000s" for a
// day's) rests that model on that key; a busy model (503, the whole model overloaded) rests on every key for 20 s. The
// next pair takes over; with every pair resting, it waits if one frees within a minute, or fails.
async function send(body: ReturnType<typeof toOpenAI>, pairs: Pair[], rests: Map<string, number>) {
  let waits = 0;
  for (;;) {
    const pair = pairs.find((p) => (rests.get(p.id) ?? 0) <= Date.now());
    if (!pair) {
      await waitForSoonest(pairs, rests, waits);
      waits++;
      continue;
    }
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${pair.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: pair.model, ...body }),
      signal: AbortSignal.timeout(45_000),
    });
    const json: unknown = await response.json();
    const seconds = restFor(response.status, json);
    if (!seconds) {
      if (!response.ok) throw new Error(`Gemini ${response.status}: ${JSON.stringify(json).slice(0, 160)}`);
      return { json, pair };
    }
    const busy = response.status === 503;
    for (const other of pairs)
      if (other === pair || (busy && other.model === pair.model)) rests.set(other.id, Date.now() + seconds * 1000);
    const what = busy ? `${pair.model} is busy` : `${pair.model} on key ${pair.keyNumber} is at its limit`;
    console.log(`gemini: ${what} until ${IST.format(Date.now() + seconds * 1000)}`);
  }
}

// With every pair resting: it waits until a second after the soonest frees, if that's within a minute and it hasn't
// waited twice already for this call; otherwise it fails.
async function waitForSoonest(pairs: Pair[], rests: Map<string, number>, waited: number) {
  const soonest = Math.min(...pairs.map((p) => rests.get(p.id) ?? 0));
  if (soonest - Date.now() > 60_000 || waited === 2)
    throw new Error(`every Gemini key is at its limit until ${IST.format(soonest)} IST`);
  await new Promise((resolve) => setTimeout(resolve, soonest - Date.now() + 1000));
}

// How long a pair rests after this answer, in seconds; 0 if it doesn't. A limit says how long (99 s if it doesn't
// say); a busy model rests 20 s.
function restFor(status: number, json: unknown) {
  if (status === 503) return 20;
  if (status === 429) return Number(/"retryDelay":\s*"(\d+)/.exec(JSON.stringify(json))?.[1] ?? 99);
  return 0;
}

// Google's answer in Anthropic's shape: Gemini's own message first, to go back next round as it came, then its text
// and its tool calls. `key` and `model` say which pair answered, for the trace.
function toAnthropic(json: unknown, pair: Pair) {
  const completion = (Array.isArray(json) ? json[0] : json) as Completion;
  const { message, finish_reason: finishReason } = completion.choices[0];
  const toolCalls = message.tool_calls ?? [];
  // A call that came without an id gets one, on Gemini's own message too, so the results sent back match it.
  toolCalls.forEach((call, i) => {
    call.id ??= `call_${i}`;
  });
  const usage = completion.usage ?? {};
  return {
    key: pair.keyNumber,
    model: pair.model,
    usage: {
      input_tokens: usage.prompt_tokens ?? 0,
      // Output includes thinking, which is billed as output.
      output_tokens: (usage.total_tokens ?? 0) - (usage.prompt_tokens ?? 0) || (usage.completion_tokens ?? 0),
    },
    stop_reason: stopReason(toolCalls.length > 0, finishReason),
    content: [
      { type: "gemini", message },
      ...(message.content ? [{ type: "text", text: message.content }] : []),
      ...toolCalls.map((call) => ({
        type: "tool_use",
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments || "{}"),
      })),
    ],
  };
}

// Any tool call makes it "tool_use"; a "length" finish ran out of max_tokens.
function stopReason(calledTools: boolean, finishReason: string) {
  if (calledTools) return "tool_use";
  return finishReason === "length" ? "max_tokens" : "end_turn";
}
