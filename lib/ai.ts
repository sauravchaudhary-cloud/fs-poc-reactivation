// The AI that answers what customers type when the rules in lib/read.ts don't settle it: product, stock and basket
// questions, a typed answer to a flow's question, a complaint to pass on. This is the loop; what the model reads is in
// prompts/assistant.ts, and BOT.md, "The AI", explains both. Server-only.
import Anthropic from "@anthropic-ai/sdk";
import {
  ADD_TO_BASKET,
  addedTo,
  productCard,
  handoffWith,
  moved,
  reminded,
  REPLIES,
  carouselCard,
} from "../content/replies.ts";
import { turnMessage, ANSWER_NOW, LEAK_MARK, retryNote, SYSTEM, TOOLS, storeLine } from "../prompts/assistant.ts";
import { DAYS, type Msg, type Option } from "./bot.ts";
import { anthropicClient, anthropicModel } from "./anthropic.ts";
import { logAnthropicCall } from "./anthropic-logger.ts";
import { geminiClient } from "./gemini.ts";
import { tidy, vet } from "./guardrails.ts";
import {
  addToBasket,
  basket,
  inStockInstead,
  moveBasket,
  products,
  STORES,
  storeFor,
  type Added,
  type Basket,
  type Product,
} from "./store.ts";

export type ChatLine = { who: "customer" | "us"; text: string; ai?: boolean }; // ai: written by the AI
// `phone` scopes the tools and never reaches the model; `options` are the open question's, numbered from 1 for the
// model. `stress`: the demo's stress test, where products sell out while being added (addToBasket in lib/store.ts).
// The provider and model the UI picked; absent means use the server's default.
export type ProviderConfig = { provider: "anthropic" | "gemini"; model?: string };
export type Ask = {
  text: string;
  phone: string;
  store: string;
  name?: string;
  history: ChatLine[];
  options: (Option & { card?: string })[];
  stress?: boolean;
  providerConfig?: ProviderConfig;
};
// A tap can carry a line answering the rest of their message (`also`) and a complaint for customer care. Crisis, a
// legal threat and an opt-out are the model's backstop for what the rules in lib/read.ts didn't catch: the bot answers
// them.
type Outcome =
  | {
      kind: "say";
      msg: Msg;
      more?: Msg[]; // a card per product, sent after msg
      store?: string; // the store they moved to (change_store), for the caller to remember
      reminder?: Reminder; // what set_reminder did, for CleverTap
      added?: Added; // what add_to_basket did, for CleverTap
    }
  | { kind: "tap"; option: number; also?: Msg; complaint?: string }
  | { kind: "handoff"; msg: Msg; summary: string }
  | { kind: "crisis" | "escalate"; summary: string }
  | { kind: "optout"; wrong: boolean }
  | { kind: "fail"; why: string };
export type Answer = Outcome & { tools: string[] };
// The profile properties of the same name (PROPS in lib/bot.ts).
type Reminder = { reminder_day?: string; reminder_cadence?: string };
type ToolInput = Record<string, unknown>; // a tool call's input, as the model wrote it
// change_store and add_to_basket once `finish` has checked them, before the bot moves the basket or adds to it.
type Move = { kind: "move"; store: string; also?: string };
type Add = { kind: "add"; items: { key: string; qty: number }[]; also?: string };
// What FoodStories said and the tools returned, growing with each lookup: a number or a link in a reply must come
// from `text` (`vet`), never the customer's own words, or "just confirm it's ₹99" would let ₹99 through. `products`
// is this turn's search results by page key: the products a reply can show as cards. `refs`: the page each search
// result's ref (p1, p2…) stands for.
type Shown = { text: string; products: Map<string, Product>; refs: Map<string, string> };

