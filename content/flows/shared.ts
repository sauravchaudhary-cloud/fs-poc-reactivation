// Shared pieces of copy, so the same promise reads the same way in every conversation. Each segment's file imports
// what it uses.
import type { Msg, Option, Photo } from "../../lib/bot.ts";

const SITE = "https://foodstories.shop";

// A product's own photo from the catalogue, by its path on foodstories.shop's image CDN.
export const catalogPhoto = (path: string, alt: string): Photo => ({
  url: "https://d3lhyaytnudnz3.cloudfront.net/fs_/media/catalog/product/" + path,
  alt,
});

// Every path ends here: a deep link into the site. The bot appends a signed token (customer, store, items to add).
// A link can be opened days later, so the basket page itself shows live stock for their store, greys out anything that
// has sold out since, and suggests the closest item; and the bot sends a /basket link only when the basket has
// something in stock to show, otherwise the flow's aisle (2.1 shows the pattern).
export const basket = (text: string, label = "Open my basket", path = "/basket"): Msg => ({
  text,
  link: { label, url: SITE + path },
});

// Slot rows are examples: the bot rebuilds them from the slot service at tap time.
export const ROWS =
  "rows come from the slot service at tap time: the next open slots from this store, dated, nothing that has started or filled; no open slots at all (a shut store, Diwali day) → one line with the checkout link instead of a list";
export const nextSlots = (next: string): Option[] => [
  { title: "Today, 6–8 pm", next },
  { title: "Tomorrow, 10 am–12 pm", next },
  { title: "Tomorrow, 4–6 pm", next },
];
export const slotList = (text: string, section: string, rows: Option[]): Msg => ({
  text,
  bot: ROWS,
  list: { button: "Choose a time", section, rows },
});
// Delivery slots: the next ones and Thursday's, plus pickup at the store when the flow offers it.
export const slots = (text: string, next: string, pickup?: Option): Msg =>
  slotList(text, pickup ? "Delivery or pickup" : "Delivery slots", [
    ...nextSlots(next),
    { title: "Thursday, 10 am–12 pm", next },
    ...(pickup ? [pickup] : []),
  ]);

// A slot is never "booked" in the chat: it is open now, and theirs once they pay. Checked at tap time: a slot that has
// filled since plays the flow's `slotgone` node (`slotGone`).
export const slotOpen = (text: string, label = "Confirm and pay"): Msg => ({
  ...basket(text, label, "/checkout"),
  needs: { what: "the chosen slot is still open", else: "slotgone" },
  bot: "passes the slot id in the link so checkout has it selected",
});
export const slotGone = (store: string, next: string): Msg[] => [
  slotList("Our apologies, that slot has just filled. These times are still open:", `From ${store}`, nextSlots(next)),
];

// Filled by the bot from the clock: "within 2 working hours (9 am–8 pm, Mon–Sat)" in hours, "by 11 am on Monday" on a
// Saturday night.
export const CARE_BY = "{care_by}";
export const CONCIERGE_BY = "{concierge_by}";
export const TICKET =
  "raises WA Care Ticket (order id, the reason chosen, any text), which opens the helpdesk ticket; sets care_hold_until = +7 days on the profile, cleared early when the ticket closes; every journey skips anyone on care_hold_until; a reply after the 24-hour window uses the care_reply utility template";

// "Something was off": every answer goes to customer care (`fix`).
const issues: Msg = {
  text: "We're so sorry to hear that. What went wrong?",
  list: {
    button: "Choose one",
    section: "What happened",
    rows: [
      { title: "Wrong or missing item", next: "fix" },
      { title: "Late or missed slot", next: "fix" },
      { title: "Swapped without asking", next: "fix" },
      { title: "Item wasn't fresh", next: "fix" },
      { title: "Refund still pending", next: "fix" },
      { title: "Something else", next: "fix" },
    ],
  },
};

// A problem goes to customer care, and marketing pauses, but the shelf is still there.
export const putRight = (end: Msg): Msg[] => [
  {
    text: `Thank you for telling us, and we're truly sorry. Customer care will call you ${CARE_BY} to put it right, and we'll pause all other messages until it's sorted. 🙏`,
    bot: TICKET,
  },
  end,
];

