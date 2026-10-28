// Every conversation the bot can run, gathered in segment order, with the deck's six segments and what CleverTap checks
// before any template goes out. One file per segment; run `npm run check` after editing.
import type { Flow, Segment } from "../../lib/bot.ts";
import { serviceBruised } from "./1-service-bruised.ts";
import { lapsedVips } from "./2-lapsed-vips.ts";
import { pastGiftBuyers } from "./3-past-gift-buyers.ts";
import { stillBrowsing } from "./4-still-browsing.ts";
import { quietRegulars } from "./5-quiet-regulars.ts";
import { oneTimeBuyers } from "./6-one-time-buyers.ts";

// The deck's six segments, in the order shown. Every conversation is a sub-segment of one of them, in that segment's file.
export const segments: Segment[] = [
  {
    n: 1,
    name: "Service-bruised",
    priority: "P0",
    who: "Inactive, and their last order went wrong. Day 31–90 after that order.",
  },
  { n: 2, name: "Lapsed VIPs", priority: "P0", who: "A VIP with no purchase in 30+ days." },
  {
    n: 3,
    name: "Past gift buyers",
    priority: "P1",
    who: "Inactive, and has bought a gift hamper at least once, browsed the gift section in the last 30 days, or ordered corporate gifts. Only in the 21 days before an occasion.",
  },
  {
    n: 4,
    name: "Inactive, still browsing",
    priority: "P1",
    who: "No purchase in 30+ days, but visited the app or site in the last 30 days.",
  },
  {
    n: 5,
    name: "Quiet regulars",
    priority: "P1",
    who: "Two or more orders, with no purchase and no visit in 30+ days.",
  },
  { n: 6, name: "One-time buyers", priority: "P2", who: "Bought once, nothing since, and no recent visit." },
];

// Checked by CleverTap at the moment of send, for every template. Segmentation is days old by then.
export const sendGates = [
  "WhatsApp opt-in is on (MSG-whatsapp) with a recorded source and date; the customer isn't in the control group; nobody on a care hold",
  "No order since the segment was computed, and no open customer-care ticket",
  "Caps: at most 2 marketing WhatsApps in 7 days and 3 touches in 21 days; when flows collide, service beats the weekly reminder, then hosting, new arrivals and after-the-feast, and the loser is skipped, not delayed; nothing on 8 Nov; sent 09:00–20:00 IST",
  "Every product named is in stock at their store that morning (bakery and produce 10 or more, cheese 3, hampers 5) with today's price, from a stock feed under 6 hours old; the store is open today and tomorrow",
  "Sent in batches of at most 150 an hour and none after 5 pm, after a 50-person canary whose replies a person has read",
  "First name on file, else “Hi there”; dates, order numbers and the store are template variables, never typed in",
];

// Each flow is one WhatsApp conversation, derived from one of the deck's six segments.
// What a customer gets is decided by their past behaviour (`signal`) and the category they buy
// most (`category`), never by a person. `start` is the approved template CleverTap sends; every
// tap or typed reply moves to a node of session messages. A tap re-opens WhatsApp's 24-hour
// window, so session replies always go; anything promised for later needs a utility template.
// Every path ends in products or a basket, at normal prices: nothing is given away free.
//
// Three things keep the copy honest once a real bot runs it (see BOT.md):
//   `gate`  what CleverTap checks at the moment of send, on top of `sendGates`, before the template goes
//   `needs` what the bot verifies at tap time before sending a node; if it can't, it plays `else` instead
//   `bot`   what the bot does or records when it sends a message (basket add, ticket, CleverTap property, follow-up template)
// `{choice}` becomes the button or row the customer tapped; `{item}` the product on a carousel card.
// Links deep-link to the site; the bot appends a signed token so the site knows the customer and store.
// Paths, care hours, SLAs and store hours are placeholders to confirm with ops. Each flow's presenter notes (`why`)
// say why it's written that way. Products, hampers, prices and stores are from foodstories.shop (Oct 2026); people
// are placeholders.
//
// In segment order, which the demo and the dashboard number as n.m.
export const flows: Flow[] = [
  ...serviceBruised,
  ...lapsedVips,
  ...pastGiftBuyers,
  ...stillBrowsing,
  ...quietRegulars,
  ...oneTimeBuyers,
];
