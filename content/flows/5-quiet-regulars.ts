// 5 · Quiet regulars: their order history and time away set the message
import type { Flow } from "../../lib/bot.ts";
import {
  basket,
  slotList,
  slotOpen,
  slotGone,
  CARE_BY,
  TICKET,
  putRight,
  weekly,
  REMINDER,
  standingSet,
  catalogPhoto,
} from "./shared.ts";

export const quietRegulars: Flow[] = [
  {
    n: 5,
    name: "Day 31–60 · new arrivals",
    key: "regular-new-arrivals",
    signal: "Regular, cheese in most orders; no order or visit for 30+ days",
    category: "Cheese and charcuterie",
    who: "31–60 days away · from their store · carousel template",
    why: [
      "Opens with one gentle welcome-back line tied to their Cheese Cellar habit, never a “we miss you” cliché, then goes straight to what's new in the category they buy most.",
      "One swipeable message instead of three, and each card has its own tap.",
      "A standing order comes up only after they show interest, and only once. Regulars on repeat orders stay mainly for the convenience.",
    ],
    gate: [
      "The three cards are template variables: the three newest Cheese Cellar arrivals in stock at Lavelle Road that morning (5 or more), diet-guarded",
      "No standing-order pitch in the last 30 days (standing_declined_until)",
    ],
    start: {
      text: "Hi Ishita,\n\nIt's been a little while since your last order from the Cheese Cellar at Lavelle Road, and we'd love to welcome you back. 🧀\n\nHere are the three newest cheeses on the counter, each just one tap from your basket.",
      cards: [
        {
          photo: catalogPhoto("1/0/prd_7205_f020cee77acfab92.jpg", "Kodai Gruyère"),
          text: "*Kodai Gruyère*\nMade in Kodaikanal from cow's milk. Nutty and firm, and beautiful melted over toast.",
          buttons: [{ title: "Add to my basket", next: "gruyere" }],
        },
        {
          photo: catalogPhoto("1/0/prd_4374_0774d1cfed1bd33b.jpg", "Manchego"),
          text: "*Manchego*\nA sheep's milk cheese from La Mancha, Spain. Rich and gently sharp, and made for a cheese board.",
          buttons: [{ title: "Add to my basket", next: "manchego" }],
        },
        {
          photo: catalogPhoto("s/i/prd_4851_17e233ef168b6fed.jpg", "Grandma Singletons Cheddar"),
          text: "*Grandma Singletons Cheddar*\nA mature cheddar from Lancashire. Crumbly and tangy, and perfect with crackers and chutney.",
          buttons: [{ title: "Add to my basket", next: "cheddar" }],
        },
      ],
    },
    nodes: {
      gruyere: [
        {
          text: "Done ✅ The *Kodai Gruyère* is in your basket at Lavelle Road.",
          needs: {
            what: "still in stock at Lavelle Road and the add succeeded",
            else: "out",
            stock: ["kodai-cheese-gruyere-cheese"],
          },
          bot: "the question below goes once per conversation; later taps get “Done ✅ … is in too” and the link",
        },
        weekly(
          "Would you like your cheeses on a regular day, with nothing to remember? We can send your basket here the day before, and one tap confirms it or skips that week.",
        ),
      ],
      manchego: [
        {
          text: "Done ✅ The *Manchego* is in your basket at Lavelle Road.",
          needs: {
            what: "still in stock at Lavelle Road and the add succeeded",
            else: "out",
            stock: ["manchego-cheese"],
          },
          bot: "question once per conversation",
        },
        weekly(
          "Would you like your cheeses on a regular day, with nothing to remember? We can send your basket here the day before, and one tap confirms it or skips that week.",
        ),
      ],
      cheddar: [
        {
          text: "Done ✅ The *Grandma Singletons Cheddar* is in your basket at Lavelle Road.",
          needs: {
            what: "still in stock at Lavelle Road and the add succeeded",
            else: "out",
            stock: ["grandma-singletons-mature-cheddar-cheese"],
          },
          bot: "question once per conversation",
        },
        weekly(
          "Would you like your cheeses on a regular day, with nothing to remember? We can send your basket here the day before, and one tap confirms it or skips that week.",
        ),
      ],
      out: [
        {
          ...basket(
            "We're sorry, you've just missed the *{item}*: it has sold out at Lavelle Road.\n\nThe other two new arrivals are still in, along with the rest of the Cheese Cellar.",
            "See the cheeses",
            "/collections/cheese",
          ),
          bot: "{item} is the card that was tapped; the bot names the two in-stock cards",
        },
      ],
      standing: [standingSet],
      once: [
        {
          ...basket(
            "Of course. Your basket at Lavelle Road is ready whenever you'd like to check out.",
            "Check out",
            "/checkout",
          ),
          bot: "sets standing_declined_until = +30 days",
        },
      ],
    },
  },
  {
    n: 5,
    name: "Day 61–180 · what went wrong?",
    key: "regular-what-went-wrong",
    signal: "Regular Friday basket, stopped two months or more ago",
    category: "Cheese and charcuterie",
    who: "61–180 days away · from Meher Sethi, Head of Guest Experience (a placeholder: the real person in that role signs at launch) · marketing template",
    why: [
      "Asks why in a senior, personal voice (the Head of Guest Experience, writing as “I”), with one gentle welcome-back line and no counting of days, and says what has changed since: the new app, live delivery updates and a better search.",
      "Every answer ends in their Friday basket: busy or a quick app gets a weekly reminder, a missing product goes to the buyers, slot trouble goes into the slot review, pickup gets pickup.",
      "Price is noted and never discounted. Customers won with deep discounts are worth about half as much over time (Lewis 2006).",
      "“I've moved” asks where to, so a regular who moved across town keeps their store, and one who left the city keeps gifting.",
    ],
    gate: [
      "Two or more orders, none for 61+ days, checked at send; no standing-order pitch in the last 30 days; the coldest audience, so a 200-person pilot first, and the rest only if blocks and STOPs stay under 0.3%",
      "Their Friday basket is rebuilt from live stock at tap, never from the old order lines",
    ],
    start: {
      text: "Hi Priya,\n\nI'm Meher Sethi, Head of Guest Experience at FoodStories. It's been a little while since your last Friday basket from Lavelle Road, and we'd love to have you back.\n\nSince then, we've launched the *FoodStories app*, with live delivery updates and a much better search.\n\nIf we got something wrong along the way, I'd truly like to know.",
      footer: "Reply STOP to opt out",
      buttons: [
        { title: "Something went wrong", next: "wrong" },
        { title: "Just been busy", next: "busy" },
        { title: "Other reasons", next: "other" },
      ],
    },
    nodes: {
      wrong: [
        {
          text: "We're so sorry to hear that. Could you tell us what happened?",
          list: {
            button: "Choose one",
            section: "What happened",
            rows: [
              { title: "Wrong or missing item", next: "fix" },
              { title: "Late or missed slot", next: "fix" },
              { title: "Item wasn't fresh", next: "fix" },
              { title: "Something else", next: "fix" },
            ],
          },
        },
      ],
      fix: putRight(basket("Your Friday basket is here whenever you'd like it, with today's stock and prices.")),
      busy: [
        weekly(
          "Completely understandable. To make Fridays easier, we can send your basket here the day before, and one tap confirms it or skips that week. You can pause any time.",
        ),
      ],
      other: [
        {
          text: "Certainly. Which of these comes closest?",
          list: {
            button: "Choose one",
            section: "Reasons",
            rows: [
              { title: "I use a quick app now", next: "quick" },
              { title: "Couldn't find something", next: "product" },
              { title: "Delivery slots", next: "slot" },
              { title: "Prices", next: "price" },
              { title: "I've moved", next: "moved" },
              { title: "Something else", next: "else" },
            ],
          },
        },
      ],
      quick: [
        weekly(
          "That makes good sense for everyday things. For the cheeses, breads and finds a quick app doesn't carry, we can send your Friday basket here the day before, and one tap confirms it or skips that week.",
        ),
      ],
      standing: [standingSet],
      once: [
        {
          ...basket(
            "Of course. Your Friday basket is ready with today's stock and prices, whenever you'd like to check out.",
            "Check out",
            "/checkout",
          ),
          bot: "sets standing_declined_until = +30 days",
        },
      ],
      product: [
        {
          text: "Thank you for telling us. What couldn't you find? Just type it here, and our buyers will see whether they can source it.",
          typed: "sourcing",
        },
      ],
      sourcing: [
        {
          ...basket(
            "Thank you, that's really helpful. Our buyers will see whether they can source it, and reply here within *2 working days*.\n\nIn the meantime, you might enjoy what's new in the Cheese Cellar.",
            "See what's new",
            "/collections/new-in",
          ),
          bot: "raises WA Care Ticket (sourcing, the typed text, never echoed back); the reply uses the care_reply utility template if the window has closed",
        },
      ],
      slot: [
        {
          text: "We're sorry the slots didn't suit you. What got in the way?",
          list: {
            button: "Choose one",
            section: "Delivery",
            rows: [
              { title: "Couldn't get my slot", next: "slotfix" },
              { title: "Delivery came late", next: "slotfix" },
              { title: "I'd rather pick up", next: "pickupfix" },
            ],
          },
        },
      ],
      slotfix: [
        {
          ...basket(
            "Thank you, that goes straight into our slot review.\n\nYour Friday basket is here whenever you're ready, and you can choose any open slot at checkout or collect it from Lavelle Road.",
          ),
          bot: "raises WA Slot Feedback (reason) for the ops review",
        },
      ],
      pickupfix: [
        {
          ...basket(
            "With pleasure. Choose *Collect from Lavelle Road* at checkout, and we'll message you here when it's packed.\n\nYour Friday basket is ready whenever you are.",
            "Collect from store",
            "/basket?pickup=1",
          ),
          bot: "the packed message is the existing order-ready utility template (confirm with ops)",
        },
      ],
      price: [
        {
          ...basket(
            "Thank you for being candid. It's noted, and we won't push. 🙏\n\nIf a smaller basket suits you better, your Friday favourites are here whenever you'd like them.",
          ),
          bot: "sets marketing_cadence = light: festive and monthly messages only",
        },
      ],
      moved: [
        {
          text: "Thank you for letting us know. We deliver across Delhi, Gurugram, Mumbai, Bengaluru and Hyderabad. Is your new home in one of these cities?",
          buttons: [
            { title: "Yes, one of those", next: "city" },
            { title: "Somewhere else", next: "gone" },
          ],
        },
      ],
      city: [
        {
          text: "Wonderful. Which city are you in now?",
          list: {
            button: "Choose a city",
            section: "Our cities",
            rows: [
              { title: "Delhi", next: "newstore" },
              { title: "Gurugram", next: "newstore" },
              { title: "Mumbai", next: "newstore" },
              { title: "Bengaluru", next: "newstore" },
              { title: "Hyderabad", next: "newstore" },
            ],
          },
        },
      ],
      newstore: [
        {
          ...basket(
            "*{choice}* it is ✅\n\nYour basket is saved, and at checkout our website will pick the store nearest your new address.",
          ),
          bot: "updates city and store on the profile, so every later message comes from the right store",
        },
      ],
      gone: [
        {
          ...basket(
            "Understood, Priya, and all the best in your new city. We'll stop the messages from Lavelle Road.\n\nShould you ever wish to send a hamper to someone in one of our cities, they're all here.",
            "See the hampers",
            "/collections/gifting",
          ),
          bot: "sets marketing_cadence = gifting_only; store messages stop",
        },
      ],
      else: [{ text: "We'd love to hear it in your own words. A real person reads every reply.", typed: "noted" }],
      noted: [
        {
          ...basket(
            `Thank you for sharing this. Customer care will reply ${CARE_BY}, here or by phone. 🙏\n\nYour Friday basket is here whenever you'd like it.`,
          ),
          bot: TICKET,
        },
      ],
    },
  },
  {
    n: 5,
    name: "Day 61–180 · their usual day",
    key: "regular-usual-day",
    signal: "Regular whose Saturday sourdough was the first thing to leave their basket",
    category: "Bakery and dairy",
    who: "61–180 days away · from their store · marketing template",
    why: [
      "For bakery, the message that answers why they left is their usual day and slot (deck, slide 6).",
      "Offers a weekly reminder straight away, because regulars stay mainly for the convenience.",
      "“By 9” is a slot with capacity, so sends per store are capped at it, and a full slot gets the next ones instead of a dead end.",
    ],
    gate: [
      "Bandra's Saturday 7–9 am slot has capacity; sends per store are capped at three times it (the “full” fallback carries the rest), and live weekly reminders at capacity minus 20%",
      "Sent Wednesday or Thursday, so “this Saturday” is unambiguous and before the bakery cut-off",
    ],
    start: {
      text: "Hi Rahul,\n\nIt's been a little while since your last Saturday sourdough, and our bakers at Bandra would love to bake for you again. 🍞\n\nYour *Country sourdough* comes out of the oven from 7 am, and we can have it at your door by *9 am* this Saturday. Shall we make it a Saturday ritual again?",
      footer: "FoodStories Bandra · Reply STOP to opt out",
      buttons: [
        { title: "Every Saturday", next: "standing" },
        { title: "This Saturday only", next: "once" },
        { title: "No, thanks", next: "bye" },
      ],
    },
    nodes: {
      standing: [
        {
          ...basket(
            "Wonderful, every Saturday it is ✅\n\nEach Friday, we'll send your sourdough here: one tap to confirm, or skip that week. Nothing arrives unless you confirm.\n\nThis Saturday's loaf is ready to confirm whenever you are.",
            "Confirm Saturday",
            "/checkout",
          ),
          bot: REMINDER,
        },
      ],
      once: [
        {
          ...basket(
            "With pleasure, this Saturday it is. Once you confirm and pay, your sourdough will be at your door by *9 am*.",
            "Confirm and pay",
            "/checkout",
          ),
          needs: { what: "the Saturday 7–9 am slot at Bandra still has capacity", else: "full" },
          bot: "passes the slot id in the link",
        },
      ],
      full: [
        slotList(
          "We're sorry, Saturday's early slot at Bandra is full this week, but your sourdough can come at any of these times:",
          "From Bandra",
          [
            { title: "Saturday, 9–10 am", next: "pay" },
            { title: "Saturday, 10–11 am", next: "pay" },
            { title: "Sunday, 8–9 am", next: "pay" },
          ],
        ),
      ],
      pay: [
        slotOpen(
          "*{choice}* is open ✅\n\nIt's already selected for you at checkout, and it's yours once you confirm and pay.",
        ),
      ],
      slotgone: slotGone("Bandra", "pay"),
      bye: [
        {
          ...basket("Of course, Rahul. Your usual basket is here whenever you'd like it."),
          bot: "sets wa_snooze_until = +45 days",
        },
      ],
    },
  },
  {
    n: 5,
    name: "Festive hosting",
    key: "regular-diwali-hosting",
    signal: "Regular whose orders show a hosting pattern: large baskets before festivals",
    category: "Cheese and charcuterie",
    who: "Christmas and New Year window, from 10 Dec · from their store · tested against “what changed” · marketing template",
    why: [
      "Gives quiet regulars a reason that fits the season: hosting, built from what they used to buy for it.",
      "Leads with the practical part, a delivery slot before the party, and the platters that come ready to serve.",
      "Uses the Delhi voice, “your table”. The deck tests this against a “what changed” message.",
      "A slot is never “held” in the chat unless the site can really hold it: the honest version says to choose it while it's open.",
    ],
    gate: [
      "Their usual cheeses and bakes are in stock at Vasant Kunj at send; otherwise the line reads “the Cheese Cellar at Vasant Kunj is stocked for the season”",
      "Sent 10–22 Dec only; slots before Christmas Eve and New Year's Eve have capacity; this flow outranks new arrivals in the caps",
    ],
    start: {
      photo: catalogPhoto("g/i/prd_11888_f740b73de8a1dec3.jpg", "a cheese platter laid for guests"),
      text: "Hi Tanvi,\n\nHosting this Christmas or New Year's Eve? Your usual cheeses and bakes are in at Vasant Kunj, and our cheese platters arrive ready to serve, from *₹2,500*. 🎄\n\nIt's been a little while since your last order, and we'd love to help set your table again. Shall we find you a delivery day before the party?",
      footer: "FoodStories Vasant Kunj · Reply STOP to opt out",
      buttons: [
        { title: "Pick a delivery day", next: "plan" },
        { title: "Show me platters", next: "platters" },
        { title: "Not this year", next: "no" },
      ],
    },
    nodes: {
      plan: [
        {
          text: "With pleasure. Which day would suit you best for delivery?",
          needs: { what: "at least one day before Christmas Eve or New Year's Eve still has open slots", else: "late" },
          bot: "rows from the slot service: only days still open; deliveries on 25 Dec and 1 Jan need ops sign-off",
          list: {
            button: "Choose a day",
            section: "Before the parties",
            rows: [
              { title: "Thu, 24 Dec", description: "Christmas Eve", next: "day" },
              { title: "Wed, 30 Dec", next: "day" },
              { title: "Thu, 31 Dec, by noon", description: "New Year's Eve", next: "day" },
            ],
          },
        },
      ],
      day: [
        {
          ...basket(
            "*{choice}* it is. 🎄\n\nSlots that week tend to fill a few days ahead, so do choose that day's slot at checkout while it's open.",
            "Build my order",
            "/checkout",
          ),
          bot: "if a slot-hold API exists, hold it for 48 hours keyed by phone and say “held until …”; otherwise this honest copy",
        },
      ],
      late: [
        basket(
          "We're sorry, our delivery slots before the holidays are now full. Pickup from Vasant Kunj stays open right up to New Year's Eve, and you can choose it at checkout.",
          "Build my order",
          "/checkout?pickup=1",
        ),
      ],
      platters: [
        {
          ...basket(
            "Our cheese platters run from *₹2,500* to *₹6,150*, built in store and ready to serve. 🧀\n\nThey just need ordering a day ahead.",
            "See the platters",
            "/collections/platters",
          ),
          bot: "prices re-read at tap",
        },
      ],
      no: [
        {
          ...basket(
            "Of course, Tanvi. Your usual cheeses and bakes are here whenever you'd like them.\n\nSeason's greetings from all of us at FoodStories. 🎄",
          ),
          bot: "sets gifting_declined_until = 2 Jan and wa_snooze_until = +45 days",
        },
      ],
    },
  },
];
