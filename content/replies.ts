// What the bot says in its own words, outside any flow: its fixed replies, one-line answers to common questions, and the
// messages it writes from what a tool actually did (an add, a store move, a reminder) rather than letting the model say
// it. Shared by the demo and the webhook. {care_by} is filled from the clock when sent (`fillPlaceholders` in lib/bot.ts).
import { DAYS, type Msg } from "../lib/bot.ts";
import { ALCOHOL } from "../lib/guardrails.ts";

// What a card shows of a catalogue product (lib/store.ts).
type Product = { name: string; price_inr: number; url: string; image?: string };
type BasketLine = { name: string; qty: number; unit_price_inr: number };

const SITE = "https://foodstories.shop";
const CARD_LIMIT = 160; // WhatsApp's limit for a carousel card's text

// What the bot says outside any flow.
export const REPLIES = {
  stopped: {
    text: "Understood. You've been unsubscribed from FoodStories offers on WhatsApp.\n\nShould you ever wish to hear from us again, simply reply START.",
  },
  paused: {
    text: "You're opted out of FoodStories messages, so we'll leave it here. Whenever you'd like to hear from us again, simply reply START.",
  },
  wrong: { text: "Our apologies for the mix-up. We've taken this number off our list and won't message it again." },
  who: {
    text: "This is FoodStories, the gourmet store you've shopped with. If this number isn't yours, just reply WRONG NUMBER and we'll take it off our list.",
  },
  welcome: {
    text: "Welcome back, it's lovely to have you with us again. ✨\n\nWe'll write only when there's something truly worth your while. Your basket is ready whenever you are.",
    link: { label: "Open my basket", url: SITE + "/checkout/cart/" },
  },
  nudge: {
    text: "Would you mind tapping one of the options above? Or just tell us what you need, and a person will reply.",
  },
  nod: {
    text: "Noted, thank you. Your basket is ready whenever you'd like it.",
    link: { label: "Open my basket", url: SITE + "/checkout/cart/" },
  },
  thanks: { text: "It's our pleasure. 🙂" },
  escalated: {
    text: "We're sorry it has come to this. We've passed it straight to our customer-care lead, who will call you personally {care_by}.",
  },
  human: {
    text: "You're chatting with FoodStories' automated assistant. Someone from customer care will reply {care_by}, here or by phone.",
  },
  crisis: {
    text: "I'm so sorry you're feeling this way. You don't have to go through it alone: Tele-MANAS, India's free mental health helpline, is open 24×7 on 14416. We've let a person in customer care know.\n\nआप अकेले नहीं हैं। Tele-MANAS, भारत की मुफ़्त मानसिक स्वास्थ्य हेल्पलाइन, 24×7 14416 पर उपलब्ध है।",
  },
  handoff: { text: "Thank you for letting us know. Customer care will reply {care_by}, here or by phone. 🙏" },
  media: { text: "Thank you, we've passed this to customer care, who will reply {care_by}, here or by phone. 🙏" },
} satisfies Record<string, Msg>;

// The AI's own apology before a handoff; the promise is the bot's, with real hours.
export const handoffWith = (apology: string): Msg => ({
  text: `${apology} Customer care will reply {care_by}, here or by phone. 🙏`,
});

// Anthropic's usage policy: say it's automated at the start of each chat, and its terms: say what not to rely on. The
// first AI answer in a chat carries this.
export const DISCLOSE = "Automated assistant · prices and stock confirmed at checkout"; // ≤ 60, a footer
// As the footer where the message can carry one (a link or buttons), else in italics under the text.
export const disclose = (message: Msg): Msg =>
  message.link || message.buttons
    ? { ...message, footer: DISCLOSE }
    : { ...message, text: `${message.text}\n\n_${DISCLOSE}_` };

