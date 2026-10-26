// One inbound WhatsApp message, start to finish: what the customer gets back and what CleverTap hears. The webhook
// (app/api/whatsapp/route.ts) calls `handle` once per message, one phone at a time, with Gupshup and CleverTap as `io`;
// the tests pass their own. Typed text the rules in lib/read.ts can't settle goes to the AI (lib/ai.ts). See BOT.md.
import { flows } from "../content/flows/index.ts";
import { addedTo, DISCLOSE, disclose, notAdded, REPLIES } from "../content/replies.ts";
import { aiOn, answer, type Answer, type Trace, type ChatLine } from "./ai.ts";
import {
  boldText,
  cardFor,
  choicesOf,
  fillPlaceholders,
  optionsOf,
  parsePayload,
  storeOf,
  type Flow,
  type Msg,
} from "./bot.ts";
import { clean } from "./guardrails.ts";
import { fallbackReply, intent, read } from "./read.ts";
import { addToBasket, customer, inStockInstead, storeFor, type Added } from "./store.ts";

// One inbound message as Gupshup posts it. `payload` holds its text (a button's title, a photo's caption), a tap's
// postbackText or id, and a media url.
export type Inbound = { id: string; type: string; sender: { phone: string }; payload?: Record<string, string> };
export type IO = {
  send: (phone: string, msgs: Msg[], flow?: Flow, choice?: string, item?: string) => Promise<void>;
  event: (phone: string, name: string, data: Record<string, unknown>) => Promise<void>;
  subscribe: (phone: string, status: "Unsubscribe" | "Resubscribe") => Promise<void>;
};

// The flow node last sent to a phone: what a typed reply answers. `aside`: the bot has said something else since.
type OpenNode = { flow: Flow; node: string; aside?: boolean };

// The message being handled, as each step below reads it. `open` is the phone's open node as the message came in.
type Turn = {
  io: IO;
  phone: string;
  type: string; // "text", a tap ("quick_reply", "button_reply", "list_reply") or a kind of media
  content: Record<string, string>; // the message's `payload`
  text: string; // its text, title or caption, cleaned (`clean` in lib/guardrails.ts)
  open?: OpenNode;
};

// A node to play, and how it was chosen: a tap, or what they typed, read by the rules or by the AI.
type Chosen = {
  flow: Flow;
  node: string;
  by: "tap" | "rules" | "ai";
  choice: string; // fills {choice}: what they tapped or typed, or the title of the option it was read as
  option?: number; // the option's index, when one was picked
  also?: Msg; // the AI's line answering the rest of their message, sent after the node
  complaint?: string; // a complaint they made along with their choice, for customer care
};

// ponytail: all in memory, per instance. Move to KV (and read opt-out from the CleverTap profile) before scaling out.
const openNodes = new Map<string, OpenNode>();
const optedOut = new Set<string>(); // STOP and wrong-number phones, until START
// The last dozen messages each way, for the AI; gone after a day.
const chats = new Map<string, (ChatLine & { at: number })[]>();
const aiCalls = new Map<string, number[]>(); // when each phone asked the AI, to cap it at AI_PER_HOUR
const tickets = new Map<string, number[]>(); // when each phone raised a care ticket, to cap it at TICKETS_PER_HOUR
// The store a phone moved to in chat (change_store), over its profile's and the flow's.
const stores = new Map<string, string>();
// Tap-time checks, keyed by flow key and node. ponytail: empty until the stock, slot and cut-off services are
// wired in, so every check passes; add one entry per `needs` node as each service lands (`needs.what` says which).
const checks: Record<string, (phone: string) => Promise<boolean>> = {};

const AI_PER_HOUR = 15; // a customer never needs more; a loop or an abuser gets customer care instead
const TICKETS_PER_HOUR = 5; // an upset customer's follow-ups get through; a flood doesn't
const MAX_PHONES = 10_000; // past this many phones a map starts over, so a long-lived instance doesn't creep
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
// A product card's "Add to basket" (`productCard` in content/replies.ts) sends back add:<page key>.
const CARD_ADD = /^add:([\w-]+)$/;
// What isn't media: typed text and the three kinds of tap.
const TEXT_TYPES = ["text", "quick_reply", "button_reply", "list_reply"];