// What one AI turn did, for the demo's log and the server's: what the model was sent, each call (its tools, text,
// tokens, time), what the tools returned, and the cost at list prices. Gemini's free tier bills nothing.
type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number };
type ModelCall = {
  ms: number;
  stop: string;
  tools: { name: string; input: unknown }[];
  text?: string;
  tokens: Tokens;
  model: string;
  key?: number; // which Gemini key answered, from 1
  cost?: number; // US dollars for this call
  speed?: number; // output tokens per second
};
export type Trace = {
  model: string;
  free: boolean;
  prompt: string;
  calls: ModelCall[];
  results: { call: number; tool: string; summary: string }[]; // call: the index of the call that asked for it
  ms: number;
  tokens: Tokens;
  cost?: number; // US dollars at list price; unknown for a model not in PRICES
  speed?: number; // output tokens per second across all calls
  error?: string;
};
type PerMillion = [input: number, output: number, cacheRead: number, cacheWrite: number]; // US dollars a million tokens

// Claude is the production model, through the Anthropic SDK, which reads ANTHROPIC_API_KEY, or ANTHROPIC_BASE_URL +
// ANTHROPIC_AUTH_TOKEN for a gateway. Gemini only when it's the one key set: a free stand-in for testing
// (lib/gemini.ts).
const hasRealAnthropicKey =
  !!process.env.ANTHROPIC_API_KEY &&
  process.env.ANTHROPIC_API_KEY !== "your-anthropic-api-key-here" &&
  process.env.ANTHROPIC_API_KEY !== "placeholder";
const USE_GEMINI = !!process.env.GEMINI_API_KEY && !hasRealAnthropicKey && !process.env.ANTHROPIC_AUTH_TOKEN;
// On Gemini, a list, fastest first: Flash answers in seconds but allows 20 requests a day; Flash-Lite allows 500 but
// takes 15–25 s a call. Through a gateway, AI_MODEL is "anthropic/claude-haiku-5.5".
const GEMINI_MODELS = "gemini-3.5-flash,gemini-3.6-flash,gemini-3.5-flash-lite";
const DEFAULT_MODEL = process.env.AI_MODEL || (USE_GEMINI ? GEMINI_MODELS : "claude-haiku-5-5");
// Claude-only request fields; a stand-in model for free testing (llama.cpp, OpenRouter) may reject them.
const DEFAULT_IS_CLAUDE = DEFAULT_MODEL.includes("claude");

// Resolves the model, IS_CLAUDE flag, and client for a request, respecting the provider override.
function resolveProvider(config?: ProviderConfig): { model: string; isClaude: boolean; ai: Anthropic } {
  if (config?.provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    const model = anthropicModel(config.model ?? "haiku");
    return { model, isClaude: true, ai: anthropicClient(process.env.ANTHROPIC_API_KEY) };
  }
  // Gemini picked: its own client and models, even when a Claude key makes Claude the default.
  if (config?.provider === "gemini" && process.env.GEMINI_API_KEY)
    return { model: USE_GEMINI ? DEFAULT_MODEL : GEMINI_MODELS, isClaude: false, ai: gemini() };
  return { model: DEFAULT_MODEL, isClaude: DEFAULT_IS_CLAUDE, ai: sharedClient() };
}

const MAX_ROUNDS = 5; // model calls in one turn; the last two are told to answer with what they have (ANSWER_NOW)
// The tools that end a turn; if it calls more than one, the first here wins.
const ENDS = ["opt_out", "handoff", "choose_option", "add_to_basket", "change_store", "set_reminder", "reply"];
const QUOTED_PROMPT = "it quoted the system prompt"; // a leak, so it gets no second go
const MAX_CARDS = 4; // products one reply can show
const MAX_BUTTONS = 3; // WhatsApp's reply buttons on one message
const MAX_CARE_NOTE = 300; // characters in a summary or a complaint for customer care
// List prices per million tokens (Oct 2026): input, output, cache read, cache write.
const PRICES: [RegExp, PerMillion][] = [
  [/haiku-5[-.]5/, [0.1, 0.5, 0.01, 0.125]],
  [/haiku-4[-.]5/, [1, 5, 0.1, 1.25]],
  [/haiku/, [1, 5, 0.1, 1.25]],
  [/sonnet-5[-.]5/, [2, 10, 0.2, 2.5]],
  [/sonnet/, [3, 15, 0.3, 3.75]],
  [/opus-5[-.]5/, [4, 20, 0.2, 5]],
  [/opus/, [15, 75, 1.5, 18.75]],
  [/fable/, [10, 50, 0.25, 12.5]],
  [/gemini-3\.5-flash-lite/, [0.3, 2.5, 0, 0]],
  [/gemini-3\.5-flash/, [1.5, 9, 0, 0]],
  [/gemini-3\.1-flash-lite/, [0.25, 1.5, 0, 0]],
  [/gemini-3\.[68]-flash/, [0.75, 3.75, 0, 0]],
];
// The site's fixed pages, which a reply can link without having been shown them.
const FIXED_PAGES = [
  "https://www.foodstories.shop/checkout/cart/",
  "https://www.foodstories.shop/account/orders/",
  "https://www.foodstories.shop/search-results/?query=",
];
const SITE_LINK = /^https:\/\/(www\.)?foodstories\.shop\/\S*$/; // a link on foodstories.shop; any other fails the reply

