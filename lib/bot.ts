// What a flow is made of, and how the bot runs one: a payload on every tap, the options a message offers, placeholders
// filled from the clock, and Gupshup JSON for every message. Pure functions shared by the demo (app/page.tsx), the
// webhook (lib/whatsapp.ts) and `npm run check`. The flows themselves, and what each field is for, are in content/flows/.
import { flows } from "../content/flows/index.ts";

export type Option = { title: string; description?: string; next: string };

export type Photo = {
  emoji?: string; // the demo's stand-in for a real photo, on a warm card
  url?: string; // a real image (a product's, on its card)
  alt: string; // what the photo shows, which captions the stand-in
};

export type Msg = {
  photo?: Photo; // image header
  header?: string;
  text: string; // WhatsApp formatting: *bold*
  footer?: string;
  buttons?: Option[]; // reply buttons
  list?: { button: string; section: string; rows: Option[] }; // list message
  link?: { label: string; url: string }; // call-to-action URL button
  cards?: { photo: Photo; text: string; buttons: Option[] }[]; // a carousel: a template's, or the AI's product picks (inside the 24-hour window)
  typed?: string; // node a typed reply goes to; otherwise it is handed to customer care
  // On a node's first message: verified by the bot at tap time, else it plays that node. `stock`: the products (page
  // keys) the check reads live from the catalogue at the flow's store, in the demo; the webhook's checks pass until
  // their services exist (lib/whatsapp.ts).
  needs?: { what: string; else: string; stock?: string[] };
  bot?: string; // what the bot does or records when it sends this
};

export type Segment = { n: number; name: string; priority: string; who: string };

export type Flow = {
  n: number; // the segment this conversation is derived from
  name: string; // what sets it apart within its segment
  key: string; // stable id carried in every button payload: never change it once a template has gone out
  signal: string; // the past behaviour that triggers it
  category: string; // the category that picks the products
  who: string; // when it goes, who it's from, what kind of template
  why: string[]; // presenter notes: what shaped the copy
  gate: string[]; // checked by CleverTap at the moment of send, on top of sendGates
  start: Msg;
  nodes: Record<string, Msg[]>;
};

export const flowByKey = (key: string) => flows.find((flow) => flow.key === key);
// A flow's code, as the demo and the docs number it: its segment, then its place in that segment (2.1).
export const flowCode = (flow: Flow) => `${flow.n}.${flows.filter((f) => f.n === flow.n).indexOf(flow) + 1}`;

// What a tap sends back (Gupshup postbackText, CleverTap's custom button payload): flow key, node, option. Under 128 chars.
const PAYLOAD = /^([a-z0-9-]+):([a-z0-9_]+):(\d+)$/;
export const payload = (flow: Flow, next: string, option = 0) => `${flow.key}:${next}:${option}`;
export function parsePayload(postback: string) {
  const match = PAYLOAD.exec(postback);
  if (!match) return null;
  const [, key, node, option] = match;
  const flow = flowByKey(key);
  if (!flow || !flow.nodes[node]) return null;
  return { flow, node, option: Number(option) };
}

// CleverTap profile properties the bot writes and every journey reads. A `bot:` note may only name these, the
// events below, or a template. Expiry dates mean "ignore once passed", so nobody is suppressed forever.
export const PROPS: Record<string, string> = {
  care_hold_until: "datetime · a care ticket is open: no marketing until it closes or this passes",
  wa_snooze_until:
    "datetime · they said not now: no category or basket messages until it passes; gifting and service messages ignore it",
  standing_declined_until: "datetime · no weekly-reminder pitch until it passes",
  gifting_declined_until: "datetime · no hamper or hosting messages until it passes",
  corporate_gifting_declined_until: "datetime · no corporate gifting messages until it passes",
  marketing_cadence: "full | light (festive and monthly only) | gifting_only",
  reminder_cadence:
    "weekly | fortnightly | off · the weekly_basket template's rhythm; off when they turn it off in chat",
  reminder_day: "weekday · the weekly_basket template goes the day before",
  tea_alerts: "bool · one message when a new tea lands, at most monthly",
  tea_alert_last_sent: "datetime · enforces the monthly gap",
  back_in_stock_alert: "sku@store · one message if it returns, 30-day expiry, stock-feed trigger only",
  cart_nudge_suppressed: "hash of basket lines · no nudge for this exact basket again",
  last_coffee_drop_at: "datetime · one coffee drop a month",
  reserved_until: "datetime · a kept-aside item is allocated to them",
  usual_basket_reask_on: "date · ask about the usual basket again, if the caps allow",
  segment_exit: "service · leaves the service-bruised segment for their usual one",
  address_check: "bool · the store confirms the map pin before the next dispatch",
  corporate_sheet_received: "bool · the address sheet has arrived",
};
export const EVENTS = [
  "WA Reply",
  "WA AI Reply",
  "WA Handoff",
  "WA Opt Out",
  "WA Opt In",
  "WA Wrong Number",
  "WA Escalation",
  "WA Send Failed",
  "WA Callback Requested",
  "WA Care Ticket",
  "WA Slot Feedback",
  "WA Store Change",
  "WA Reminder Set",
  "WA Basket Add",
];
export const TEMPLATES = ["weekly_basket", "care_reply", "back_in_stock"];