// Questions the bot can answer in one line, instead of opening a ticket: the AI's fallback (see `fallbackReply` in lib/read.ts).
const FAQ: { asks: RegExp; answer: Msg }[] = [
  {
    asks: /where('s| is) my (order|delivery)|order status|\b(order|delivery|parcel|saman|samaan)\b[^.?!]{0,20}(kab (aayega|aaega|pahunchega)|kahan hai)/i,
    answer: {
      text: "You can follow any order on its way, live, in the FoodStories app or on the website.",
      link: { label: "See my orders", url: SITE + "/account/orders/" },
    },
  },
  {
    asks: /\bjain\b|vegan|eggless|egg.free|halal|allerg|gluten|diabet|sugar.free|ingredient/i,
    answer: {
      text: "Every product's page lists its ingredients and dietary notes. For anything not covered there, customer care will reply {care_by}.",
      link: { label: "Browse the shop", url: SITE + "/shop/" },
    },
  },
  {
    asks: /\b(discount|coupon|promo ?code|cashback|any offers?)\b/i,
    answer: {
      text: "No codes from us: we'd rather earn it with what's on the shelf. Here's what's new at your store.",
      link: { label: "See what's new", url: SITE + "/category/new-arrivals/" },
    },
  },
  {
    asks: ALCOHOL,
    answer: {
      text: "We're unable to talk about those on WhatsApp, but our mixers and tonics are just a tap away.",
      link: { label: "See the mixers", url: SITE + "/search-results/?query=tonic" },
    },
  },
  {
    asks: /(address|number) (has )?changed|new address|shifted/i,
    answer: {
      text: "You can update it at checkout, or tell customer care here and they'll gladly change it for you.",
      link: { label: "My account", url: SITE + "/account/" },
    },
  },
];
export const faq = (text: string) => FAQ.find((entry) => entry.asks.test(text))?.answer;

// One product as its own message: its photo, name, price and page, and an "Add to basket" button the bot answers itself
// (lib/whatsapp.ts), with no AI call: one tap from a suggestion to the basket. For what the AI suggests, and what's in
// stock instead of something sold out; from the catalogue's own data, never the model's words.
export const ADD_TO_BASKET = "Add to basket";
export const productCard = (product: Product): Msg => {
  const urlKey = /\/shop\/product\/([\w-]+)/.exec(product.url)?.[1];
  return {
    ...(product.image && { photo: { url: product.image, alt: product.name } }),
    text: `*${product.name}* · ${price(product.price_inr)}\n${product.url}`,
    // A product page gets the button; any other page, a link to it.
    ...(urlKey
      ? { buttons: [{ title: ADD_TO_BASKET, next: `add:${urlKey}` }] }
      : { link: { label: "Take a look", url: product.url } }),
  };
};

// The same product as a carousel card, for the AI's picks (lib/ai.ts): WhatsApp allows a card 160 characters, so a long
// name gives way before the page does. Products with a photo only: every card needs one.
export const carouselCard = (product: Product) => {
  const { photo, text, buttons } = productCard(product);
  return { photo: photo!, text: fitCard(text, product.name), buttons: buttons! };
};

// After the AI adds to their basket (add_to_basket), or a card's button does: what went in, and for what had sold out by
// then, "you just missed it" with the closest in-stock items (never when it's back). Written from what the add returned.
export const addedTo = (
  store: string,
  result: { added: BasketLine[]; out: string[]; missing: string[]; url: string },
  instead: { name: string; price_inr: number; url: string }[],
): Msg[] => {
  const at = storeName(store);
  const { added, out, missing } = result;
  const they = out.length > 1 ? "they've" : "it's";
  const nothingAdded = added.length ? "" : ", so nothing was added";
  const inStockInstead = instead.length ? " In stock instead:" : "";
  const text = paragraphs(
    added.length ? `Added to your basket at FoodStories ${at} ✅\n${added.map(basketLine).join("\n")}` : "",
    missing.length ? `Not sold at ${at}: ${boldList(missing)}.` : "",
    out.length
      ? `You just missed ${boldList(out)}: ${they} sold out at ${at} right now${nothingAdded}.${inStockInstead}`
      : "",
  );
  const link = added.length ? { label: "Open my basket", url: result.url } : undefined;
  return [{ text, link }, ...instead.map(productCard)];
};

// A card's "Add to basket" that didn't go through: its page, to add it there.
export const notAdded = (key: string): Msg => ({
  text: "Our apologies, that didn't go through. You can add it from its page instead.",
  link: { label: "Take a look", url: `https://www.foodstories.shop/shop/product/${key}/` },
});

// After the AI moves a customer to another store (change_store): where their basket is now and what didn't come along,
// written from what actually moved rather than by the model. The basket page has the prices.
export const moved = (
  store: string,
  basket: { lines: { name: string; in_stock: boolean }[]; missing: string[]; url: string },
): Msg => {
  const at = storeName(store);
  const outOfStock = basket.lines.filter((line) => !line.in_stock).map((line) => line.name);
  const text = paragraphs(
    basket.lines.length
      ? `All set ✅ Your basket has moved to FoodStories ${at}, with its own prices and stock.`
      : `All set ✅ You're now shopping at FoodStories ${at}.`,
    basket.missing.length ? `Not sold at ${at}, so left out: ${boldList(basket.missing)}.` : "",
    outOfStock.length ? `Out of stock there right now: ${boldList(outOfStock)}.` : "",
  );
  return { text, link: basket.lines.length ? { label: "Open my basket", url: basket.url } : undefined };
};

// After the AI sets their basket reminder (set_reminder), in the words of the tap that set it, from what was set rather
// than by the model. reminder_day is the day they want the basket; the weekly_basket template goes the day before.
export const reminded = (reminder: { reminder_day?: string; reminder_cadence?: string }): Msg => {
  const { reminder_day: day, reminder_cadence: cadence } = reminder;
  if (cadence === "off")
    return {
      text: "Done, no more basket reminders from us. Your basket is ready whenever you'd like it.",
      link: { label: "Open my basket", url: SITE + "/checkout/cart/" },
    };
  const fortnightly = cadence === "fortnightly";
  const dayBefore = day && DAYS[(DAYS.indexOf(day) + 6) % 7];
  const text = dayBefore
    ? `Done ✅ ${fortnightly ? "Every other" : "Every"} ${dayBefore}, we'll send your ${day} basket here: one tap to confirm, or skip that week. Nothing arrives unless you confirm.`
    : `Done ✅ We'll send your basket here ${fortnightly ? "every 2 weeks" : "every week"}, the day before: one tap to confirm, or skip that week. Nothing arrives unless you confirm.`;
  return { text, link: { label: "Review my basket", url: SITE + "/checkout/cart/" } };
};

const price = (amount: number) => "₹" + amount.toLocaleString("en-IN");
// "Banjara Hills, Hyderabad" is "Banjara Hills" in a message.
const storeName = (store: string) => store.split(",")[0];
const boldList = (names: string[]) => names.map((name) => `*${name}*`).join(", ");
// The parts that apply, a paragraph each.
const paragraphs = (...parts: string[]) => parts.filter(Boolean).join("\n\n");

// "*Country Sourdough* × 2 · ₹175 each"
const basketLine = (line: BasketLine) =>
  `*${line.name}* × ${line.qty} · ${price(line.unit_price_inr)}${line.qty > 1 ? " each" : ""}`;

// A card's text cut to fit: the bold name gives way, with "…", so the page stays whole.
const fitCard = (text: string, name: string) => {
  if (text.length <= CARD_LIMIT) return text;
  const keep = name.length - (text.length - CARD_LIMIT) - 1; // the name's length that leaves room for "…"
  return text.replace(`*${name}*`, `*${name.slice(0, Math.max(1, keep)).trimEnd()}…*`);
};