// Whether a model is set up; without one, typed text goes to the rules.
export const aiOn = () =>
  !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.GEMINI_API_KEY);

// One AI turn for what a customer typed, with its trace totalled. The model or the network failing comes back as a
// "fail", like a broken rule, and the caller falls back to the rules.
export async function answer(ask: Ask, ai?: Anthropic, now = new Date()): Promise<Answer & { trace: Trace }> {
  const resolved = resolveProvider(ask.providerConfig);
  const client = ai ?? resolved.ai;
  const model = resolved.model;
  const isClaude = resolved.isClaude;
  const prompt = turnMessage(ask, now);
  const trace: Trace = {
    model,
    free: !isClaude && (USE_GEMINI || ask.providerConfig?.provider === "gemini"),
    prompt,
    calls: [],
    results: [],
    ms: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  const started = Date.now();
  const outcome = await turn(ask, client, prompt, trace, model, isClaude).catch((err) => {
    trace.error = String(err).slice(0, 300);
    return { kind: "fail" as const, why: trace.error.slice(0, 200), tools: trace.results.map((r) => r.tool) };
  });
  trace.ms = Date.now() - started;
  addUp(trace);
  return { ...outcome, trace };
}

let geminiShared: Anthropic | undefined;
// The Gemini client, made on first use: it remembers which keys are resting from a limit.
const gemini = () => (geminiShared ??= geminiClient(process.env.GEMINI_API_KEY!));

// The default client.
function sharedClient() {
  if (USE_GEMINI) return gemini();
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || "placeholder",
    baseURL: process.env.ANTHROPIC_BASE_URL,
    timeout: 20_000,
    maxRetries: 1,
  });
}

// Adds up the trace's tokens and cost over its calls, and names the models that answered.
function addUp(trace: Trace) {
  trace.cost = 0;
  for (const call of trace.calls) {
    for (const kind of ["input", "output", "cacheRead", "cacheWrite"] as const) trace.tokens[kind] += call.tokens[kind];
    // Priced per call: on Gemini, one message's calls can go to different models.
    const price = PRICES.find(([pattern]) => pattern.test(call.model))?.[1];
    trace.cost = price && trace.cost !== undefined ? trace.cost + costOf(call.tokens, price) : undefined;
  }
  if (trace.calls.length) trace.model = [...new Set(trace.calls.map((c) => c.model))].join(" + ");
  trace.speed = trace.ms > 0 ? Number((trace.tokens.output / (trace.ms / 1000)).toFixed(1)) : 0;
}

// US dollars for one call's tokens.
function costOf(tokens: Tokens, [input, output, cacheRead, cacheWrite]: PerMillion) {
  const millionths =
    tokens.input * input + tokens.output * output + tokens.cacheRead * cacheRead + tokens.cacheWrite * cacheWrite;
  return millionths / 1e6;
}