// "yes" and "no" stand in for a tap only when the message really asked a yes/no question: its last button declines.
export const declines = (option?: Option) =>
  !!option && /^(no\b|not |maybe|just this|somewhere|use another|that's fine)/i.test(option.title);

// What a message offers to tap: its buttons, its list rows, or its carousel cards' buttons (with the card they sit on).
export const optionsOf = (message?: Msg): (Option & { card?: string })[] =>
  message?.buttons ??
  message?.list?.rows ??
  message?.cards?.flatMap((card) => card.buttons.map((button) => ({ ...button, card: card.text }))) ??
  [];

// The options the AI may pick, plus the flow's own decline when none is open: "rehne do" to a slot list should still play
// the flow's "Not this time" (it releases the hold and snoozes the flow), not just get a polite line.
export const choicesOf = (flow?: Flow, message?: Msg) => {
  const open = optionsOf(message);
  if (!open.length || open.some((option) => declines(option))) return open;
  const decline = flow && declineIn(flow);
  if (!decline) return open;
  return [...open, { title: decline.title, description: "they decline", next: decline.next }];
};

// The first option anywhere in the flow that declines and leads to one of its nodes.
const declineIn = (flow: Flow) =>
  [flow.start, ...Object.values(flow.nodes).flat()]
    .flatMap((message) => optionsOf(message))
    .find((option) => declines(option) && flow.nodes[option.next]);

// "within 2 working hours" is only true inside working hours; otherwise the bot says when. IST has no daylight saving.
export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const IST_OFFSET = 330 * 60000; // UTC+5:30, in ms
const REPLY_HOURS = 2; // the "2 working hours" promised
const SUNDAY = 0;
const SATURDAY = 6;
export const careBy = (now = new Date()) => replyBy(now, 9, 20, "9 am–8 pm, Mon–Sat");
export const conciergeBy = (now = new Date()) => replyBy(now, 10, 18, "10 am–6 pm, Mon–Sat");

// Within 2 working hours if they fit before closing (Mon–Sat), else by two hours after the next opening.
const replyBy = (now: Date, opens: number, closes: number, workingHours: string) => {
  const ist = new Date(now.getTime() + IST_OFFSET);
  const day = ist.getUTCDay();
  const hour = ist.getUTCHours() + ist.getUTCMinutes() / 60;
  if (day !== SUNDAY && hour >= opens && hour <= closes - REPLY_HOURS)
    return `within 2 working hours (${workingHours})`;
  return `by ${clockHour(opens + REPLY_HOURS)} ${nextOpening(day, hour < opens)}`;
};

// The next working morning, in words: Sunday is closed, and Saturday evening waits for Monday.
const nextOpening = (day: number, beforeOpening: boolean) => {
  if (day === SUNDAY) return "tomorrow";
  if (beforeOpening) return "today";
  if (day === SATURDAY) return "on Monday";
  return "tomorrow";
};

// 11 → "11 am", 12 → "12 pm", 13 → "1 pm".
const clockHour = (hour: number) => `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? "pm" : "am"}`;

export const fillPlaceholders = (text: string, choice: string, item = choice, now = new Date()) =>
  text
    .replaceAll("{choice}", choice)
    .replaceAll("{item}", item)
    .replaceAll("{care_by}", careBy(now))
    .replaceAll("{concierge_by}", conciergeBy(now));

// The store a flow writes from: the one its template footer names, else the first its copy names; the site's default
// store otherwise (corporate gifting has none).
const STORE = /Banjara Hills|Lavelle Road|Vasant Kunj|Gurugram|Bandra|Lokhandwala/;
const DEFAULT_STORE = "Vasant Kunj";
export const storeOf = (flow?: Flow) => {
  if (!flow) return DEFAULT_STORE;
  const named = STORE.exec(flow.start.footer ?? "") ?? STORE.exec(JSON.stringify(flow));
  return named?.[0] ?? DEFAULT_STORE;
};

// A carousel as its text and then a message per card, as product cards went before carousels: for a Gupshup app
// without the v3 endpoint carousels need.
export const unfold = (message: Msg): Msg[] => {
  if (!message.cards) return [message];
  return [{ text: message.text }, ...message.cards.map(({ photo, text, buttons }) => ({ photo, text, buttons }))];
};

// The card a node belongs to, and the bold name on it, for {item}.
export const cardFor = (flow: Flow, node: string) =>
  flow.start.cards?.find((card) => card.buttons.some((button) => button.next === node));
export const boldText = (text: string) => /\*([^*\n]+)\*/.exec(text)?.[1];

// Gupshup's /wa/api/v1/msg JSON for one message (a carousel's is Meta's, below). Photos are placeholders here, so
// headers go as text. Links carry UTM tags per flow and node, so the site's analytics show basket opens and checkouts
// per tap.
export function toGupshup(message: Msg, flow?: Flow, choice = "", item = choice, node = "") {
  const text = fillPlaceholders(message.text, choice, item);
  const msgid = crypto.randomUUID();
  if (message.cards) {
    // WhatsApp's interactive carousel, a session message: 2–10 cards, each a photo, 160 characters and the same buttons,
    // under a body with no header, footer or buttons of its own. This is Meta's Cloud API JSON, which Gupshup takes on its
    // v3 endpoint only (`send` in app/api/whatsapp/route.ts); the card-level "type" is as in Meta's quick-reply example.
    const cards = carouselCards(message.cards, flow, choice, item);
    return { type: "interactive", interactive: { type: "carousel", body: { text }, action: { cards } } };
  }
  if (message.buttons) {
    // A photo makes it an image message, its text the caption (Gupshup's quick_reply).
    const content = message.photo?.url
      ? { type: "image", url: message.photo.url, text, caption: message.footer }
      : { type: "text", header: message.header, text, caption: message.footer };
    return { type: "quick_reply", msgid, content, options: replyButtons(message.buttons, flow) };
  }
  if (message.list) {
    if (!flow) throw new Error("a list needs a flow for its payloads");
    return {
      type: "list",
      title: message.header ?? "FoodStories",
      body: text,
      msgid,
      globalButtons: [{ type: "text", title: message.list.button }],
      items: [{ title: message.list.section, options: listRows(message.list.rows, flow) }],
    };
  }
  if (message.link) {
    const url = withUtm(message.link.url, flow, node);
    // A real photo (a product card's) goes as the image header; the flows' placeholders don't go at all.
    return {
      type: "cta_url",
      ...(message.photo?.url && { header: { type: "image", image: { link: message.photo.url } } }),
      body: text,
      display_text: message.link.label,
      url,
      footer: message.footer,
    };
  }
  return { type: "text", text };
}

const carouselCards = (cards: NonNullable<Msg["cards"]>, flow: Flow | undefined, choice: string, item: string) =>
  cards.map((card, i) => ({
    card_index: i,
    type: "cta_url",
    header: { type: "image", image: { link: card.photo.url } },
    body: { text: fillPlaceholders(card.text, choice, item) },
    action: {
      buttons: card.buttons.map((button, j) => ({
        type: "quick_reply",
        quick_reply: { id: postback(button, j, flow), title: button.title },
      })),
    },
  }));

const replyButtons = (buttons: Option[], flow?: Flow) =>
  buttons.map((button, i) => ({ type: "text", title: button.title, postbackText: postback(button, i, flow) }));

const listRows = (rows: Option[], flow: Flow) =>
  rows.map((row, i) => ({
    type: "text",
    title: row.title,
    description: row.description,
    postbackText: payload(flow, row.next, i),
  }));

// A flow's buttons carry flow:node:option; the bot's own carry theirs in `next` (a card's "add:<page>", the AI's
// suggested replies' "ask").
const postback = (option: Option, i: number, flow?: Flow) => (flow ? payload(flow, option.next, i) : option.next);

const withUtm = (url: string, flow: Flow | undefined, node: string) =>
  url +
  (url.includes("?") ? "&" : "?") +
  `utm_source=whatsapp&utm_campaign=${flow?.key ?? "bot"}&utm_content=${node || "reply"}`;
