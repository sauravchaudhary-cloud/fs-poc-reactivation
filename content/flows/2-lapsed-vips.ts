// 2 · Lapsed VIPs: their signature item and favourite category lead; access and convenience, never a discount
import type { Flow } from "../../lib/bot.ts";
import {
  basket,
  ROWS,
  nextSlots,
  slotList,
  slotOpen,
  slotGone,
  CONCIERGE_BY,
  HAMPER_ROWS,
  CUTOFF,
  CLOSEST,
  CALLBACK,
  catalogPhoto,
} from "./shared.ts";

export const lapsedVips: Flow[] = [
  {
    n: 2,
    name: "Day 30 · their usual, kept aside",
    key: "vip-kept-aside",
    signal: "VIP whose signature item, burrata, is in most of their orders",
    category: "Cheese and charcuterie",
    who: "Day 30 without an order · from their store · marketing template",
    why: [
      "Leads with their signature item, set aside under their name for them to buy. No discount, and nothing about the lapse or their spend.",
      "Real, specific scarcity (one set aside in her name) persuades more than a deadline (Aggarwal 2011).",
      "The promise is physical, so it's only made to as many VIPs as there are burratas, and the store sees the hold list before the message goes.",
      "If the burrata has gone by the time they tap, the bot says they just missed it and offers what's at the counter now. Nobody knows when the next batch comes, so nothing is promised about it.",
      "Even “Not this time” ends one tap from something to buy: their saved basket if it has something in stock, otherwise the counter. The burrata is never put in a basket they declined, and the hold is released for someone else.",
    ],
    gate: [
      "A pre-send job allocates today's burrata per store: this goes only to VIPs with one allocated (reserved_until on the profile), never more than the stock",
      "The store has the hold list that morning, as a POS note under each name; sends are capped at 30% of the day's stock, and a hold nobody has tapped by 8 pm is released",
    ],
    start: {
      photo: catalogPhoto("1/0/prd_4856_bb27cbd9f56fbaeb.jpg", "fresh Spotted Cow burrata at Banjara Hills"),
      text: "Hi Anjali,\n\nA fresh batch of *Spotted Cow burrata* reached our Banjara Hills cheese counter today, and we've set one aside in your name. 🧀\n\nIt's yours until *Wednesday, 8 pm*. Shall we bring it over, or keep it for you at the store?",
      footer: "FoodStories Banjara Hills · Reply STOP to opt out",
      buttons: [
        { title: "Send it over", next: "send" },
        { title: "I'll collect it", next: "pickup" },
        { title: "Not this time", next: "no" },
      ],
    },
    nodes: {
      send: [
        {
          ...slotList("With pleasure. When would suit you?", "From Banjara Hills", nextSlots("pay")),
          needs: {
            what: "the hold is still live (before Wednesday 8 pm) and a burrata is still at the store",
            else: "gone",
            stock: ["spotted-cow-burrata-di-bufala"],
          },
        },
      ],
      pay: [
        slotOpen(
          "*{choice}* is open ✅\n\nYour cheese is in your basket, and the slot is already picked at checkout. Add anything else you'd like, then confirm and pay to make it yours.",
        ),
      ],
      slotgone: slotGone("Banjara Hills", "pay"),
      pickup: [
        {
          ...basket(
            "Perfect. Your *Spotted Cow burrata* is at the Cheese Cellar counter under your name until *Wednesday, 8 pm*, and the store is open 10 am–9 pm.\n\nSimply show this message when you come in. Anything you add to your basket will be packed with it.",
            "Add to my pickup",
          ),
          needs: {
            what: "the hold is still live and a burrata is still at the store",
            else: "gone",
            stock: ["spotted-cow-burrata-di-bufala"],
          },
          bot: "tells the store (POS note: name, burrata, until Wed 8 pm); marks the basket for pickup",
        },
      ],
      gone: [
        {
          text: "Our apologies, the last of that batch has gone, so you've just missed it. 🙏\n\nThe *Manchego* and the *Kodai Gruyère* are at the counter today, if you'd like one of those instead.",
          bot: CLOSEST,
          buttons: [
            { title: "Send the Manchego", next: "alt" },
            { title: "See the cheeses", next: "cheeses" },
            { title: "Not this time", next: "no" },
          ],
        },
      ],
      alt: [
        {
          ...slotList("Beautiful choice. When would suit you?", "From Banjara Hills", nextSlots("pay")),
          bot: "adds the Manchego to the basket first; " + ROWS,
        },
      ],
      cheeses: [
        basket(
          "Here's everything at our Banjara Hills cheese counter today, to browse at your leisure.",
          "See the cheeses",
          "/collections/cheese",
        ),
      ],
      no: [
        {
          ...basket(
            "Of course, Anjali. We'll write only when something special arrives, or your usual basket is ready to go.\n\nYour basket is saved here whenever you'd like it.",
          ),
          needs: {
            what: "their saved basket has at least one line in stock at Banjara Hills (the burrata is never added on a decline)",
            else: "counter",
          },
          bot: "releases the hold so the burrata goes back on sale; sets wa_snooze_until = +30 days; the basket page shows live stock and greys out anything that has sold out since",
        },
      ],
      counter: [
        {
          ...basket(
            "Of course, Anjali. We'll write only when something special arrives, or your usual basket is ready to go.\n\nThe Cheese Cellar is here whenever you'd like a look.",
            "See the cheeses",
            "/collections/cheese",
          ),
          bot: "releases the hold so the burrata goes back on sale; sets wa_snooze_until = +30 days",
        },
      ],
    },
  },
  {
    n: 2,
    name: "Day 60 · first pick of a new drop",
    key: "vip-new-drop",
    signal: "VIP who buys single-origin coffee in most orders",
    category: "Snacks, chocolate, coffee and tea",
    who: "Day 60 without an order · from their store · marketing template",
    why: [
      "First pick of something small-batch in the category they buy most, instead of an offer.",
      "At most one coffee drop a month, as the coffee playbook says.",
      "Nothing about how long it's been, and nothing that suggests they've lapsed. A rotating drop is never called their “usual”.",
    ],
    gate: [
      "Bags are allocated per VIP at Lavelle Road before send: sends never exceed the bags set aside, and a bag nobody has tapped by 8 pm is released",
      "No coffee-drop message in the last 30 days (last_coffee_drop_at)",
    ],
    start: {
      photo: catalogPhoto("1/0/prd_6460_61bd9a273705948c.jpg", "the new single-origin from Nandan"),
      text: "Hi Leela,\n\nA new small-batch *single-origin from Nandan*, roasted this month, reached our Lavelle Road store today. ☕\n\nYou have first pick before it goes on the shelf on *Saturday*. Shall we set a bag aside in your name?",
      footer: "FoodStories Lavelle Road · Reply STOP to opt out",
      buttons: [
        { title: "Set one aside for me", next: "keep" },
        { title: "Tell me more", next: "about" },
        { title: "Not this time", next: "no" },
      ],
    },
    nodes: {
      keep: [
        {
          ...basket(
            "Done ✅ A bag is set aside in your name at Lavelle Road until *Saturday*, when the rest goes on the shelf.\n\nIt's in your basket too, ready for any order you place before then.",
            "Open my basket",
          ),
          needs: { what: "a bag is still allocated to her and it's before Saturday", else: "gone" },
          bot: "marks the bag reserved (name, until Saturday) on the store's hold list; adds it to the basket",
        },
      ],
      about: [
        basket(
          "It's a small-batch single-origin from Nandan, roasted this month. The tasting notes and the estate's story are on its page.",
          "Read about it",
          "/product/nandan-single-origin",
        ),
        {
          text: "Shall we set a bag aside in your name?",
          buttons: [
            { title: "Set one aside for me", next: "keep" },
            { title: "Not this time", next: "no" },
          ],
        },
      ],
      gone: [
        {
          ...basket(
            "Our apologies, the last bags have gone, so you've just missed it. 🙏\n\nTwo other single-origins roasted this month are on our coffee shelf, if you'd like to try one.",
            "See the coffee shelf",
            "/collections/coffee",
          ),
          bot: CLOSEST + "; sets last_coffee_drop_at so nothing else about coffee goes for 30 days",
        },
      ],
      no: [
        {
          ...basket(
            "Of course, Leela. We'll write about coffee only when something new arrives, and never more than once a month.\n\nThe coffee shelf is here whenever you'd like a look.",
            "See the coffee shelf",
            "/collections/coffee",
          ),
          bot: "releases the bag; sets wa_snooze_until = +30 days",
        },
      ],
    },
  },
  {
    n: 2,
    name: "Day 64 · their usual, ready to go",
    key: "vip-usual-basket",
    signal: "VIP with a usual basket: the same few items on most Saturdays",
    category: "Cheese and charcuterie",
    who: "Four days after the day-60 message · from their store · marketing template",
    why: [
      "Rebuilds their usual Saturday basket from their order history, so coming back takes one tap.",
      "Convenience, not an offer: their usual day, their usual items, from their own store.",
      "Every answer ends in that basket, whether they keep it as it is, change it, or want it later. “Not this week” asks whether to ask again.",
    ],
    gate: [
      "The usual basket is rebuilt from the last 6 months' orders that morning; only items in stock at Bandra are named, and the message is skipped if fewer than 3 survive",
      "Bandra takes Saturday slots at least 4 days ahead (confirm with ops); otherwise this goes on Friday instead",
    ],
    start: {
      text: "Hi Siddharth,\n\nWe've put together your usual Saturday basket at our Bandra store: *Kodai Gruyère*, *Spotted Cow burrata*, a *Country sourdough* and 3 more of your favourites. 🧀\n\nShall we bring it over this Saturday morning?",
      footer: "FoodStories Bandra · Reply STOP to opt out",
      buttons: [
        { title: "Yes, this Saturday", next: "sat" },
        { title: "Let me change it", next: "change" },
        { title: "Not this week", next: "later" },
      ],
    },
    nodes: {
      sat: [
        {
          text: "Wonderful. What time would suit you on Saturday?",
          bot: "rows from the slot service: Saturday's open slots at Bandra (next Saturday if today is Saturday)",
          list: {
            button: "Choose a time",
            section: "Saturday, from Bandra",
            rows: [
              { title: "9–10 am", next: "pay" },
              { title: "10–11 am", next: "pay" },
              { title: "11 am–12 pm", next: "pay" },
            ],
          },
        },
      ],
      pay: [
        {
          ...basket(
            "Saturday, *{choice}* is open ✅\n\nEverything in your usual basket is in stock at Bandra this week. Once you confirm and pay, the slot is yours.",
            "Confirm and pay",
            "/checkout",
          ),
          needs: { what: "every basket line is in stock at Bandra and the slot is still open", else: "short" },
          bot: "re-checks each line at tap; passes the slot id in the link",
        },
      ],
      short: [
        {
          ...basket(
            "Saturday, *{choice}* is open ✅\n\nOne change: the *burrata* is out at Bandra this week, so we've left it off. The *Manchego* is in if you'd like it instead, and you can swap it in at checkout.",
            "Confirm and pay",
            "/checkout",
          ),
          bot:
            "names whatever is out (all of them if more than one) and " + CLOSEST + "; passes the slot id in the link",
        },
      ],
      change: [
        basket(
          "With pleasure. Your usual basket is open on our website, so you can add, remove or swap anything, then choose a slot.",
          "Edit my basket",
        ),
      ],
      later: [
        {
          text: "Of course. Shall we ask again next Friday, or simply keep your basket saved?",
          buttons: [
            { title: "Ask me next Friday", next: "reask" },
            { title: "Keep it saved", next: "saved" },
          ],
        },
      ],
      reask: [
        {
          ...basket(
            "Done ✅ We'll ask just once more, next Friday, and your usual basket stays saved here in the meantime.",
            "See my usual basket",
          ),
          bot: "sets usual_basket_reask_on = next Friday; the reminder goes only if the 2-in-7 cap allows, and inside a gifting window the day-70 message carries it instead",
        },
      ],
      saved: [
        {
          ...basket(
            "Perfect, Siddharth. Your usual basket stays saved, ready whenever you'd like it.",
            "See my usual basket",
          ),
          bot: "sets wa_snooze_until = +30 days",
        },
      ],
    },
  },
  {
    n: 2,
    name: "Day 70 · festive hampers, two days early",
    key: "vip-diwali-early",
    signal: "VIP who sent hampers last festive season",
    category: "Hampers, from the top of their usual price band",
    who: "Ten days after the day-60 message, in a gifting window (Christmas here) · from their store · marketing template",
    why: [
      "Early access, not a discount: hampers two days before everyone else, starting at the top of their usual price band.",
      "Remembers what they sent last year, so the easiest answer is one tap, and a call if the list can't be rebuilt.",
      "Names and addresses stay on the website, never in the chat.",
    ],
    gate: [
      "Last year's hamper exists this year with stock for the same quantity, and at least 2 ship-to addresses are on file; otherwise the template goes without “Same as last year”",
      "Sent at least 2 days before the public opening and before the occasion's order-by date (18 Dec for Christmas)",
    ],
    start: {
      photo: catalogPhoto("1/0/1000018946-pdp-1_fetnh8lqz8reu2uh.jpg", "this season's Festive Edit hampers"),
      text: "Hi Anjali,\n\nYou have first pick of our Christmas and New Year hampers from today, two days before they open to everyone on *Sunday*. 🎄\n\nLast year you sent *4 Harvests of the World hampers*. Every hamper can carry a gift note from you, whichever you choose.",
      footer: "FoodStories Banjara Hills · Reply STOP to opt out",
      buttons: [
        { title: "Same as last year", next: "same" },
        { title: "See this year's hampers", next: "hampers" },
        { title: "Not this year", next: "no" },
      ],
    },
    nodes: {
      same: [
        {
          ...basket(
            "Wonderful. Your gift list is ready: *4 Harvests of the World hampers* at *₹9,500* each, to last year's 4 addresses.\n\nPlease check each address is still right, then confirm and pay.",
            "Review my gift list",
            "/gift-list?from=2025",
          ),
          needs: {
            what: "4 hampers are still in stock and the gift list has last year's 4 addresses",
            else: "same_call",
          },
          bot: "prefills the gift list from last year's order; hamper stock and prices re-read at tap",
        },
      ],
      same_call: [
        {
          ...basket(
            `Of course. Our gifting concierge will call you ${CONCIERGE_BY} to confirm the 4 addresses and send you a payment link.\n\nThis year's Festive Edit is here to browse in the meantime.`,
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: CALLBACK,
        },
      ],
      hampers: [
        {
          text: "With pleasure. Here's this year's Festive Edit:",
          bot: HAMPER_ROWS,
          list: {
            button: "View hampers",
            section: "Festive Edit 2026",
            rows: [
              { title: "Harvests of the World", description: "₹9,500 · our grandest hamper", next: "picked" },
              { title: "The Glow-Up Box", description: "₹6,000 · Tea Library blends, Manuka honey", next: "picked" },
              {
                title: "Cheese platter",
                description: "₹6,150 · same-city delivery only, from the Cheese Cellar",
                next: "picked",
              },
            ],
          },
        },
      ],
      picked: [
        {
          ...basket(
            "Beautiful choice, *{choice}* it is.\n\nYour gift list is ready for you to choose who it's for and when it arrives.",
            "Open my gift list",
            "/gift-list",
          ),
          needs: { what: CUTOFF, else: "late" },
        },
      ],
      late: [
        {
          ...basket(
            "Our apologies, that one can't reach you in time for Christmas now. 🙏\n\nEverything still in stock that can arrive before New Year's Eve is here, to choose from at your leisure.",
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: "after New Year's Day the link goes to the Cheese Cellar instead",
        },
      ],
      no: [
        {
          ...basket(
            "Of course, Anjali. We won't write about hampers again this season.\n\nIf you're hosting, our Banjara Hills Cheese Cellar is ready whenever you are. Season's greetings from all of us. 🎄",
            "See the cheeses",
            "/collections/cheese",
          ),
          bot: "sets gifting_declined_until = 2 Jan, so the slot cut-off push and every other hamper message skip her",
        },
      ],
    },
  },
];