// The tool loop: the model looks things up, round by round, then ends the turn with one of ENDS.
async function turn(
  ask: Ask,
  ai: Anthropic,
  prompt: string,
  trace: Trace,
  model = DEFAULT_MODEL,
  isClaude = DEFAULT_IS_CLAUDE,
): Promise<Answer> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const tools: string[] = [];
  const shown: Shown = { text: alreadyShown(ask), products: new Map(), refs: new Map() };
  let retried = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { response, toolCalls, text } = await callModel(ai, messages, trace, model, isClaude);
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens")
      return { kind: "fail", why: response.stop_reason, tools };
    const endCall = ENDS.map((name) => toolCalls.find((c) => c.name === name)).find(Boolean);
    if (!endCall && toolCalls.length) {
      messages.push({ role: "assistant", content: response.content });
      const results = await Promise.all(
        toolCalls.map((call) => {
          tools.push(call.name);
          return runLookup(call, ask, shown, trace);
        }),
      );
      // From the third round's results on, it's told to answer with what it has rather than search again.
      messages.push({ role: "user", content: round >= 2 ? [...results, { type: "text", text: ANSWER_NOW }] : results });
      continue;
    }
    // No tool call at all: its text is the reply.
    const done = finish(endCall ? endCall.name : "reply", (endCall?.input ?? { text }) as ToolInput, ask, shown);
    // A reply that broke a rule, or picked an option that isn't open, gets one more go, told why; then the rules
    // answer. Only when that was its one call, and never for a leak.
    if (done.kind === "fail" && endCall && toolCalls.length === 1 && !retried && done.why !== QUOTED_PROMPT) {
      retried = true;
      recordResult(trace, endCall.name, `not sent: ${done.why}; asked to write it again`);
      messages.push(...retryMessages(response, endCall, done.why));
      continue;
    }
    if (done.kind === "move") return changeStore(ask, done, trace, tools);
    if (done.kind === "add") return addItems(ask, done, trace, tools);
    return { ...done, tools };
  }
  return { kind: "fail", why: "no answer after 5 rounds", tools };
}

// Its one more go: its answer, then the call it ended on refused, with the rule it broke.
function retryMessages(
  response: Anthropic.Message,
  endCall: Anthropic.ToolUseBlock,
  why: string,
): Anthropic.MessageParam[] {
  return [
    { role: "assistant", content: response.content },
    {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: endCall.id, is_error: true, content: retryNote(why) }],
    },
  ];
}

// What FoodStories had shown before this turn: the store, its side of the chat, and the open options with their cards.
function alreadyShown(ask: Ask) {
  return [
    storeLine(ask.store),
    ...ask.history.filter((t) => t.who === "us").map((t) => t.text),
    ...ask.options.map((o) => [o.title, o.description, o.card].join(" ")),
  ].join("\n");
}

