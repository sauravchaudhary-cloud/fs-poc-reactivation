// 3 · Inactive, still browsing: their last visit decides the first message
import type { Flow } from "../../lib/bot.ts";
import { basket, ROWS, nextSlots, slotList, slotOpen, slotGone, expressDelivery, CLOSEST } from "./shared.ts";

export const stillBrowsing: Flow[] = [
  {
    n: 3,
    name: "Reached checkout",
    key: "browse-checkout",
    signal: "Got to checkout, then stopped because the slot they wanted was full",
    category: "Bakery and dairy",
    who: "After the 72 hours the cart journeys own · from their store · marketing template",
    why: [
      "Names what's in their basket (they put it there) and removes the blocker with 60-minute delivery or pickup (Gallino & Moreno 2014).",
      "No timestamps and no “still thinking?”. One message about this basket, then it stops.",
      "If the burrata has gone by the time they tap, the bot says so and offers the rest or a swap, instead of a basket with a hole in it.",
    ],
    gate: [
      "The basket is still non-empty and every line is in stock at Bandra (burrata: 10 or more); “and 2 more” is re-read at send",
      "checkout_blocked = slot; other reasons get their own variant (payment → the payment flow, address → “check the pin”, unknown → “your basket is saved”)",
      "Sent before 2 pm so “60 minutes today” holds, and no cart-journey message in the last 7 days",
    ],
    start: {
      text: "Hi Arjun,\n\nYour basket at FoodStories Bandra is saved, with a *Spotted Cow burrata*, a *Country sourdough* and 2 more. It's been a little while since your last order, and we'd love to have you back.\n\nEverything is in stock, and it can be with you in *60 minutes* today or ready to collect at the store on Hill Road. Which would suit you?",
      footer: "FoodStories Bandra · Reply STOP to opt out",
      buttons: [
        { title: "Deliver it", next: "when" },
        { title: "I'll pick it up", next: "pickup" },
        { title: "Not now", next: "later" },
      ],
    },
    nodes: {
      when: [
        {
          text: "With pleasure. Which delivery time suits you best?",
          needs: { what: "every basket line is still in stock at Bandra", else: "short" },
          bot: "rows from the slot service at tap time; “Now, in 60 minutes” only inside store hours, before the express cut-off and in an express pincode",
          list: {
            button: "Choose a time",
            section: "Delivery from Bandra",
            rows: [
              { title: "Now, in 60 minutes", next: "pay" },
              { title: "Today, 6–8 pm", next: "pay" },
              { title: "Saturday, 9–10 am", next: "pay" },
              { title: "Sunday, 10–11 am", next: "pay" },
            ],
          },
        },
      ],
      short: [
        {
          text: "You've just missed the *Spotted Cow burrata*, which has sold out at Bandra. Everything else in your basket is in stock.\n\nShall we send the rest as it is, or swap in the *Manchego* instead?",
          bot: CLOSEST,
          buttons: [
            { title: "Send the rest", next: "rest" },
            { title: "Swap it", next: "rest" },
            { title: "Not now", next: "later" },
          ],
        },
      ],
      rest: [
        {
          ...slotList("Noted, thank you. When would you like it delivered?", "Delivery from Bandra", nextSlots("pay")),
          bot: "after “Swap it” the bot adds the Manchego first; " + ROWS,
        },
      ],
      pay: [
        slotOpen(
          "Perfect, *{choice}* it is ✅\n\nThe slot is open and selected for you at checkout, so it's yours as soon as you confirm and pay.",
        ),
      ],
      slotgone: slotGone("Bandra", "pay"),
      pickup: [
        {
          ...basket(
            "Wonderful. Your basket can be ready at Hill Road from *11 am tomorrow*. The store is open 10 am–9 pm.\n\nConfirm and pay online, and it will be waiting for you at the counter.",
            "Confirm pickup",
            "/checkout?pickup=1",
          ),
          needs: { what: "every basket line is still in stock at Bandra", else: "short" },
          bot: "the ready time is computed at tap from store hours and prep time",
        },
      ],
      later: [
        {
          ...basket(
            "Of course, Arjun. Your basket stays saved, and we won't message you about it again.\n\nIt's here whenever you'd like it.",
          ),
          bot: "sets cart_nudge_suppressed = a hash of these basket lines, so a different basket later can still be nudged; exits the journey",
        },
      ],
    },
  },
  {
    n: 3,
    name: "Left items in a cart",
    key: "browse-cart",
    signal: "Left a babka and avocados in the cart",
    category: "Bakery and dairy",
    who: "After the 72 hours the cart journeys own · from their store · marketing template",
    why: [
      "Names the items they put in the basket, says they're in stock at their store today, and offers the next open slot.",
      "Never says when they visited, and never asks if they're “still thinking”.",
      "One message about this basket. “Not now” leaves it saved and ends there. If the babka has sold out by the tap, the bot says so and offers what's out of the oven now.",
    ],
    gate: [
      "Both items in stock at Banjara Hills at send (babka: 10 or more), and the cart hasn't changed since segmentation",
      "Sent before 2 pm so the 4–6 pm slot is real, and that slot has capacity",
      "No cart-journey message in the last 7 days",
    ],
    start: {
      text: "Hi Mira,\n\nThe *Spinach & Feta babka* and *Hass avocados* in your basket are both in stock at Banjara Hills today. It's been a little while since your last order, and it would be a pleasure to look after you again.\n\nOur next open delivery slot is *4–6 pm* today. Shall we send them over then?",
      footer: "FoodStories Banjara Hills · Reply STOP to opt out",
      buttons: [
        { title: "Book 4–6 pm", next: "book" },
        { title: "Choose another time", next: "when" },
        { title: "Not now", next: "later" },
      ],
    },
    nodes: {
      book: [
        {
          ...basket(
            "Wonderful, *Today, 4–6 pm* it is ✅\n\nThe slot is open and selected for you at checkout, so it's yours as soon as you confirm and pay.",
            "Confirm and pay",
            "/checkout",
          ),
          needs: { what: "the 4–6 pm slot is still open and both items are still in stock", else: "changed" },
          bot: "the button payload carries the slot id; passes it in the link",
        },
      ],
      changed: [
        {
          text: "Our apologies, either the *4–6 pm* slot has just filled or the babka has sold out at Banjara Hills. If it's the babka, the *Dark Rye sourdough* is in your basket in its place.\n\nShall we find you another time? Checkout will show exactly what's in your basket.",
          bot: CLOSEST + "; says which of the two it was, and swaps the Dark Rye in only if the babka is out",
          buttons: [
            { title: "Pick another time", next: "when" },
            { title: "Not now", next: "later" },
          ],
        },
      ],
      when: [slotList("With pleasure. Which time would suit you best?", "From Banjara Hills", nextSlots("pay"))],
      pay: [
        slotOpen(
          "Perfect, *{choice}* it is ✅\n\nThe slot is open and selected for you at checkout, so it's yours as soon as you confirm and pay.",
        ),
      ],
      slotgone: slotGone("Banjara Hills", "pay"),
      later: [
        {
          ...basket(
            "Of course, Mira. Your basket stays saved, and we won't message you about it again.\n\nIt's here whenever you'd like it.",
          ),
          bot: "sets cart_nudge_suppressed = a hash of these basket lines; exits the journey",
        },
      ],
    },
  },
  {
    n: 3,
    name: "Viewed a product",
    key: "browse-product",
    signal: "Looked at Chiran matcha in the last 14 days",
    category: "Health and wellness",
    who: "After the 72 hours the cart journeys own · from their store · marketing template",
    why: [
      "The product leads as news, with what's in it and one pairing. It never says they were looking.",
      "“Not for me” still ends somewhere useful: other teas, or what's new in the wellness range.",
      "“Add both” only says “Done” once both are really in the basket; otherwise it names what's out and what's in instead.",
    ],
    gate: [
      "Matcha and macarons both in stock at Lavelle Road (5 or more); if the matcha is out, this customer gets “Viewed, but sold out” instead",
      "One template with the product, its origin line and pairing as variables, so every product doesn't need its own approval; the pairing is diet-guarded too (macarons carry egg)",
    ],
    start: {
      photo: { emoji: "🍵", alt: "Chiran matcha and coconut macarons" },
      text: "Hi Sana,\n\nFresh *Chiran matcha* is in at Lavelle Road. It's a shade-grown green tea from southern Japan, stone-ground, with nothing else in it. 🍵\n\nIt's been a little while since your last order, and we'd love to welcome you back.\n\nThe matcha pairs beautifully with our own *Coconut Macarons*. Shall we add both to your basket?",
      footer: "FoodStories Lavelle Road · Reply STOP to opt out",
      buttons: [
        { title: "Add both to my basket", next: "both" },
        { title: "Just the matcha", next: "one" },
        { title: "Not for me", next: "no" },
      ],
    },
    nodes: {
      both: [
        {
          ...basket(
            "Done ✅ The *Chiran matcha* and *Coconut Macarons* are in your basket at Lavelle Road, ready whenever you'd like to check out.",
            "Check out",
            "/checkout",
          ),
          needs: { what: "both are still in stock at Lavelle Road and both adds succeeded", else: "partial" },
          bot: "adds both, store-scoped and idempotent",
        },
      ],
      partial: [
        {
          ...basket(
            "You've just missed the *Coconut Macarons*, which have sold out at Lavelle Road, so the *Chiran matcha* is in your basket on its own.\n\nOur *butter croissants* are in stock, if you'd like something alongside. You can add them at checkout.",
            "Check out",
            "/checkout",
          ),
          bot: "names whichever is out and " + CLOSEST + "; if it's the matcha, it plays “gone” instead",
        },
      ],
      one: [
        {
          ...basket(
            "Done ✅ The *Chiran matcha* is in your basket at Lavelle Road, ready whenever you'd like to check out.",
            "Check out",
            "/checkout",
          ),
          needs: { what: "the matcha is still in stock and the add succeeded", else: "gone" },
          bot: "adds it, store-scoped and idempotent",
        },
      ],
      gone: [
        {
          text: "You've just missed the *Chiran matcha*, which has sold out at Lavelle Road.\n\nThe Tea Library's green blends are in stock, and so are the *Coconut Macarons*. Would you like to see the green teas?",
          bot: CLOSEST,
          buttons: [
            { title: "See the green teas", next: "teas" },
            { title: "Not for me", next: "no" },
          ],
        },
      ],
      teas: [
        basket(
          "With pleasure. Here are the Tea Library's green blends in stock at Lavelle Road.",
          "See the teas",
          "/collections/teas",
        ),
      ],
      no: [
        {
          text: "Noted, thank you. Would you like us to let you know when a new tea arrives, never more than once a month?",
          buttons: [
            { title: "Yes, new teas", next: "yes" },
            { title: "No, thanks", next: "bye" },
          ],
        },
      ],
      yes: [
        {
          ...basket(
            "Wonderful ✅ We'll write only when a new tea arrives at Lavelle Road, and never more than once a month.\n\nIn the meantime, the Tea Library blends are here whenever you'd like a look.",
            "See the teas",
            "/collections/teas",
          ),
          bot: "sets tea_alerts = true with a 30-day minimum gap (tea_alert_last_sent)",
        },
      ],
      bye: [
        {
          ...basket(
            "Of course, Sana. We'll keep the tea news to ourselves.\n\nIf you'd ever like a look, here's what's new in our Better for You range.",
            "See what's new",
            "/collections/better-for-you",
          ),
          bot: "sets tea_alerts = false and wa_snooze_until = +45 days",
        },
      ],
    },
  },
  {
    n: 3,
    name: "Viewed, but sold out",
    key: "browse-sold-out",
    signal: "Looked at Kodai Gruyère while it was sold out",
    category: "Cheese and charcuterie",
    who: "After the 72 hours the cart journeys own · from their store · marketing template",
    why: [
      "Turns “sold out” into a cross-sell: they just missed it, and here is what's at the counter now, chosen from the same category and price band.",
      "Talks about the product, never about their visit, and every answer ends with cheeses that are in today.",
      "Nobody knows when the next batch comes, so nothing is promised about it. The only forward promise is an alert if it ever comes back, and only if a stock feed can trigger it.",
    ],
    gate: [
      "The Gruyère is out at Vasant Kunj at send, and at least two items in the same category and price band are in; those fill the template",
      "“Tell me if it's back” only if a stock feed can trigger the alert; otherwise the template goes with two buttons",
    ],
    start: {
      text: "Hi Aarav,\n\nThe *Kodai Gruyère* is sold out at Vasant Kunj, but the *Manchego* and *Grandma Singletons cheddar* are at our cheese counter today, and both melt just as beautifully. 🧀\n\nIt's been a little while since your last order, and our cheesemonger would love to welcome you back. Shall we add the Manchego to your basket, or would you like to see the whole counter?",
      footer: "FoodStories Vasant Kunj · Reply STOP to opt out",
      buttons: [
        { title: "Add the Manchego", next: "manchego" },
        { title: "See the cheeses", next: "cheeses" },
        { title: "Tell me if it's back", next: "alert" },
      ],
    },
    nodes: {
      manchego: [
        {
          ...basket(
            "Done ✅ The *Manchego* is in your basket at Vasant Kunj, ready whenever you'd like to check out.",
            "Check out",
            "/checkout",
          ),
          needs: { what: "the Manchego is still in stock at Vasant Kunj and the add succeeded", else: "gone" },
          bot: "adds it, store-scoped and idempotent",
        },
      ],
      gone: [
        {
          ...basket(
            "Our apologies, you've just missed the *Manchego* at Vasant Kunj. 🙏\n\nHere's everything at our cheese counter right now.",
            "See the cheeses",
            "/collections/cheese",
          ),
          bot: CLOSEST,
        },
      ],
      cheeses: [
        basket(
          "Of course. Here's the full cheese counter at Vasant Kunj, with everything in stock.",
          "See the cheeses",
          "/collections/cheese",
        ),
      ],
      alert: [
        {
          ...basket(
            "Done ✅ If the *Kodai Gruyère* comes back to Vasant Kunj, you'll get one message from us, and nothing else.\n\nIn the meantime, the cheese counter is here whenever you'd like a look.",
            "See the cheeses",
            "/collections/cheese",
          ),
          bot: "sets back_in_stock_alert = Gruyère at Vasant Kunj, 30-day expiry; the back_in_stock utility template goes only on a stock-feed event, never on a date",
        },
      ],
    },
  },
  {
    n: 3,
    name: "Searched, not stocked",
    key: "browse-search",
    signal: "Searched for yuzu kosho, which isn't stocked",
    category: "Pantry and world foods",
    who: "After the 72 hours the cart journeys own · from their store · marketing template",
    why: [
      "Turns a dead-end search into a cross-sell: the closest things on the shelf, from the aisle they were looking in.",
      "Only for terms the buyers have mapped to an aisle and a closest item, so nobody is answered about a misspelling, or something we'd never stock.",
      "No promise about sourcing: the buyers see the ask, and the customer hears nothing until the item is on the shelf.",
    ],
    gate: [
      "The search term is on the buyers' map (canonical name, aisle, closest in-stock items); any other term gets no message",
      "Nothing WhatsApp bans from promotion in India (alcohol) ever reaches this template",
    ],
    start: {
      text: "Hi Dev,\n\nOur Japanese aisle at Vasant Kunj has a *citrus ponzu* and a *white miso* in today, and they're the closest we have to yuzu kosho.\n\nIt's been a little while since your last order, and it would be lovely to have you back. Would you like a look at the aisle?",
      footer: "FoodStories Vasant Kunj · Reply STOP to opt out",
      buttons: [
        { title: "Show me the aisle", next: "aisle" },
        { title: "What else is new?", next: "new" },
        { title: "No, thanks", next: "no" },
      ],
    },
    nodes: {
      aisle: [
        {
          ...basket(
            "With pleasure. Here's our Japanese aisle, with the *citrus ponzu* and *white miso* at the top.",
            "Japanese aisle",
            "/collections/japanese",
          ),
          bot: CLOSEST,
        },
      ],
      new: [
        basket(
          "Here's what's new across our world foods aisles at Vasant Kunj.",
          "See what's new",
          "/collections/world-foods",
        ),
      ],
      no: [
        {
          ...basket(
            "Of course, Dev. Our world foods aisles are here whenever you'd like a look.",
            "See the aisles",
            "/collections/world-foods",
          ),
          bot: "sets wa_snooze_until = +45 days",
        },
      ],
    },
  },
  {
    n: 3,
    name: "Browsed a category",
    key: "browse-category",
    signal: "Browsed the bakery without adding anything",
    category: "Bakery and dairy",
    who: "After the 72 hours the cart journeys own · from their store · carousel template",
    why: [
      "Three picks from the category they browsed, newest first, each with its own tap.",
      "Reads as what's new at their store this week, not as a reply to their visit.",
      "The checkout nudge goes once, however many cards they tap, and a card that sold out since the morning gets “you just missed it” and the other two instead of a false “Done”.",
    ],
    gate: [
      "Each card is a template variable: the three newest bakery items in stock at Lokhandwala that morning (10 or more), diet-guarded for the household (eggs, dairy)",
      "A plain three-button version of the template goes when the carousel fails to deliver (older WhatsApp clients)",
    ],
    start: {
      text: "Hi Raghav,\n\nHere are three of the newest picks from our bakery at FoodStories Lokhandwala this week, each a single tap from your basket. 🥐\n\nIt's been a little while since your last order, and our bakers would love to bake for you again.",
      cards: [
        {
          photo: { emoji: "🍞", alt: "Dark Rye sourdough" },
          text: "*Dark Rye sourdough*\nDense and tangy, and lovely with salted butter.",
          buttons: [{ title: "Add to my basket", next: "rye" }],
        },
        {
          photo: { emoji: "🥐", alt: "Butter croissants" },
          text: "*Butter croissants*\nFlaky, golden and properly buttery.",
          buttons: [{ title: "Add to my basket", next: "croissant" }],
        },
        {
          photo: { emoji: "🥬", alt: "Spinach & Feta babka" },
          text: "*Spinach & Feta babka*\nA savoury twist on the classic, for breakfast or tea.",
          buttons: [{ title: "Add to my basket", next: "babka" }],
        },
      ],
    },
    nodes: {
      rye: [
        {
          text: "Done ✅ The *Dark Rye sourdough* is in your basket at Lokhandwala.",
          needs: { what: "the Dark Rye is still in stock at Lokhandwala and the add succeeded", else: "out" },
          bot: "the checkout nudge below goes once per conversation; later taps get “Done ✅ … is in too” and the link",
        },
        expressDelivery,
      ],
      croissant: [
        {
          text: "Done ✅ The *butter croissants* are in your basket at Lokhandwala.",
          needs: { what: "the croissants are still in stock at Lokhandwala and the add succeeded", else: "out" },
          bot: "nudge once per conversation",
        },
        expressDelivery,
      ],
      babka: [
        {
          text: "Done ✅ The *Spinach & Feta babka* is in your basket at Lokhandwala.",
          needs: { what: "the babka is still in stock at Lokhandwala and the add succeeded", else: "out" },
          bot: "nudge once per conversation",
        },
        expressDelivery,
      ],
      out: [
        {
          ...basket(
            "Our apologies, you've just missed the *{item}* at Lokhandwala. 🙏\n\nThe other two picks are in stock, and so is the rest of our bakery.",
            "See the bakery",
            "/collections/bakery",
          ),
          bot: "{item} is the card that was tapped; the bot names the two in-stock cards",
        },
      ],
    },
  },
  {
    n: 3,
    name: "Home page only",
    key: "browse-home",
    signal: "Visited the home page only; fresh produce is what they buy most",
    category: "Fruits and vegetables",
    who: "After the 72 hours the cart journeys own · from their store · marketing template",
    why: [
      "With no product to go on, it leads with what's new in the category they buy most, fresh produce here.",
      "The first line promises freshness, as the produce playbook asks.",
      "“Not now” leaves the basket alone: nothing is added to a basket the customer just declined.",
    ],
    gate: [
      "Avocados and microgreens in stock at Banjara Hills that morning (10 or more): the two newest in-stock lines in their favourite category",
      "The weakest signal in the segment: it loses to any stronger signal and to the live cart journey",
    ],
    start: {
      photo: { emoji: "🥑", alt: "Hass avocados and microgreens" },
      text: "Hi Aisha,\n\nFresh *Hass avocados* are in at Banjara Hills, picked for ripeness, along with *microgreens* from our hydroponic range. 🥑\n\nIt's been a little while since your last order, and we'd love to have you back. Shall we add both to your basket?",
      footer: "FoodStories Banjara Hills · Reply STOP to opt out",
      buttons: [
        { title: "Add both to my basket", next: "add" },
        { title: "What else is new?", next: "new" },
        { title: "Not now", next: "later" },
      ],
    },
    nodes: {
      add: [
        {
          ...basket(
            "Done ✅ The *Hass avocados* and *microgreens* are in your basket at Banjara Hills, ready whenever you'd like to check out.",
            "Check out",
            "/checkout",
          ),
          needs: { what: "both are still in stock at Banjara Hills and both adds succeeded", else: "partial" },
          bot: "adds both, store-scoped and idempotent",
        },
      ],
      partial: [
        {
          ...basket(
            "Done ✅ The *Hass avocados* are in your basket.\n\nYou've just missed the *microgreens*, but our hydroponic greens are in stock if you'd like them in their place. You can add them at checkout.",
            "Check out",
            "/checkout",
          ),
          bot: "names whichever is out and " + CLOSEST,
        },
      ],
      new: [
        basket(
          "With pleasure. Here's everything that's new at Banjara Hills.",
          "See what's new",
          "/collections/new-in",
        ),
      ],
      later: [
        {
          ...basket("Of course, Aisha. Your basket is here whenever you'd like it."),
          bot: "nothing is added; sets wa_snooze_until = +45 days",
        },
      ],
    },
  },
];