export async function handle(inbound: Inbound, io: IO) {
  const phone = inbound.sender.phone;
  const content = inbound.payload ?? {};
  const text = clean(content.text ?? content.title ?? content.caption ?? "");
  const turn: Turn = { io, phone, type: inbound.type, content, text, open: openNodes.get(phone) };
  const kind = intent(text);
  note(phone, "customer", asReceived(turn));
  // A crisis comes before everything, opt-out included: one caring line with the helpline, and a person is told.
  if (kind === "crisis") {
    await say(turn, [REPLIES.crisis]);
    return ticket(turn, "WA Handoff", { crisis: true });
  }
  // Consent next.
  if (kind === "stop" || kind === "wrong") return optOut(turn, kind === "wrong");
  if (kind === "start") return optIn(turn);
  // Rollback (BOT.md): every message gets the handoff line until BOT_MODE is cleared.
  if (process.env.BOT_MODE === "handoff") {
    await say(turn, [REPLIES.handoff]);
    return ticket(turn, "WA Handoff", {});
  }
  // A tap carries its payload: a card's add:<page key>, or a flow's flow:node:option (`payload` in lib/bot.ts).
  const postback = content.postbackText ?? content.id ?? "";
  const cardKey = CARD_ADD.exec(postback)?.[1];
  if (cardKey) return addFromCard(turn, cardKey);
  const tap = parsePayload(postback) ?? tapByTitle(turn);
  // An opted-out phone gets nothing from a flow until START; what they type still reaches customer care and the AI.
  if (tap && optedOut.has(phone)) return say(turn, [REPLIES.paused]);
  const chosen: Chosen | undefined = tap ? { ...tap, by: "tap", choice: text } : await readTyped(turn);
  if (!chosen) return; // answered already
  if (!chosen.node) return; // unreachable: a tap or `read` always names a node by here
  await play(turn, chosen);
}

// STOP or "wrong number": the phone goes on the opted-out list and is unsubscribed in CleverTap until START, and its
// chat is forgotten.
async function optOut(turn: Turn, wrongNumber: boolean) {
  const { io, phone } = turn;
  optedOut.add(phone);
  openNodes.delete(phone);
  chats.delete(phone);
  await say(turn, [wrongNumber ? REPLIES.wrong : REPLIES.stopped]);
  await io.subscribe(phone, "Unsubscribe");
  await io.event(phone, wrongNumber ? "WA Wrong Number" : "WA Opt Out", { text: turn.text.slice(0, 160) });
}

async function optIn(turn: Turn) {
  const { io, phone } = turn;
  optedOut.delete(phone);
  await say(turn, [REPLIES.welcome]);
  await io.subscribe(phone, "Resubscribe");
  await io.event(phone, "WA Opt In", {});
}

// A product card's "Add to basket": added there and then, no AI call, one tap from the basket.
async function addFromCard(turn: Turn, key: string) {
  const { io, phone } = turn;
  // The store they moved to in chat, else their profile's (looked up only then), else the open flow's.
  const store = stores.get(phone) ?? (await profileOf(phone))?.store ?? storeOf(turn.open?.flow);
  const at = storeFor(store);
  const result = await addToBasket(phone, at.code, [{ key, qty: 1 }]).catch(() => undefined);
  if (!result) return say(turn, [notAdded(key)]);
  const alternatives = result.out.length
    ? await inStockInstead(
        result.out,
        at.code,
        result.added.map((l) => l.name),
      )
    : [];
  await say(turn, addedTo(at.name, result, alternatives));
  return io.event(phone, "WA Basket Add", { ...basketAdd(store, result), tapped: true });
}