// One call to the model, recorded in the trace: its tools, text, tokens and time.
async function callModel(
  ai: Anthropic,
  messages: Anthropic.MessageParam[],
  trace: Trace,
  model = DEFAULT_MODEL,
  isClaude = DEFAULT_IS_CLAUDE,
) {
  const started = Date.now();
  let response: Anthropic.Message;
  try {
    response = await ai.messages.create({
      model,
      max_tokens: 2048,
      system: [{ type: "text", text: SYSTEM, ...(isClaude && { cache_control: { type: "ephemeral" as const } }) }],
      tools: TOOLS,
      messages,
      ...(isClaude && { output_config: { effort: "low" as const } }),
    });
  } catch (err) {
    const elapsed = Date.now() - started;
    if (isClaude) {
      logAnthropicCall({
        model,
        durationMs: elapsed,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        status: "error",
        error: String(err),
      });
    }
    throw err;
  }
  const elapsed = Date.now() - started;
  const toolCalls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  const usage = response.usage ?? {};
  const tokens: Tokens = {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
  const speed = elapsed > 0 ? Number((tokens.output / (elapsed / 1000)).toFixed(1)) : 0;
  const price = PRICES.find(([pattern]) => pattern.test(response.model || model))?.[1];
  const cost = price ? costOf(tokens, price) : undefined;

  trace.calls.push({
    ms: elapsed,
    stop: String(response.stop_reason),
    tools: toolCalls.map((c) => ({ name: c.name, input: c.input })),
    text: text || undefined,
    tokens,
    model: response.model || model,
    key: (response as unknown as { key?: number }).key,
    cost,
    speed,
  });

  if (isClaude) {
    logAnthropicCall({
      model: response.model || model,
      durationMs: elapsed,
      tokens,
      stopReason: String(response.stop_reason),
      tools: toolCalls.map((c) => c.name),
      status: "success",
    });
  }

  return { response, toolCalls, text };
}

// One lookup the model asked for: its result goes back to it, into what's been shown, and into the trace. A tool that
// fails tells the model so, and it says what it can or hands off; it doesn't sink the turn.
async function runLookup(
  call: Anthropic.ToolUseBlock,
  ask: Ask,
  shown: Shown,
  trace: Trace,
): Promise<Anthropic.ToolResultBlockParam> {
  const result = await storeLookup(call, ask).catch(asError);
  const sent = Array.isArray(result) ? result.map((product) => withRef(product, shown)) : result;
  const content = JSON.stringify(sent);
  shown.text += "\n" + content;
  recordResult(trace, call.name, summarise(call.name, sent));
  return { type: "tool_result", tool_use_id: call.id, content, is_error: "error" in result };
}

// A search result as the model sees it: a ref (p1, p2…) in place of its page, since the model writes back what it
// picks, and a page is ten times the tokens (four of them were half a reply's output, and output is the slow part).
// Photos are for cards, not tokens. The page stays in what was shown, for the checks on what it picks.
function withRef(product: Product, shown: Shown) {
  const ref = `p${shown.refs.size + 1}`;
  shown.refs.set(ref, product.url);
  shown.products.set(productKey(product.url)!, product);
  shown.text += "\n" + product.url;
  return { ref, name: product.name, price_inr: product.price_inr, in_stock: product.in_stock };
}

// A product it picked, as its page: a ref stands for the page a search gave; anything else (a page from the chat) is
// taken as written.
function pageOf(picked: unknown, shown: Shown) {
  const named = String(picked ?? "").trim();
  return shown.refs.get(named) ?? named;
}

// The basket by the phone the message came from, and search at their store or another they ask about.
function storeLookup(call: Anthropic.ToolUseBlock, ask: Ask): Promise<Product[] | Basket> {
  const { query, store } = call.input as { query?: unknown; store?: unknown };
  switch (call.name) {
    case "search_products":
      return products(String(query ?? "").slice(0, 80), typeof store === "string" ? storeFor(store).code : ask.store);
    case "get_basket":
      return basket(ask.phone, ask.store);
    default:
      return Promise.reject(new Error(`unknown tool ${call.name}`));
  }
}

// change_store: the basket moves here, keyed by the phone, and the bot, not the model, says what moved.
async function changeStore(ask: Ask, { store: code, also }: Move, trace: Trace, tools: string[]): Promise<Answer> {
  tools.push("change_store");
  const to = storeFor(code);
  const result = await moveBasket(ask.phone, ask.store, to.code).catch(asError);
  if ("error" in result) {
    recordResult(trace, "change_store", `error: ${result.error}`);
    return { kind: "fail", why: `the basket didn't move: ${result.error}`, tools };
  }
  const missing = result.missing.length ? `; not sold there: ${result.missing.join(", ")}` : "";
  recordResult(trace, "change_store", `moved to ${to.name}: ${summarise("get_basket", result)}${missing}`);
  return { kind: "say", msg: withAlso(moved(to.name, result), also), store: to.code, tools };
}

// add_to_basket: the basket changes here, keyed by the phone and their store, and the bot says what went in and what
// didn't.
async function addItems(ask: Ask, { items, also }: Add, trace: Trace, tools: string[]): Promise<Answer> {
  tools.push("add_to_basket");
  const at = storeFor(ask.store);
  const result = await addToBasket(ask.phone, at.code, items, ask.stress).catch(asError);
  if ("error" in result) {
    recordResult(trace, "add_to_basket", `error: ${result.error}`);
    return { kind: "fail", why: `the add didn't go through: ${result.error}`, tools };
  }
  // For what had sold out by then, the closest in-stock items.
  let alternatives: Product[] = [];
  if (result.out.length) {
    const added = result.added.map((l) => l.name);
    alternatives = await inStockInstead(result.out, at.code, added);
  }
  recordResult(trace, "add_to_basket", addSummary(result, alternatives, ask.stress));
  const [msg, ...more] = addedTo(at.name, result, alternatives);
  return { kind: "say", msg: withAlso(msg, also), more, added: result, tools };
}

// The trace's line for an add: what went in, what had sold out (and what's in stock instead), what the store doesn't
// sell.
function addSummary(result: Added, alternatives: Product[], stress?: boolean) {
  const parts = [
    `added ${result.added.length}${result.added.map((l) => `; ${l.qty} × ${l.name} ₹${l.unit_price_inr}`).join("")}`,
  ];
  if (result.out.length) {
    const inStock = alternatives.length ? `; in stock instead: ${alternatives.map((p) => p.name).join(", ")}` : "";
    parts.push(`sold out${stress ? " (stress test)" : ""}: ${result.out.join(", ")}${inStock}`);
  }
  if (result.missing.length) parts.push(`not sold here: ${result.missing.join(", ")}`);
  return parts.join(" · ");
}

// The call that ends the turn, as what the bot sends or does. The model's tools only read, except add_to_basket,
// change_store and set_reminder, which the bot carries out and confirms itself; anything else it can't do goes to
// customer care. Everything it writes for the customer passes `vet` (lib/guardrails.ts) or isn't sent.
function finish(tool: string, input: ToolInput, ask: Ask, shown: Shown): Outcome | Move | Add {
  if (leaksPrompt(input)) return { kind: "fail", why: QUOTED_PROMPT };
  switch (tool) {
    case "opt_out":
      return { kind: "optout", wrong: input.wrong_number === true };
    case "change_store":
      return onChangeStore(input, shown.text);
    case "add_to_basket":
      return onAddToBasket(input, shown);
    case "set_reminder":
      return onSetReminder(input);
    case "choose_option":
      return onChooseOption(input, ask, shown.text);
    case "handoff":
      return onHandoff(input, ask, shown.text);
    default:
      return onReply(input, shown);
  }
}

// LEAK_MARK is planted in the system prompt: a call carrying it, however spelled, is leaking the prompt.
function leaksPrompt(input: ToolInput) {
  return JSON.stringify(input)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .includes(LEAK_MARK);
}

// change_store: only to one of the stores. The basket moves in `changeStore`.
function onChangeStore(input: ToolInput, seen: string): Outcome | Move {
  const to = STORES.find((s) => s.code === input.store);
  if (!to) return { kind: "fail", why: `${String(input.store)} isn't one of the stores` };
  return { kind: "move", store: to.code, also: alsoLine(input, seen) };
}

// add_to_basket: only products FoodStories showed can go in (a search's ref, or a page in its own messages; never the
// customer's link), 1 to 10 products, 1 to 10 of each. `addItems` adds them.
function onAddToBasket(input: ToolInput, shown: Shown): Outcome | Add {
  const items = (Array.isArray(input.items) ? input.items : []) as { product?: unknown; qty?: unknown }[];
  const lines = items.map((item) => ({ key: productKey(pageOf(item?.product, shown)) ?? "", qty: Number(item?.qty) }));
  const invalid = (line: Add["items"][number]) =>
    !line.key ||
    !shown.text.includes(`/shop/product/${line.key}/`) ||
    !Number.isInteger(line.qty) ||
    line.qty < 1 ||
    line.qty > 10;
  if (!lines.length || lines.length > 10 || lines.some(invalid))
    return {
      kind: "fail",
      why: "add_to_basket takes 1 to 10 products, each by a search's ref or a page the chat gave, 1 to 10 of each",
    };
  return { kind: "add", items: lines, also: alsoLine(input, shown.text) };
}

// set_reminder: the bot's to set, like the tap that set it: it confirms in that tap's words, and CleverTap is told.
function onSetReminder(input: ToolInput): Outcome {
  const day = DAYS.find((d) => d === input.day);
  const cadence = ["weekly", "fortnightly", "off"].find((c) => c === input.cadence);
  // What it gives must be valid, and it must give at least one of the two.
  if ((input.day != null && !day) || (input.cadence != null && !cadence) || (!day && !cadence))
    return {
      kind: "fail",
      why: "set_reminder takes a day (Monday to Sunday) and a cadence (weekly, fortnightly or off)",
    };
  const reminder = { reminder_day: day, reminder_cadence: cadence };
  return { kind: "say", msg: reminded(reminder), reminder };
}

// choose_option: one of the open options, by its number from 1.
function onChooseOption(input: ToolInput, ask: Ask, seen: string): Outcome {
  const index = Number(input.option) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= ask.options.length)
    return { kind: "fail", why: `option ${input.option} isn't open` };
  const also = alsoLine(input, seen);
  return {
    kind: "tap",
    option: index,
    also: also ? { text: also } : undefined,
    complaint: field(input, "complaint").slice(0, MAX_CARE_NOTE) || undefined,
  };
}

