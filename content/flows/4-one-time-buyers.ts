// 4 · One-time buyers: their first order decides the category; learn why, then give a second reason
import type { Flow } from "../../lib/bot.ts";
import { basket, okayAnswers, expressDelivery, CLOSEST } from "./shared.ts";

export const oneTimeBuyers: Flow[] = [
  {
    n: 4,
    name: "Day 31 · feedback first",
    key: "once-feedback-first",
    signal: "One order 31 days ago, mostly from the bakery",
    category: "Bakery and dairy",
    who: "31 days after their first order · from Meher Sethi, Head of Guest Experience (a placeholder: the real person in that role signs at launch) · utility template",
    why: [
      "Feedback first, basket second: being asked about an order makes people more likely to buy again (Dholakia & Morwitz 2002).",
      "Each suggested item says why it's there: two from their first order, one new from the same category. Explained suggestions are taken up more often than unexplained ones (Herlocker et al. 2000).",
      "Only the question is a template, so it can qualify as utility. The basket comes after the tap, built from live stock.",
      "“It was okay” gets a real answer to each reason, and the two complaints (freshness, something else) go to customer care rather than a policy line.",
    ],
    gate: [
      "Exactly one order, delivered, and none since: checked at send, not at segmentation",
      "Order date and store are template variables; confirm 60-minute coverage per store with ops",
    ],
    start: {
      text: "Hi Ritika,\n\nI'm Meher Sethi, Head of Guest Experience at FoodStories. Your first order with us, mostly from our bakery, arrived on *18 Sept*, and I wanted to check in personally.\n\nHow did you find it? I'd love to hear, whatever the answer.",
      buttons: [
        { title: "Loved it", next: "loved" },
        { title: "It was okay", next: "okay" },
        { title: "Something was off", next: "off" },
      ],
    },
    nodes: {
      loved: [
        {
          text: "That's so good to hear, thank you. Our bakers will be delighted. 🥐",
          needs: {
            what: "the three items are in stock at Gurugram; the bot composes the list from live stock, keeping the reason for each",
            else: "loved_short",
          },
        },
        {
          header: "An idea for your next basket",
          text: "• *Country sourdough*, from your first order\n• *Butter croissants*, also from your first order\n• *Spinach and feta babka*, new in our bakery this week\n\nShall we add all three to your basket?",
          footer: "Delivered across Gurugram",
          buttons: [
            { title: "Add to my basket", next: "add" },
            { title: "Change something", next: "swap" },
            { title: "Maybe later", next: "later" },
          ],
        },
      ],
      loved_short: [
        { text: "That's so good to hear, thank you. Our bakers will be delighted. 🥐" },
        {
          header: "An idea for your next basket",
          text: "• *Country sourdough*, from your first order\n• *Dark Rye sourdough*, new in our bakery this week\n\nYou've just missed the butter croissants at Gurugram, so we've left them off. Shall we add these two to your basket?",
          footer: "Delivered across Gurugram",
          buttons: [
            { title: "Add to my basket", next: "add" },
            { title: "Change something", next: "swap" },
            { title: "Maybe later", next: "later" },
          ],
        },
      ],
      add: [
        {
          ...basket(
            "Done ✅ Everything is in your basket at Gurugram, ready whenever you'd like to check out.",
            "Check out",
            "/checkout",
          ),
          bot: "adds the items, store-scoped; if an add fails the link carries them so the site adds on open",
        },
      ],
      swap: [
        {
          text: "With pleasure. What would you like in place of this week's new bake?",
          bot: "rows are in-stock bakery items at tap time, leaving out what's already in the basket",
          list: {
            button: "Choose one",
            section: "From the bakery",
            rows: [
              { title: "Dark Rye sourdough", next: "swapped" },
              { title: "Coconut macarons", description: "FoodStories' own", next: "swapped" },
              { title: "Our own crackers", description: "Olive and sea salt", next: "swapped" },
            ],
          },
        },
      ],
      swapped: [
        basket(
          "Beautiful choice. *{choice}* it is, and your basket is ready whenever you'd like to check out.",
          "Check out",
          "/checkout",
        ),
      ],
      later: [
        basket(
          "Of course, Ritika. Your basket is here whenever you'd like it, and thank you again for the kind words.",
        ),
      ],
      ...okayAnswers(
        "Gurugram",
        basket(
          "Whenever you'd like something fresh, our bakery is right here. 🥐",
          "See the bakery",
          "/collections/bakery",
        ),
        basket(
          "We'd love the chance to make your next order wonderful. Our bakery is here whenever you're ready.",
          "See the bakery",
          "/collections/bakery",
        ),
      ),
    },
  },
  {
    n: 4,
    name: "Day 31 · basket first",
    key: "once-basket-first",
    signal: "One order 31 days ago, mostly from the Cheese Cellar",
    category: "Cheese and charcuterie",
    who: "The deck's test against feedback first · from Meher Sethi, Head of Guest Experience (a placeholder: the real person in that role signs at launch) · marketing template",
    why: [
      "The other arm of the deck's test: lead with a second basket built from their first order, then ask how it went.",
      "No discount. Customers won with deep discounts are worth about half as much over time (Lewis 2006).",
      "Because it suggests products, this one is a marketing template. The feedback-first version can go out as utility.",
      "“It was okay” collects the same five answers as the other arm, so the test compares like with like.",
    ],
    gate: [
      "Exactly one order and none since, checked at send",
      "The three items are filled per store from that morning's stock feed (Cheese Cellar, in their price band); the store is skipped if fewer than 3 are in",
    ],
    start: {
      text: "Hi Nandini,\n\nI'm Meher Sethi, Head of Guest Experience at FoodStories. It's been a little while since your first order, mostly from the Cheese Cellar, and we'd love to welcome you back. 🧀\n\nHere's a second basket, built around that first one:\n• *Kodai Gruyère*\n• *Manchego*\n• Our own *olive and sea salt crackers*\n\nWould you like all three?",
      footer: "FoodStories Banjara Hills · Reply STOP to opt out",
      buttons: [
        { title: "Add to my basket", next: "add" },
        { title: "Change something", next: "swap" },
        { title: "Not now", next: "later" },
      ],
    },
    nodes: {
      add: [
        {
          ...basket(
            "Done ✅ All three are in your basket at Banjara Hills, ready whenever you'd like to check out.",
            "Check out",
            "/checkout",
          ),
          needs: { what: "all three are still in stock at Banjara Hills and the adds succeeded", else: "short" },
          bot: "adds the three, store-scoped and idempotent",
        },
      ],
      short: [
        {
          ...basket(
            "Our apologies, you've just missed the *Kodai Gruyère* at Banjara Hills. The *Manchego* and crackers are in your basket, and the *Grandma Singletons cheddar* would round it off beautifully.",
            "See the cheeses",
            "/collections/cheese",
          ),
          bot: "names whichever is out and " + CLOSEST,
        },
      ],
      swap: [basket("With pleasure. You can add, remove or swap anything you like in your basket.", "Edit my basket")],
      later: [
        {
          text: "Of course. Before you go, may we ask how your first order went?",
          buttons: [
            { title: "Loved it", next: "loved" },
            { title: "It was okay", next: "okay" },
            { title: "Something was off", next: "off" },
          ],
        },
      ],
      loved: [basket("That's wonderful to hear, Nandini, thank you. 🧀\n\nYour basket is ready whenever you are.")],
      ...okayAnswers(
        "Banjara Hills",
        basket("Your cheese basket is here whenever you'd like it. 🧀"),
        basket("We'd love the chance to make your next order wonderful. Your basket is here whenever you're ready."),
      ),
    },
  },
  {
    n: 4,
    name: "After the feast",
    key: "once-after-feast",
    signal: "One order, mostly fresh produce; quiet since",
    category: "Fruits and vegetables",
    who: "Wed 11 Nov, the week after Diwali · from their store · also goes to quiet regulars · marketing template",
    why: [
      "A fresh start after Diwali: a lighter, joyful basket rather than a diet message, in the brand's own spirit.",
      "The week after a festival is a natural fresh start, when people are most open to new routines (Dai 2014).",
      "Goes to customers without the app; app users get the push version.",
    ],
    gate: [
      "Sent 9–15 Nov only; the four items are template variables filled per store from that morning's stock (10 or more), skipping stores with fewer than 3",
      "Diet guard: greens, avocados, rye and tea suit every household; nothing with eggs or meat here",
    ],
    start: {
      photo: { emoji: "🥗", alt: "a fresh basket for the week after Diwali" },
      text: "Hi Karan,\n\nWe hope Diwali filled your home with light and laughter. 🪔 For the calmer days after the feast, we've put together a fresh basket:\n• Hydroponic greens\n• Hass avocados\n• Dark Rye sourdough\n• Tea Library Morning Reset\n\nIt's been a little while since your last order, and all of us at Lokhandwala would love to welcome you back. Shall we add it to your basket?",
      footer: "FoodStories Lokhandwala · Reply STOP to opt out",
      buttons: [
        { title: "Add to my basket", next: "add" },
        { title: "Change something", next: "swap" },
        { title: "Not now", next: "later" },
      ],
    },
    nodes: {
      add: [
        {
          text: "Done ✅ All four are in your basket at Lokhandwala.",
          needs: { what: "all four are still in stock at Lokhandwala and the adds succeeded", else: "short" },
          bot: "adds the four, store-scoped and idempotent",
        },
        expressDelivery,
      ],
      short: [
        {
          ...basket(
            "Our apologies, you've just missed the *Hass avocados* at Lokhandwala. The other three are in your basket.\n\nIf you'd like fruit in their place, the *seedless grapes* are in stock, and you can add them at checkout.",
            "Check out",
            "/checkout",
          ),
          bot: "names whichever is out and " + CLOSEST,
        },
      ],
      swap: [
        {
          text: "Certainly. Which would you like to leave out?",
          list: {
            button: "Choose one",
            section: "In the basket",
            rows: [
              { title: "Hydroponic greens", next: "swapped" },
              { title: "Hass avocados", next: "swapped" },
              { title: "Dark Rye sourdough", next: "swapped" },
              { title: "Morning Reset tea", next: "swapped" },
            ],
          },
        },
      ],
      swapped: [
        basket(
          "Noted, no *{choice}* this time. The other three are ready whenever you'd like to check out.",
          "Check out",
          "/checkout",
        ),
      ],
      later: [
        basket(
          "Of course, Karan. Your basket is here whenever you'd like it.\n\nWishing you and yours a joyful week ahead. ✨",
        ),
      ],
    },
  },
];