// A tap whose payload didn't come through has only its title, which counts only on the open node's last message or,
// with no flow open, as one flow's unique template button. A title that happens to match another flow's button ("Call
// me") is read like typed text, and so are the AI's suggested replies ("ask"), whatever flow button shares the title.
function tapByTitle({ type, content, text, open }: Turn) {
  if (!text || type === "text" || content.postbackText === "ask") return null;
  if (open) {
    const buttons = open.flow.nodes[open.node].at(-1)?.buttons ?? [];
    const option = buttons.findIndex((b) => b.title === text);
    return option >= 0 ? { flow: open.flow, node: buttons[option].next, option } : null;
  }
  const starts = flows.filter((flow) => flow.start.buttons?.some((b) => b.title === text));
  if (starts.length !== 1) return null;
  const flow = starts[0];
  const option = flow.start.buttons!.findIndex((b) => b.title === text);
  return { flow, node: flow.start.buttons![option].next, option };
}

// Typed text or media, read in order (`read` in lib/read.ts): a line of its own, a care ticket, or the node it
// answers. What the rules can't settle goes to the AI.
async function readTyped(turn: Turn): Promise<Chosen | undefined> {
  const { open, text } = turn;
  const asked = open?.flow.nodes[open.node].at(-1);
  // Aside from the flow: the bot said something else since its question, or, with no flow open, the AI spoke last.
  const aside = open?.aside || !!chatOf(turn.phone).findLast((line) => line.who === "us")?.ai;
  const reading = read(text, !TEXT_TYPES.includes(turn.type), open?.flow, asked, aside);
  switch (reading.do) {
    case "who":
      await say(turn, [REPLIES.who]);
      return;
    case "say":
      await say(turn, [reading.msg]);
      return;
    case "escalate":
      await say(turn, [REPLIES.escalated]);
      await ticket(turn, "WA Escalation", {});
      return;
    case "human":
      await say(turn, [REPLIES.human]);
      await ticket(turn, "WA Handoff", {});
      return;
    case "media":
      await say(turn, [REPLIES.media]);
      await ticket(turn, "WA Handoff", { media: turn.content.url });
      return;
    case "node":
      return { flow: open!.flow, node: reading.node, by: "rules", choice: text };
    case "tap": {
      const { title, next } = reading.option;
      const option = optionsOf(asked).findIndex((o) => o.title === title);
      return { flow: open!.flow, node: next, by: "rules", choice: title, option };
    }
    default:
      return askAI(turn, asked);
  }
}

// The AI, at most AI_PER_HOUR a phone: it picks an open option (played like a tap), answers, opts them out, or hands
// off. When it's off, past its cap or fails, the rules answer instead.
async function askAI(turn: Turn, asked: Msg | undefined): Promise<Chosen | undefined> {
  const { open, phone } = turn;
  const options = choicesOf(open?.flow, asked);
  // Say it's automated while the chat doesn't.
  const disclosed = chatOf(phone).some((line) => line.who === "us" && line.text.includes(DISCLOSE));
  const allowed = aiOn() && allowAI(phone);
  const profile = allowed ? await profileOf(phone) : undefined;
  const store = stores.get(phone) ?? profile?.store ?? storeOf(open?.flow);
  const out = allowed
    ? await answer({
        text: turn.text,
        phone,
        store,
        name: profile?.name,
        history: chatOf(phone).slice(0, -1), // what they just said goes as `text`
        options,
      })
    : undefined;
  if (out) await recordAnswer(turn, out);
  switch (out?.kind) {
    case "tap": {
      const picked = options[out.option];
      const also = out.also && (disclosed ? out.also : disclose(out.also));
      return {
        flow: open!.flow,
        node: picked.next,
        by: "ai",
        choice: picked.title,
        option: out.option,
        also,
        complaint: out.complaint,
      };
    }
    case "optout":
      await optOut(turn, out.wrong);
      return;
    case "crisis":
      await say(turn, [REPLIES.crisis]);
      await ticket(turn, "WA Handoff", { summary: out.summary, crisis: true, ai: true });
      return;
    case "escalate":
      await say(turn, [REPLIES.escalated]);
      await ticket(turn, "WA Escalation", { summary: out.summary, ai: true });
      return;
    default:
      await reply(turn, out, asked, disclosed, store);
      return;
  }
}