// handoff: to customer care, but a crisis or a legal threat the bot answers itself.
function onHandoff(input: ToolInput, ask: Ask, seen: string): Outcome {
  if (input.reason === "crisis") return { kind: "crisis", summary: careSummary(input, ask) };
  if (input.reason === "legal") return { kind: "escalate", summary: careSummary(input, ask) };
  // The apology is the model's; the promise is the bot's, with real hours. A message that breaks a rule is dropped, not
  // the handoff.
  const message = field(input, "message");
  const kept = message && !vet(message, seen);
  return { kind: "handoff", summary: careSummary(input, ask), msg: kept ? handoffWith(message) : REPLIES.handoff };
}

// For customer care's eyes, but written by a model the customer can steer: no links, no ids, nothing claimed as
// approved.
function careSummary(input: ToolInput, ask: Ask) {
  return (field(input, "summary").replace(/https?:\/\/\S+|\S+@\S+/gi, "[link]") || ask.text).slice(0, MAX_CARE_NOTE);
}

// reply: its message, the products it names as cards, and the next steps it suggests as buttons.
function onReply(input: ToolInput, shown: Shown): Outcome {
  const text = field(input, "text");
  const linked = pageOf(field(input, "link"), shown);
  const cards = cardsFor(input, linked, shown);
  const link = keptLink(linked, cards, shown.text);
  const broken = vet(text, shown.text) ?? (linked && !SITE_LINK.test(linked) ? "a link off the site" : undefined);
  if (broken) return { kind: "fail", why: `reply broke a rule: ${broken}` };
  return replyMessages(text, cards, link, suggestedReplies(input, shown.text));
}

