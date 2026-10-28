// Lints every flow in content/flows/ (part of `npm run check`): WhatsApp's limits, the deck's copy rules, reachability
// and the bot contract. Fails if a flow points at a missing node, leaves a node unreachable or a path without a basket,
// uses something WhatsApp can't send, says something the deck bans, or makes a promise the bot can't keep.
// Limits are Meta's (Oct 2026); CleverTap's Gupshup templates also cap quick replies at 5.
import assert from "node:assert/strict";
import { flows, segments } from "../content/flows/index.ts";
import { EVENTS, PROPS, TEMPLATES } from "../lib/bot.ts";
import { BANNED, FORECAST } from "../lib/guardrails.ts";

const SITE = "https://foodstories.shop";
// Nodes only the bot can reach (a document arriving while a flow is open).
const BOT_ONLY = new Set(["received"]);

// ── The deck's copy rules ─────────────────────────────────────────────────────────────────────────────────────────
// BANNED: the deck's lint bans. FORECAST: nobody knows when the next batch comes, so a sold-out item is cross-sold,
// never promised for a future date. Both live in lib/guardrails.ts, where the AI's replies are held to them too.
// Messages come from the store or the Head of Guest Experience, never a relationship manager.
const RM = /relationship manager|\bRMs?\b/i;
// Every path ends at normal prices; giving something away needs sign-off first.
const FREE =
  /\bon us\b|\bfree\b|chef's sample|complimentary|no charge|signature box|host's box|tasting box|handwritten card|make-good/i;
// A tick is earned: "Done ✅" means the bot did something, or checked it first.
const TICK = /✅/;
// A promise for later needs a note on how the bot keeps it (a property, a ticket, a scheduled template).
const PROMISE =
  /we'll (message|write|send|ask|tell|pause|chase|stop)|will (call|reply|check|send|get back)|we won't|won't (message|write|push)|reserved|kept for you|the day it/i;
// A calendar date in a session message goes stale between send and tap unless the bot re-checks it; so does a
// delivery slot, which the bot rebuilds at tap time.
const DATE = /\b\d{1,2} (Oct|Nov|Dec)\b/;
const SLOT = /\d\s?(am|pm)\b/;
// The stock feed knows "in" or "out", never when; a tap next morning makes "this afternoon" wrong.
const WHEN =
  /(sold out|has gone|went|came (in|out)|baked|out of the oven) (fresh )?(this|since this) (morning|afternoon)|(came (in|out)|baked|out of the oven) (fresh )?(today|this morning)/i;

// A part the message doesn't have (no header, say) passes.
const maxChars = (text = "", limit, what) =>
  assert.ok(text.length <= limit, `${what} is over ${limit} chars: "${text}"`);
// A flow's session messages, node by node.
const nodeMessages = (flow) => Object.values(flow.nodes).flat();

// ── Segments and keys ─────────────────────────────────────────────────────────────────────────────────────────────
// Every segment in the deck has a conversation and the flows keep segment order. A key is carried in every button
// payload, so each is unique and uses only what the payload allows.
function checkSegments() {
  for (const segment of segments)
    assert.ok(
      flows.some((flow) => flow.n === segment.n),
      `segment ${segment.n} has no conversation`,
    );
  const order = flows.map((flow) => flow.n);
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
    "keep flows grouped in segment order",
  );
  for (const flow of flows)
    assert.ok(
      segments.some((segment) => segment.n === flow.n),
      `${flow.name}: unknown segment ${flow.n}`,
    );
  assert.equal(new Set(flows.map((flow) => flow.key)).size, flows.length, "every flow needs its own key");
  for (const flow of flows)
    assert.match(flow.key, /^[a-z0-9-]+$/, `${flow.name}: key "${flow.key}" must be lower-case words and hyphens`);
}

// ── Each flow ─────────────────────────────────────────────────────────────────────────────────────────────────────
// What a flow says about itself (presenter notes, the send-time gate, what it's built on), what its template offers,
// and what none of its copy may say.
function checkFlow(flow) {
  // Its words, without the ids it carries (product page keys, addresses): "gluten-free" in a key promises nothing.
  const words = JSON.stringify(flow, (key, value) => (key === "stock" || key === "url" ? undefined : value));
  assert.ok(flow.why.length > 0, `${flow.name}: add presenter notes`);
  assert.ok(flow.gate.length > 0, `${flow.name}: say what CleverTap checks at send`);
  assert.ok(flow.signal && flow.category, `${flow.name}: say which behaviour and category it's built on`);
  assert.ok(!RM.test(words), `${flow.name}: messages come from the store or the Head of Guest Experience, not an RM`);
  assert.ok(flow.start.buttons || flow.start.cards, `${flow.name}: the template needs something to tap`);
  // A utility template needs no opt-out line, and a carousel has no footer to carry one.
  const marketing = !/utility/.test(flow.who);
  if (marketing && !flow.start.cards)
    assert.ok(
      /Reply STOP/.test(flow.start.footer ?? ""),
      `${flow.name}: a marketing template needs "Reply STOP to opt out" in the footer`,
    );
  const freebie = words.match(FREE);
  assert.ok(!freebie, `${flow.name}: promises something free ("${freebie}"), which needs sign-off first`);
}