// An answer in words: the AI's own, or the rules' (`fallbackReply` in lib/read.ts) when the AI is off, past its cap or
// failed. Then what the AI's tools did, and a care ticket whenever the answer hands off.
async function reply(turn: Turn, out: Answer | undefined, asked: Msg | undefined, disclosed: boolean, store: string) {
  const byAI = out?.kind === "say" || out?.kind === "handoff";
  const msg = byAI ? (disclosed ? out.msg : disclose(out.msg)) : fallbackReply(turn.text, asked);
  const cards = out?.kind === "say" ? (out.more ?? []) : []; // a card per product, each with its button
  await say(turn, [msg, ...cards], byAI);
  if (out?.kind === "say") await recordTools(turn, out, store);
  // Customer care gets what they typed (an order number the AI never saw) and the AI's one-line summary.
  if (out?.kind === "handoff" || msg === REPLIES.handoff)
    await ticket(turn, "WA Handoff", {
      summary: out?.kind === "handoff" ? out.summary : undefined,
      ai: out?.kind === "handoff",
    });
}

// Every AI answer is recorded (WA AI Reply), and its cost per turn goes in the server's log.
async function recordAnswer(turn: Turn, out: Answer & { trace: Trace }) {
  const { io, phone, open } = turn;
  await io.event(phone, "WA AI Reply", {
    flow: open?.flow.key,
    node: open?.node,
    outcome: out.kind,
    tools: out.tools.join(","),
    why: out.kind === "fail" ? out.why : undefined,
  });
  const { model, ms, tokens, cost } = out.trace;
  const price = cost === undefined ? "" : "$" + cost.toFixed(5);
  console.log("ai", phone.slice(-4), out.kind, model, ms + "ms", tokens.input + "+" + tokens.output + " tokens", price);
}

// What the AI's tools did, for CleverTap: a store change (remembered here too), a basket add, a reminder.
async function recordTools(turn: Turn, out: Extract<Answer, { kind: "say" }>, store: string) {
  const { io, phone } = turn;
  if (out.store) {
    if (stores.size > MAX_PHONES) stores.clear();
    stores.set(phone, out.store);
    // CleverTap's profile should follow, so campaigns come from the new store.
    await io.event(phone, "WA Store Change", { from: store, to: out.store });
  }
  if (out.added) await io.event(phone, "WA Basket Add", basketAdd(store, out.added));
  // CleverTap sets reminder_day and reminder_cadence from it.
  if (out.reminder) await io.event(phone, "WA Reminder Set", { ...out.reminder, flow: turn.open?.flow.key });
}

// The chosen node: its tap-time check, then its messages, then the record (WA Reply). Then what else they said with
// their choice: the AI's line answering it, and a complaint for customer care.
async function play(turn: Turn, chosen: Chosen) {
  const { io, phone } = turn;
  const { flow, choice } = chosen;
  const node = await checked(phone, flow, chosen.node);
  // {item}: the bold name on the card the node belongs to (for a tap, the node tapped), else their choice.
  const item = boldText(cardFor(flow, chosen.by === "tap" ? chosen.node : node)?.text ?? "") ?? choice;
  openNodes.set(phone, { flow, node });
  try {
    await sendAndNote(turn, flow.nodes[node], flow, choice, item, false);
  } catch (err) {
    await io.event(phone, "WA Send Failed", {
      flow: flow.key,
      node,
      index: (err as { index?: number }).index,
      error: String(err).slice(0, 200),
    });
    throw err;
  }
  await io.event(phone, "WA Reply", {
    flow: flow.key,
    node,
    option: chosen.option,
    choice,
    typed: chosen.by === "rules" ? turn.text.slice(0, 512) : undefined,
    ai: chosen.by === "ai" || undefined,
  });
  if (chosen.also) await say(turn, [chosen.also], true);
  if (chosen.complaint) await ticket(turn, "WA Handoff", { summary: chosen.complaint, ai: true });
}

// The node to play: the chosen one, or its `needs.else` when its tap-time check fails.
async function checked(phone: string, flow: Flow, node: string) {
  const needs = flow.nodes[node][0].needs;
  if (needs && !(await holds(phone, flow, node))) return needs.else;
  return node;
}