// The reply as WhatsApp messages, shaped by how many products it shows.
function replyMessages(text: string, cards: Product[], link: string, buttons: Option[]): Outcome {
  // One product and no other link: one message, its photo above the reply, its page under it, Add to basket first.
  if (cards.length === 1 && !link) {
    const one = productCard(cards[0]);
    const taps = [...(one.buttons ?? []), ...buttons].slice(0, MAX_BUTTONS);
    return { kind: "say", msg: { ...one, text: `${text}\n\n${cards[0].url}`, buttons: taps } };
  }
  // Two to four, each with its photo: one carousel, the reply above the cards, one bubble rather than one a product.
  // WhatsApp's carousel has a photo on every card and no buttons but theirs, so a link goes in the text and suggested
  // replies are left off. ponytail: a product without a photo sends them all the old way below; a placeholder image
  // hosted for it would keep the carousel.
  if (cards.length > 1 && cards.every((p) => p.image)) {
    const withLink = link ? `${text}\n\n${linkLabel(link)}: ${link}` : text;
    return { kind: "say", msg: { text: withLink, cards: cards.map(carouselCard) } };
  }
  // A message carries a link button or reply buttons, not both: the link (basket, orders, a search) wins.
  const more = cards.length ? cards.map(productCard) : undefined;
  if (link) return { kind: "say", msg: { text, link: { label: linkLabel(link), url: link } }, more };
  if (buttons.length) return { kind: "say", msg: { text, buttons: buttons.slice(0, MAX_BUTTONS) }, more };
  return { kind: "say", msg: { text }, more };
}