// One-time buyers who were "okay": the same five answers in both arms of the test, each with a real reply. `end` closes
// a path with their basket or aisle; `calmEnd` is the gentler close after a complaint.
export const okayAnswers = (store: string, end: Msg, calmEnd: Msg): Record<string, Msg[]> => ({
  okay: [
    {
      text: "Thank you for being honest. It genuinely helps. What would have made it wonderful?",
      list: {
        button: "Choose one",
        section: "Tell us",
        rows: [
          { title: "Faster delivery", next: "fast" },
          { title: "More choice", description: "I couldn't find what I wanted", next: "range" },
          { title: "Freshness", next: "fresh" },
          { title: "Price", next: "price" },
          { title: "Something else", next: "other" },
        ],
      },
    },
  ],
  fast: [
    {
      ...end,
      text: `Thank you, that's really helpful. From ${store}, we now deliver in *60 minutes* to most addresses, and you can choose your exact slot at checkout.\n\n${end.text}`,
    },
  ],
  range: [
    {
      text: "What were you hoping to find? Type it below, and our buyers will see whether we can stock it.",
      typed: "sourcing",
    },
  ],
  sourcing: [
    {
      ...end,
      text: `Thank you. Our buyers will look into it and reply here within 2 working days.\n\n${end.text}`,
      bot: "raises WA Care Ticket (sourcing, the typed text, never echoed back); the reply uses the care_reply utility template if the window has closed",
    },
  ],
  fresh: putRight(calmEnd),
  price: [
    {
      ...end,
      text: `Thank you for being candid. It's noted, and we won't push.\n\n${end.text}`,
      bot: "sets marketing_cadence = light: festive and monthly messages only",
    },
  ],
  other: [{ text: "Please tell us in your own words. A real person reads every reply.", typed: "noted" }],
  // calmEnd.text follows this message's 🙏, so it carries no emoji of its own: one per bubble.
  noted: [
    {
      ...calmEnd,
      text: `Thank you for sharing this. Customer care will reply ${CARE_BY}, here or by phone. 🙏\n\n${calmEnd.text}`,
      bot: TICKET,
    },
  ],
  off: [issues],
  fix: putRight(calmEnd),
});

// A standing order is a weekly one-tap reminder, not a subscription: nothing arrives unless they confirm. `day` is their
// usual one; the flow's `standing` node sets the reminder, `once` doesn't.
export const weekly = (text: string, day = "Friday"): Msg => ({
  text,
  buttons: [
    { title: `Every ${day}`, next: "standing" },
    { title: "Every 2 weeks", next: "standing" },
    { title: "Just this once", next: "once" },
  ],
});
export const REMINDER =
  "sets reminder_cadence and reminder_day (their usual day) on the profile; a CleverTap recurring campaign sends the weekly_basket utility template the day before, with Confirm / Skip this week / Pause; it counts toward the caps";
export const standingSet: Msg = {
  ...basket(
    "Wonderful, *{choice}* it is ✅ We'll send your basket here the day before, and nothing arrives unless you confirm.\n\nShall we start with this week's?",
    "Review my basket",
  ),
  bot: REMINDER,
};

// The Festive Edit's hampers as list rows, standing in for the live collection (HAMPER_ROWS); a pick is checked
// against CUTOFF at tap time.
export const festiveEdit = (next: string): Option[] => [
  { title: "The Sweet Reward", description: "₹2,800", next },
  { title: "Cheese platters", description: "₹2,500 to ₹6,150 · same-city delivery only", next },
  { title: "The Glow-Up Box", description: "₹6,000 · Tea Library blends, Manuka honey", next },
  { title: "Harvests of the World", description: "₹9,500 · our grandest hamper", next },
];
export const HAMPER_ROWS =
  "rows come from the live collection for this store at tap time: in stock, in their price band, prices re-read; these stand in";
export const CUTOFF = "the hamper is still in stock and the occasion's order-by date hasn't passed";

export const expressDelivery: Msg = {
  ...basket(
    "It can be at your door in *60 minutes*, or choose a time that suits you at checkout.",
    "Check out",
    "/checkout",
  ),
  bot: "“60 minutes” only inside store hours, before the express cut-off and in an express pincode; otherwise “Pick a slot at checkout, or collect it from the store.”",
};

// Nobody can say when the next batch comes, so a sold-out item is never promised for later: it's cross-sold.
export const CLOSEST =
  "the alternatives are the closest in-stock items in the same category and price band at tap time";

// The concierge's call-back task, and an email typed for a quote.
export const CALLBACK =
  "raises WA Callback Requested (flow, reason), which creates the concierge task; sets care_hold_until = +1 day, cleared when the call is logged; if nothing is logged in 4 working hours, ops is alerted and the customer gets a “running late” message";
export const EMAIL_TYPED =
  "validates the address; on a miss it asks once more with “Try again / Call me instead”; the task carries the email";