// ── Each node ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Something leads to every node, no node falls back to itself, and every path ends in a basket or products.
function checkNodes(flow) {
  const typedTargets = new Set([flow.start, ...nodeMessages(flow)].map((message) => message.typed).filter(Boolean));
  const reachable = reachableNodes(flow);
  for (const [id, node] of Object.entries(flow.nodes)) {
    const at = `${flow.name} → "${id}"`;
    assert.ok(reachable.has(id) || BOT_ONLY.has(id), `${at}: nothing leads here`);
    assert.notEqual(node[0].needs?.else, id, `${at}: falls back to itself`);
    // A path ends where a node's last message asks for nothing more; it must end in a basket or products.
    const last = node.at(-1);
    const ends = !last.buttons && !last.list && !last.cards && !last.typed;
    assert.ok(!ends || last.link, `${at}: end in a basket or products, not just a thank-you`);
    for (const message of node.slice(1))
      assert.ok(!message.needs, `${at}: put the tap-time check on the node's first message`);
    // After a typed reply, {choice} would be whatever they typed.
    if (typedTargets.has(id))
      assert.ok(!JSON.stringify(node).includes("{choice}"), `${at}: never echo typed text back`);
  }
}

// The nodes something leads to: the template's buttons and cards, and each node message's typed reply, fallback,
// buttons and list rows.
function reachableNodes(flow) {
  const templateOptions = [...(flow.start.buttons ?? []), ...(flow.start.cards ?? []).flatMap((card) => card.buttons)];
  const reachable = new Set(templateOptions.map((option) => option.next));
  for (const message of nodeMessages(flow))
    for (const next of [
      message.typed,
      message.needs?.else,
      ...(message.buttons ?? []).map((option) => option.next),
      ...(message.list?.rows ?? []).map((option) => option.next),
    ])
      if (next) reachable.add(next);
  return reachable;
}

// ── Each message ──────────────────────────────────────────────────────────────────────────────────────────────────
// One message, the template or a session message (`template` says which): the deck's copy rules, WhatsApp's limits
// for each part, and that every tap, typed reply and fallback leads to a node.
function checkMessage(flow, message, template) {
  const at = `${flow.name} → "${message.text.slice(0, 40)}"`;
  // Everything the customer reads in it.
  const copy = [
    message.header,
    message.text,
    message.footer,
    ...(message.buttons ?? []).map((button) => button.title),
    ...(message.list?.rows ?? []).flatMap((row) => [row.title, row.description]),
    ...(message.cards ?? []).map((card) => card.text),
  ].join("\n");
  const banned = copy.match(BANNED);
  assert.ok(!banned, `${at}: "${banned}" is on the deck's banned list`);
  const forecast = copy.match(FORECAST);
  assert.ok(!forecast, `${at}: "${forecast}" promises stock nobody can forecast; cross-sell what's in instead`);

  maxChars(message.text, 1024, `${at} body`);
  maxChars(message.header, 60, `${at} header`);
  maxChars(message.footer, 60, `${at} footer`);
  assert.ok(
    [message.buttons, message.list, message.link, message.cards].filter(Boolean).length <= 1,
    `${at}: use one of buttons, list, link or cards`,
  );
  assert.ok(
    !(message.photo && (message.header || message.list)),
    `${at}: a photo replaces the text header and can't go on a list`,
  );

  const options = [
    ...(message.buttons ?? []),
    ...(message.list?.rows ?? []),
    ...(message.cards ?? []).flatMap((card) => card.buttons),
  ];
  for (const next of [message.typed, message.needs?.else, ...options.map((option) => option.next)].filter(Boolean))
    assert.ok(flow.nodes[next], `${at}: missing node "${next}"`);

  if (!template) checkSessionMessage(at, message);
  if (message.text.includes("{item}")) assert.ok(flow.start.cards, `${at}: {item} is only filled from a carousel card`);
  if (message.buttons) checkButtons(at, message.buttons, template);
  if (message.list) checkList(at, message.list, template);
  if (message.cards) checkCarousel(at, message, template);
  if (message.link) checkLink(at, message.link, template);
}