// Anything but a node is said aside from the flow: its question stays open, but a bare "ok" no longer taps its first
// button. `ai`: the AI wrote it.
async function say(turn: Turn, msgs: Msg[], ai = false) {
  await sendAndNote(turn, msgs, undefined, "", "", ai);
  const current = openNodes.get(turn.phone);
  if (current) openNodes.set(turn.phone, { ...current, aside: true });
}

// Everything sent goes into the chat the AI reads, as the customer saw it.
async function sendAndNote(turn: Turn, msgs: Msg[], flow: Flow | undefined, choice: string, item: string, ai: boolean) {
  await turn.io.send(turn.phone, msgs, flow, choice, item);
  for (const msg of msgs) note(turn.phone, "us", asSeen(msg, choice, item), ai);
}

// A message as the customer saw it: its text, then its link, cards, footer and options.
function asSeen(msg: Msg, choice: string, item: string) {
  const options = optionsOf(msg);
  return (
    fillPlaceholders(msg.text, choice, item) +
    (msg.link ? ` [${msg.link.label}: ${msg.link.url}]` : "") +
    (msg.cards ? ` [cards: ${msg.cards.map((c) => c.text.replace(/\n/g, " ")).join(" | ")}]` : "") +
    (msg.footer ? ` (${msg.footer})` : "") +
    (options.length ? ` [options: ${options.map((o) => o.title).join(" | ")}]` : "")
  );
}

// The customer's message as the AI reads it: what they typed, the button they tapped, or the kind of media and its
// caption.
function asReceived({ type, content, text }: Turn) {
  if (type === "text") return text;
  if (content.postbackText) return `[tapped] ${text}`;
  return `[${type}]${text ? ` ${text}` : ""}`;
}

// Adds a line to the phone's chat, keeping the last dozen from the past day, 500 characters each.
function note(phone: string, who: ChatLine["who"], text: string, ai = false) {
  if (chats.size > MAX_PHONES) chats.clear();
  const now = Date.now();
  const recent = chatOf(phone)
    .filter((line) => now - line.at < DAY_MS)
    .slice(-11);
  chats.set(phone, [...recent, { who, text: text.slice(0, 500), at: now, ai }]);
}

const chatOf = (phone: string) => chats.get(phone) ?? [];

// A care ticket (a handoff or an escalation), at most TICKETS_PER_HOUR a phone: one abuser, or one outage, can't flood
// customer care. A crisis always gets through.
async function ticket(turn: Turn, name: "WA Handoff" | "WA Escalation", data: Record<string, unknown>) {
  const { io, phone, open } = turn;
  const now = Date.now();
  const recent = lastHour(tickets, phone, now);
  if (recent.length >= TICKETS_PER_HOUR && !data.crisis) return;
  if (tickets.size > MAX_PHONES) tickets.clear();
  tickets.set(phone, [...recent, now]);
  await io.event(phone, name, {
    text: turn.text.slice(0, 512),
    type: turn.type,
    flow: open?.flow.key,
    node: open?.node,
    ...data,
  });
}

// Counts a try at the AI against the phone's past hour, allowed or not: false once it has had AI_PER_HOUR.
function allowAI(phone: string) {
  if (aiCalls.size > MAX_PHONES) aiCalls.clear();
  const now = Date.now();
  const recent = lastHour(aiCalls, phone, now);
  aiCalls.set(phone, [...recent, now]);
  return recent.length < AI_PER_HOUR;
}

const lastHour = (times: Map<string, number[]>, phone: string, now: number) =>
  (times.get(phone) ?? []).filter((t) => now - t < HOUR_MS);

// Their name and store at FoodStories, or nothing when it can't say.
const profileOf = (phone: string) => customer(phone).catch(() => undefined);

// What CleverTap hears of a basket add (WA Basket Add).
const basketAdd = (store: string, result: Added) => ({
  store,
  added: result.added.map((l) => `${l.qty} × ${l.name}`),
  out: result.out,
  missing: result.missing,
});

const holds = (phone: string, flow: Flow, node: string) =>
  checks[`${flow.key}:${node}`]?.(phone) ?? Promise.resolve(true);
