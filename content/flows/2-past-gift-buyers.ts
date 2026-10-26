// 2 · Past gift buyers: bought a hamper before, browsing gifts, or corporate; what they gifted or looked at decides the message
import type { Flow } from "../../lib/bot.ts";
import { basket, CONCIERGE_BY, festiveEdit, HAMPER_ROWS, CUTOFF, CALLBACK, EMAIL_TYPED } from "./shared.ts";

export const pastGiftBuyers: Flow[] = [
  {
    n: 2,
    name: "Bought a gift hamper at least once",
    key: "gift-diwali-list",
    signal: "Bought gift hampers at least once; most recently 8, last Diwali",
    category: "Hampers",
    who: "21 days before Diwali · from their store · marketing template",
    why: [
      "Anyone who has ever bought a gift hamper, however long ago. The template names their last gift order, so “last Diwali” reads “at Diwali 2023” for someone who last gifted then.",
      "Easy beats exciting: their last list in one tap, with a firm date to order by (CEB/HBR; Shu & Gneezy 2010).",
      "Recipients' names and addresses never appear in the chat, and neither does a typed email: the one on file is offered first.",
      "Corporate orders go to the gifting concierge FoodStories already runs, and even that path ends with the Festive Edit to browse.",
      "Before Christmas the same conversation goes from the season's collection, worded as “season's greetings” (it suits clients and colleagues as well as family), with no alcohol, which WhatsApp doesn't allow promoting in India.",
    ],
    gate: [
      "A gift-hamper order of their own on file, from any year; a company's orders through the concierge get “Corporate gifting” instead",
      "At least 2 distinct ship-to addresses on their last gift order; otherwise the template goes without “Start from my list”",
      "Sent at least 3 days before the occasion's order-by date (Dhanteras for Diwali, 18 Dec for Christmas), and the gift-list page is live",
    ],
    start: {
      photo: { emoji: "🎁", alt: "this year's Festive Edit" },
      text: "Hi Neha,\n\nLast Diwali you sent *8 hampers* from our Velvet Ribbon collection. It's been a little while since your last order, and we'd love to help with your gifting again this Diwali. 🪔\n\nShall we start from the same list? Order by *Mon, 2 Nov*, and every hamper arrives before Dhanteras with a gift note from you.",
      footer: "FoodStories Vasant Kunj · Reply STOP to opt out",
      buttons: [
        { title: "Start from my list", next: "list" },
        { title: "See the Festive Edit", next: "edit" },
        { title: "Corporate gifting", next: "corporate" },
      ],
    },
    nodes: {
      list: [
        {
          text: "Perfect. Your list from last Diwali is ready, with all *8 recipients* and their addresses saved.\n\nNames and addresses stay on the website, never in this chat. Where would you like to begin?",
          needs: { what: "the last gift order's recipients are on file (2 or more addresses)", else: "nolist" },
          buttons: [
            { title: "Choose a hamper", next: "edit" },
            { title: "Edit recipients", next: "recipients" },
            { title: "Gifts for home staff", next: "staff" },
          ],
        },
      ],
      nolist: [
        basket(
          "Your gift list opens with last Diwali's *8 hampers* ready for you.\n\nJust add each recipient's address there, and every hamper can carry a note from you.",
          "Open my gift list",
          "/gift-list",
        ),
      ],
      edit: [
        {
          text: "With pleasure. Here is this year's *Festive Edit*, with something for everyone on your list.",
          bot: HAMPER_ROWS,
          list: {
            button: "View hampers",
            section: "Festive Edit 2026",
            rows: [
              ...festiveEdit("picked"),
              { title: "Gifts for home staff", description: "Shareable boxes from the same shelves", next: "staff" },
            ],
          },
        },
      ],
      picked: [
        {
          ...basket(
            "Beautiful choice, *{choice}* it is. 🎁\n\nOn your gift list, choose who it's for and when it should arrive, in time for Dhanteras.",
            "Open my gift list",
            "/gift-list",
          ),
          needs: { what: CUTOFF, else: "late" },
        },
      ],
      late: [
        {
          ...basket(
            "Our apologies, that hamper can no longer arrive before Dhanteras. 🙏\n\nThere's still time for delivery before Diwali itself, and your gift list shows every hamper still available.",
            "Open my gift list",
            "/gift-list",
          ),
          bot: "after Diwali itself the link goes to the Cheese Cellar instead",
        },
      ],
      recipients: [
        basket(
          "Of course. Your gift list opens with last Diwali's *8 recipients* already filled in.\n\nAdd, remove or change anyone you like, then choose the delivery dates.",
          "Edit my list",
          "/gift-list?from=2025",
        ),
      ],
      staff: [
        basket(
          "A thoughtful touch. These boxes are for the people who look after your home, packed from the same shelves as your own hampers.\n\nEach can carry a note from you, and they can go on the same gift list.",
          "Add to my list",
          "/collections/staff-boxes",
        ),
      ],
      corporate: [
        {
          text: "Our gifting concierge looks after company and client orders, with one GST invoice, co-branded cards and delivery to every address on your list.\n\nFor delivery before Dhanteras, they'll need your address list by *Wed, 28 Oct*. Shall they call you, or email you a quote?",
          needs: { what: "the 28 Oct list deadline hasn't passed", else: "corp_late" },
          buttons: [
            { title: "Call me", next: "callback" },
            { title: "Email me a quote", next: "email" },
            { title: "Not this year", next: "notyear" },
          ],
        },
      ],
      corp_late: [
        {
          text: "The list date for Dhanteras delivery has passed, but the concierge can still deliver before Diwali for lists that come in this week.\n\nShall they give you a call?",
          buttons: [
            { title: "Call me", next: "callback" },
            { title: "Not this year", next: "notyear" },
          ],
        },
      ],
      callback: [
        {
          ...basket(
            `Done ✅ Our gifting concierge will call you ${CONCIERGE_BY}.\n\nThis year's Festive Edit is here to look through before then.`,
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: CALLBACK,
        },
      ],
      email: [
        {
          text: "Shall we send the quote to *n•••a@gmail.com*, the email on your account?",
          bot: "no email on file: play “typeit” straight away",
          buttons: [
            { title: "Yes, that email", next: "quoted" },
            { title: "Use another email", next: "typeit" },
          ],
        },
      ],
      typeit: [{ text: "Please type the email address you'd like the quote sent to.", typed: "typed_email" }],
      typed_email: [
        {
          ...basket(
            "Thank you. The concierge will send your quote there within one working day.\n\nThis year's Festive Edit is here to look through in the meantime.",
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: EMAIL_TYPED,
        },
      ],
      quoted: [
        {
          ...basket(
            "Wonderful. The concierge will email your quote within one working day.\n\nThis year's Festive Edit is here to look through in the meantime.",
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: "concierge task with the email on file",
        },
      ],
      notyear: [
        {
          ...basket(
            "Of course, Neha. We won't message you about corporate gifting again this season.\n\nYour own gift list is ready whenever you are.",
            "Open my gift list",
            "/gift-list",
          ),
          bot: "sets corporate_gifting_declined_until = 15 Jan; her own gift messages carry on",
        },
      ],
    },
  },
  {
    n: 2,
    name: "Browsed gifts in the last 30 days",
    key: "browse-gifts",
    signal: "Browsed the gift section in the last 30 days: hampers for colleagues, under ₹5,000",
    category: "Hampers",
    who: "After the 72 hours the cart journeys own · from their store · marketing template",
    why: [
      "Hampers in their price band and for the kind of recipient they looked at, with the date to order by.",
      "Ten or more goes to the gifting concierge, because the website takes at most ten hampers in one order.",
      "Nothing in the list sits above the band they looked at, and perishable platters say they're same-city only.",
    ],
    gate: [
      "Viewed the gift section in the last 30 days and has never bought a gift hamper; anyone who has gets “Bought a gift hamper at least once” instead",
      "Sent at least 2 days before the Dhanteras order-by date; rows are hampers in the band from the live catalogue (never above ₹5,000), perishables only for same-city delivery",
      "“For colleagues” only when the gift pages viewed say so; otherwise just “Diwali hampers under ₹5,000”",
    ],
    start: {
      photo: { emoji: "🎁", alt: "hampers under ₹5,000" },
      text: "Hi Vivek,\n\nOur Diwali hampers for colleagues are here, all under *₹5,000* and each with a gift note from you. 🎁\n\nIt's been a little while since your last order, and we'd be glad to take this year's gifting off your hands. Order by *Mon, 2 Nov* for delivery before Dhanteras.",
      footer: "FoodStories Vasant Kunj · Reply STOP to opt out",
      buttons: [
        { title: "Show me the hampers", next: "show" },
        { title: "I need 10 or more", next: "bulk" },
        { title: "Not now", next: "later" },
      ],
    },
    nodes: {
      show: [
        {
          text: "With pleasure. Here are this year's hampers under ₹5,000.",
          bot: HAMPER_ROWS,
          list: {
            button: "View hampers",
            section: "Under ₹5,000",
            rows: [
              { title: "The Sweet Reward", description: "₹2,800", next: "picked" },
              { title: "Cheese platters", description: "₹2,500 to ₹4,500 · same-city delivery only", next: "picked" },
            ],
          },
        },
      ],
      picked: [
        {
          ...basket(
            "Lovely, *{choice}* it is. 🎁\n\nOn your gift list, add your recipients, delivery dates and a note for each, all in time for Dhanteras.",
            "Open my gift list",
            "/gift-list",
          ),
          needs: { what: CUTOFF, else: "late" },
        },
      ],
      late: [
        basket(
          "Our apologies, that hamper can no longer arrive before Dhanteras. 🙏\n\nEvery hamper under ₹5,000 that can still arrive before Diwali is here.",
          "See the hampers",
          "/collections/hampers?under=5000",
        ),
      ],
      bulk: [
        {
          text: "Wonderful. For 10 or more hampers, our gifting concierge looks after everything, with one GST invoice and delivery to every address.\n\nShall they give you a call?",
          buttons: [
            { title: "Call me", next: "call" },
            { title: "Not right now", next: "later" },
          ],
        },
      ],
      call: [
        {
          ...basket(
            `Done ✅ Our gifting concierge will call you ${CONCIERGE_BY}.\n\nThe hampers under ₹5,000 are here to look through before then.`,
            "See the hampers",
            "/collections/hampers?under=5000",
          ),
          bot: CALLBACK + "; the task carries the band and “10 or more”",
        },
      ],
      later: [
        {
          ...basket(
            "Of course, Vivek. We won't message you about hampers again this Diwali.\n\nThe hampers under ₹5,000 are here whenever you'd like them.",
            "See the hampers",
            "/collections/hampers?under=5000",
          ),
          bot: "sets gifting_declined_until = 9 Nov (Christmas still allowed)",
        },
      ],
    },
  },
  {
    n: 2,
    name: "Corporate gifting",
    key: "gift-diwali-corporate",
    signal: "Sent 60 hampers to their company through the gifting concierge last Diwali",
    category: "Hampers, corporate",
    who: "21 days before Diwali · from the gifting concierge · marketing template",
    why: [
      "Corporate buyers need the paperwork and the deadline first: one GST invoice, co-branded cards, and when the address list is due.",
      "Address lists come in as a spreadsheet, never typed into the chat, and the bot files them the moment they arrive.",
      "The concierge is FoodStories' existing service for orders over the website's ten-hamper limit, so nothing here sends them to the website to order.",
    ],
    gate: [
      "Last year's concierge order is on file with its invoice details",
      "Sent before the 28 Oct list deadline, and the concierge has capacity to reply within 2 working hours",
    ],
    start: {
      text: "Hi Kunal,\n\nLast Diwali, your company's *60 hampers* came through our gifting concierge, and we'd be delighted to look after your gifting again this year. 🪔\n\nAs before, you'll have one GST invoice, co-branded cards and delivery to every address. For delivery before Dhanteras (Fri, 6 Nov), we'll need the address list by *Wed, 28 Oct*.\n\nShall we set this year's up the same way?",
      footer: "FoodStories Gifting Concierge · Reply STOP to opt out",
      buttons: [
        { title: "Repeat last year's order", next: "repeat" },
        { title: "See this year's range", next: "range" },
        { title: "Call me", next: "call" },
      ],
    },
    nodes: {
      repeat: [
        {
          text: `Wonderful. The concierge will send last year's order here ${CONCIERGE_BY}, priced for this year's hampers, with the invoice details for you to check.\n\nHow would you like to share the address list?`,
          bot: "concierge task: last year's order, repriced; the concierge replies from this number inside the 24-hour window, or with the utility template after it",
          buttons: [
            { title: "Send a sheet here", next: "sheet" },
            { title: "Email me a template", next: "template" },
            { title: "Call me", next: "call" },
          ],
        },
      ],
      sheet: [
        {
          ...basket(
            "Perfect. Please attach the spreadsheet here whenever it's ready, with one row per recipient: name, address and phone.\n\nThe concierge will check every address once it arrives. This year's range is here to look through in the meantime.",
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: "any document or image that arrives while this flow is open plays “received”; media links expire, so the bot downloads at once and attaches the file to the task; a reminder template goes on 26 Oct if no sheet has come",
        },
      ],
      received: [
        {
          ...basket(
            `Thank you, Kunal. Your list has arrived safely ✅\n\nThe concierge will check every address and confirm here ${CONCIERGE_BY}. Nothing more is needed from you for now, and this year's range is here if you'd like a look.`,
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: "attaches the file to the task; sets corporate_sheet_received",
        },
      ],
      template: [
        {
          text: "Of course. Shall we send the address template to *k•••l@acme.in*, the email on your account?",
          bot: "no email on file: play “typeit” straight away",
          buttons: [
            { title: "Yes, that email", next: "emailed" },
            { title: "Use another email", next: "typeit" },
          ],
        },
      ],
      typeit: [{ text: "Please type the email address you'd like us to use.", typed: "typed_email" }],
      typed_email: [
        {
          ...basket(
            `Thank you. The concierge will send the address template there ${CONCIERGE_BY}.\n\nIn the meantime, this year's range is here whenever suits you.`,
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: EMAIL_TYPED,
        },
      ],
      emailed: [
        {
          ...basket(
            `Thank you. The address template will be in your inbox ${CONCIERGE_BY}.\n\nIn the meantime, this year's range is here whenever suits you.`,
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: "concierge task with the email on file",
        },
      ],
      range: [
        {
          text: "With pleasure. Here is this year's *Festive Edit*, and every hamper can carry your company's logo on its card.",
          bot: HAMPER_ROWS,
          list: { button: "View hampers", section: "Festive Edit 2026", rows: festiveEdit("picked") },
        },
      ],
      picked: [
        {
          text: "*{choice}*, a beautiful choice. Roughly how many will you need?",
          list: {
            button: "Choose a number",
            section: "How many hampers",
            rows: [
              { title: "Up to 25", next: "quote" },
              { title: "25 to 50", next: "quote" },
              { title: "50 to 100", next: "quote" },
              { title: "More than 100", next: "quote" },
            ],
          },
        },
      ],
      quote: [
        {
          ...basket(
            `*{choice}* hampers it is ✅\n\nThe concierge will send your quote here ${CONCIERGE_BY}, with delivery dates.`,
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: "keeps the hamper from the previous step in conversation state; concierge task with hamper and quantity band",
        },
      ],
      call: [
        {
          ...basket(
            `Done ✅ The concierge will call you ${CONCIERGE_BY}.\n\nThis year's range is here to look through before then.`,
            "See the Festive Edit",
            "/collections/festive-edit",
          ),
          bot: CALLBACK,
        },
      ],
    },
  },
];