// A property, a template, or a word a property's description uses (a value such as gifting_only).
const isKnown = (name) =>
  name in PROPS || TEMPLATES.includes(name) || Object.values(PROPS).some((description) => description.includes(name));

// A session message goes out when the customer taps, which can be long after CleverTap checked the template at send:
// what it claims needs a tap-time check (`needs`) or a bot action (`bot`) behind it, and a bot note may only name
// what lib/bot.ts knows.
function checkSessionMessage(at, message) {
  if (TICK.test(message.text))
    assert.ok(message.needs || message.bot, `${at}: a ✅ needs a tap-time check or a bot action behind it`);
  if (PROMISE.test(message.text)) assert.ok(message.bot, `${at}: say how the bot keeps this promise`);
  if (DATE.test(message.text)) assert.ok(message.needs, `${at}: a date in a session message needs a tap-time check`);
  if (message.list?.rows.some((row) => SLOT.test(row.title)))
    assert.ok(message.bot, `${at}: slot rows must be rebuilt by the bot at tap time`);
  assert.ok(!WHEN.test(message.text), `${at}: says when stock moved, which nobody knows`);
  // snake_case words are property or template names; "WA …" are CleverTap events.
  for (const name of message.bot?.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [])
    assert.ok(isKnown(name), `${at}: "${name}" isn't in PROPS or TEMPLATES (lib/bot.ts)`);
  for (const event of message.bot?.match(/\bWA [A-Z][a-z]+(?: [A-Z][a-z]+)*/g) ?? [])
    assert.ok(EVENTS.includes(event), `${at}: event "${event}" isn't in EVENTS (lib/bot.ts)`);
}

// Reply buttons: 3 on a session message; on a template, Gupshup's cap of 5.
function checkButtons(at, buttons, template) {
  assert.ok(buttons.length <= (template ? 5 : 3), `${at}: too many buttons`);
  assert.equal(new Set(buttons.map((button) => button.title)).size, buttons.length, `${at}: duplicate button`);
  for (const button of buttons) maxChars(button.title, template ? 25 : 20, `${at} button`);
}

// A list message: session only.
function checkList(at, list, template) {
  assert.ok(!template, `${at}: a template can't carry a list`);
  assert.ok(list.rows.length >= 1 && list.rows.length <= 10, `${at}: a list needs 1–10 rows`);
  maxChars(list.button, 20, `${at} list button`);
  maxChars(list.section, 24, `${at} list section`);
  for (const row of list.rows) {
    maxChars(row.title, 24, `${at} row`);
    maxChars(row.description, 72, `${at} row description`);
  }
}

// A carousel: templates only here, body text above cards that all carry the same buttons.
function checkCarousel(at, message, template) {
  assert.ok(template, `${at}: carousels here are templates`);
  assert.ok(message.cards.length >= 2 && message.cards.length <= 10, `${at}: a carousel needs 2–10 cards`);
  assert.ok(
    !message.header && !message.footer && !message.photo,
    `${at}: a carousel has only body text above the cards`,
  );
  for (const card of message.cards) {
    maxChars(card.text, 160, `${at} card`);
    assert.ok(card.buttons.length >= 1 && card.buttons.length <= 2, `${at}: each card needs 1–2 buttons`);
    assert.equal(card.buttons.length, message.cards[0].buttons.length, `${at}: every card needs the same buttons`);
    for (const button of card.buttons) maxChars(button.title, 25, `${at} card button`);
  }
}

// A call-to-action link: a deep link into the site, never just its home page.
function checkLink(at, link, template) {
  maxChars(link.label, template ? 25 : 20, `${at} link label`);
  assert.ok(
    link.url.startsWith(SITE + "/") && link.url.length > SITE.length + 1,
    `${at}: link to the basket, product or aisle, not the home page`,
  );
}

// ── Run ───────────────────────────────────────────────────────────────────────────────────────────────────────────
checkSegments();
for (const flow of flows) {
  checkFlow(flow);
  checkNodes(flow);
  checkMessage(flow, flow.start, true);
  for (const message of nodeMessages(flow)) checkMessage(flow, message, false);
}
console.log(`✓ ${flows.length} flows fit WhatsApp's limits and every promise has a bot note`);