// The products it names, each a card with an Add to basket button: only what a search returned this turn, in stock,
// four at most. A product page given as the link counts as one.
function cardsFor(input: ToolInput, link: string, shown: Shown) {
  const picked = Array.isArray(input.products) ? input.products : [];
  const pages = [...picked.map((product) => pageOf(product, shown)), link];
  const keys = new Set(pages.map((page) => productKey(page)));
  return [...keys]
    .flatMap((key) => {
      const product = key ? shown.products.get(key) : undefined;
      return product?.in_stock ? [product] : [];
    })
    .slice(0, MAX_CARDS);
}

// The link, if it was shown it or it's one of the site's fixed pages, and it isn't a card's page; anything else (a
// slug it made up) is dropped, not sent.
function keptLink(link: string, cards: Product[], seen: string) {
  if (!link || cards.some((p) => productKey(p.url) === productKey(link))) return "";
  return seen.includes(link) || FIXED_PAGES.some((page) => link.startsWith(page)) ? link : "";
}

// Next steps to tap instead of typing (WhatsApp: three, 20 characters, unique), held to the same rules; a tap comes
// back as if they'd typed it.
function suggestedReplies(input: ToolInput, seen: string): Option[] {
  const titles = (Array.isArray(input.buttons) ? input.buttons : []).map((b) => tidy(String(b)).replace(/\*/g, ""));
  const unique = new Map(titles.map((title) => [title.toLowerCase(), title])); // a repeat keeps the first's place
  return [...unique.values()]
    .filter(
      (title) =>
        title && title.length <= 20 && title.toLowerCase() !== ADD_TO_BASKET.toLowerCase() && !vet(title, seen),
    )
    .map((title) => ({ title, next: "ask" }));
}

// A string the model wrote, tidied for WhatsApp (`tidy`); "" if it gave none.
function field(input: ToolInput, key: string) {
  const value = input[key];
  return typeof value === "string" ? tidy(value) : "";
}

// Its line answering the rest of their message: dropped, not the call, if it breaks a rule.
function alsoLine(input: ToolInput, seen: string) {
  const also = field(input, "also");
  return also && !vet(also, seen) ? also : undefined;
}

// The bot's message, with the model's `also` line under it.
function withAlso(msg: Msg, also?: string): Msg {
  return also ? { ...msg, text: `${msg.text}\n\n${also}` } : msg;
}

// A product page's key, with or without www or the trailing slash.
function productKey(url: string) {
  return /\/shop\/product\/([\w-]+)/.exec(url)?.[1];
}

// A link button's label, by the page it opens.
function linkLabel(url: string) {
  if (/\/checkout\/cart/.test(url)) return "Open my basket";
  if (/\/orders/.test(url)) return "See my orders";
  if (/\/search-results/.test(url)) return "See them all";
  return "Take a look";
}

// One line for the trace: what a lookup returned, or its error. A search's products go by their refs, as the model
// saw them.
function summarise(tool: string, result: unknown) {
  if (result && typeof result === "object" && "error" in result) return `error: ${(result as { error: string }).error}`;
  const isBasket = tool === "get_basket";
  const rows = isBasket
    ? (result as Basket).lines.map((l) => `${l.qty} × ${l.name} ₹${l.unit_price_inr}${l.in_stock ? "" : " (out)"}`)
    : (result as ReturnType<typeof withRef>[]).map(
        (p) => `${p.ref} ${p.name} ₹${p.price_inr}${p.in_stock ? "" : " (out)"}`,
      );
  return `${rows.length} ${isBasket ? "lines" : "products"}${rows.length ? ": " + rows.join("; ") : ""}`;
}

// A tool's result in the trace, against the call that asked for it: the latest.
function recordResult(trace: Trace, tool: string, summary: string) {
  trace.results.push({ call: trace.calls.length - 1, tool, summary });
}

// A lookup or basket change that failed, as the model and the trace see it.
function asError(err: unknown) {
  return { error: String(err).slice(0, 200) };
}
