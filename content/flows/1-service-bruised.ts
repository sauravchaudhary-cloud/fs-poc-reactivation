// 1 · Service-bruised: built on the signals CleverTap has (cancellation_reason, delivery failed).
// We never know the detail, so the message owns only what we know and lets the customer tell us the rest.
import type { Flow } from "../../lib/bot.ts";
import { basket, slots, slotOpen, slotGone, CARE_BY, TICKET, CLOSEST, ROWS } from "./shared.ts";

export const serviceBruised: Flow[] = [
  {
    n: 1,
    name: "Cancelled it themselves",
    key: "bruised-cancelled",
    signal: "Order Cancelled, cancellation_reason “User Initiated” (about 150 in the last 30 days)",
    category: "Fruits and vegetables",
    who: "Day 31 after the cancellation · from their store · utility template",
    why: [
      "They cancelled it, so we can't know whether anything went wrong. The message asks rather than apologising for something we may not have done.",
      "Each answer leads to a basket: a slot that suits, or what's fresh this week in the category they buy most.",
      "“Changed my mind” moves them to their usual segment, with no more service messages. “Out of stock” checks the lines of the order they cancelled, and “price changed” goes to care.",
    ],
    gate: [
      "Cancellation reason = User Initiated, and no order since (checked at send: cancel-and-reorder the same day is common)",
      "Submitted as a utility template, with a marketing twin (STOP footer) approved in case Meta reclassifies it; opt-out respected either way; order date is a variable",
    ],
    start: {
      text: "Hi Rhea,\n\nWe wanted to check in about your *14 Sept* order from Lavelle Road, which you cancelled before delivery. We hope all is well.\n\nIf anything on our side got in the way, we'd be grateful to know, so we can look after you better. Would you tell us what happened?",
      footer: "FoodStories Lavelle Road",
      buttons: [
        { title: "I changed my mind", next: "mind" },
        { title: "The slot didn't suit me", next: "slot" },
        { title: "Something went wrong", next: "wrong" },
      ],
    },
    nodes: {
      mind: [
        {
          ...basket(
            "Of course, Rhea, and thank you for letting us know.\n\n*Hass avocados* and *seedless grapes* are in at Lavelle Road this week, picked for ripeness. Shall we add some to your basket? 🥑",
            "Add to my basket",
            "/basket?add=avocados,grapes",
          ),
          bot: "the two items are the two newest in-stock lines in their favourite category at tap; records segment_exit = service, so the usual segment takes over and no more service messages go",
        },
      ],
      slot: [
        slots(
          "Sorry the timing didn't work for you. Here are the next open times from Lavelle Road, or you're welcome to collect from the store:",
          "pay",
          { title: "Pick up at Lavelle Road", description: "Ready from 11 am tomorrow", next: "pickup" },
        ),
      ],
      pay: [
        slotOpen(
          "*{choice}* is open ✅\n\nAdd what you'd like to your basket, and the slot is yours once you pay.",
          "Open my basket",
        ),
      ],
      slotgone: slotGone("Lavelle Road", "pay"),
      pickup: [
        {
          ...basket(
            "With pleasure. Fill your basket and choose pickup at checkout, and we'll message you as soon as it's packed at Lavelle Road.",
            "Open my basket",
            "/basket?pickup=1",
          ),
          bot: "the packed message is the existing order-ready utility template",
        },
      ],
      wrong: [
        {
          text: "We'd like to put it right. Would you tell us what went wrong?",
          list: {
            button: "Choose one",
            section: "What happened",
            rows: [
              { title: "Items were out of stock", next: "stock" },
              { title: "The wait was too long", next: "slow" },
              { title: "The price changed", next: "price" },
              { title: "The app or site failed", next: "tell" },
              { title: "Something else", next: "tell" },
            ],
          },
        },
      ],
      stock: [
        {
          ...basket(
            "We're sorry those items weren't available. 🙏\n\nEverything from that order is in stock at Lavelle Road now, ready to add to your basket whenever you like.",
            "Add to my basket",
            "/basket?from=order",
          ),
          needs: { what: "every line of the cancelled order is in stock at Lavelle Road", else: "stock_short" },
          bot: "reads the cancelled order's lines and checks stock",
        },
      ],
      stock_short: [
        {
          ...basket(
            "We're sorry those items weren't available. 🙏\n\nMost of that order is in stock at Lavelle Road now. One item isn't, so we've put the closest match in its place for you to look over.",
            "Add to my basket",
            "/basket?from=order",
          ),
          bot: "names what's out and " + CLOSEST,
        },
      ],
      slow: [
        basket(
          "Sorry about the wait. 🙏\n\nFrom Lavelle Road, we now deliver in *60 minutes* to most addresses, and you can choose your exact slot at checkout. Your basket is ready whenever you are.",
        ),
      ],
      price: [
        {
          text: `Thank you for telling us. The price in your basket should always be the price you pay.\n\nCustomer care will look into it and call you ${CARE_BY}, and we'll pause all other messages until it's sorted. 🙏`,
          bot: TICKET,
        },
        basket("Your basket is here whenever you're ready."),
      ],
      tell: [
        {
          text: `We're sorry for the trouble. Please tell us what happened, in your own words.\n\nCustomer care reads every message and will reply ${CARE_BY}, here or by phone.`,
          typed: "noted",
          bot: "the typed reply raises the ticket (next node)",
        },
      ],
      noted: [
        {
          ...basket(
            "Thank you, Rhea. Customer care has your message and will reply personally. 🙏\n\nYour basket is here in the meantime, whenever you'd like it.",
          ),
          bot: TICKET,
        },
      ],
    },
  },
  {
    n: 1,
    name: "Payment didn't go through",
    key: "bruised-payment",
    signal: "Order Cancelled, cancellation_reason “Payment Failure Initiated” (about 1,100), and no order since",
    category: "Their saved basket",
    who: "Day 31 after the failed payment · from their store · marketing template",
    why: [
      "The biggest group by far, and usually a bank or UPI hiccup, so there's no heavy apology, just a straight line about their money and the basket they were buying.",
      "Send it only to people who didn't order again afterwards. Many payment failures are followed by a successful retry.",
      "Never asks for card or UPI details in the chat. Money questions go straight to customer care, with the order number already on the ticket.",
    ],
    gate: [
      "Cancellation reason = Payment Failure, no order since, and any refund is settled or older than 7 working days",
      "Order number and date are template variables; the order number is what stops this reading like phishing",
    ],
    start: {
      text: "Hi Kabir,\n\nThe payment for your order *#FS-48213* on *14 Sept* didn't go through, so the order was cancelled.\n\nIf any money left your account, it should be back with you by now. If it isn't, tap below and we'll chase it for you.\n\nWe'd love to welcome you back whenever suits you. Would you like to place the order again?",
      footer: "FoodStories Bandra · Reply STOP to opt out",
      buttons: [
        { title: "Place it again", next: "again" },
        { title: "My money isn't back", next: "money" },
        { title: "Not now", next: "later" },
      ],
    },
    nodes: {
      again: [
        {
          ...basket(
            "Done ✅ Your order from *14 Sept* is back in your basket at FoodStories Bandra, with today's stock and prices.\n\nChoose a slot that suits you and pay online whenever you're ready.",
            "Open my basket",
            "/basket?from=order",
          ),
          needs: { what: "every line of that order is still stocked at Bandra", else: "again_short" },
          bot: "rebuilds the basket from the cancelled order with live stock",
        },
      ],
      again_short: [
        {
          ...basket(
            "Done ✅ Most of your order from *14 Sept* is back in your basket at FoodStories Bandra, with today's stock and prices.\n\nOne item is out of stock, so we've put the closest match in its place for you to look over. Choose a slot and pay online whenever you're ready.",
            "Open my basket",
            "/basket?from=order",
          ),
          bot: "names what's out and " + CLOSEST,
        },
      ],
      money: [
        {
          ...basket(
            `We're sorry for the worry. Customer care will check the payment for order *#FS-48213* and get back to you ${CARE_BY}, here or by phone. 🙏\n\nPlease don't share card numbers, UPI PINs or OTPs in this chat. Your basket stays saved in the meantime.`,
          ),
          bot: "raises WA Care Ticket (order id, payment reference) so care doesn't have to ask; sets care_hold_until = +7 days",
        },
      ],
      later: [
        {
          ...basket("Of course, Kabir. Your basket stays saved, and it's here whenever you'd like it."),
          bot: "sets wa_snooze_until = +30 days",
        },
      ],
    },
  },
  {
    n: 1,
    name: "Delivery failed",
    key: "bruised-delivery",
    signal: "Order Delivery Failed (254 in the last 30 days)",
    category: "Their last order",
    who: "Day 31 after the failed delivery · from their store · utility template",
    why: [
      "We don't know whose side it went wrong on, so the message blames no one and lets the customer tell us.",
      "Says the order was refunded before asking anything, because otherwise the first reply is “where's my money?”.",
      "Each answer gets its own fix: an apology and a ticket if nobody came, an easier slot if they weren't home, and the map pin if the address was the problem (app reviews mention a broken pin).",
      "Every answer ends with their order back in the basket, with today's stock and prices.",
    ],
    gate: [
      "Delivery Failed, no order since, and the order was refunded in full (refund date is a template variable); unrefunded orders go to customer care, never to this template",
      "Utility template; order date and store are variables",
    ],
    start: {
      text: "Hi Farhan,\n\nYour order from Banjara Hills was refunded in full on *22 Sept*, after the delivery on *19 Sept* didn't reach you. We're sorry for the trouble. 🙏\n\nWould you tell us what happened? It helps us look after you properly next time.",
      footer: "FoodStories Banjara Hills",
      buttons: [
        { title: "I was home, nobody came", next: "nobody" },
        { title: "I wasn't home", next: "away" },
        { title: "Trouble with the address", next: "address" },
      ],
    },
    nodes: {
      nobody: [
        {
          text: "Then that was our fault, and we're truly sorry. 🙏\n\nYour order is back in your basket with today's stock and prices, and we'll message you the moment it leaves the store.",
          bot: "raises WA Care Ticket (delivery failed, our side) so ops checks the rider log; rebuilds the basket from the order with live stock; the “on its way” message is the existing dispatch template; flag for sign-off whether a redelivery-fee waiver is allowed",
        },
        slots("When would you like it delivered?", "booked"),
      ],
      away: [
        {
          ...slots(
            "Not to worry, these things happen. Your order is back in your basket with today's stock and prices.\n\nWhich time would suit you better? You can also collect it from the store.",
            "booked",
            { title: "Pick up at Banjara Hills", description: "Ready from 11 am tomorrow", next: "pickup" },
          ),
          bot: "rebuilds the basket from the order with live stock; " + ROWS,
        },
      ],
      address: [
        {
          ...basket(
            "Thank you for telling us. Let's make sure we find you next time.\n\nYour order is back in your basket with today's stock and prices. Please check the address and map pin at checkout, and our Banjara Hills store will call to confirm the pin before your order leaves.",
            "Open my basket",
            "/basket?from=order",
          ),
          bot: "sets address_check, so the store calls to confirm the pin before the next dispatch; rebuilds the basket",
        },
      ],
      booked: [
        slotOpen(
          "*{choice}* is open ✅\n\nYour basket is ready with that time selected, and the slot is yours once you pay online.",
          "Open my basket",
        ),
      ],
      slotgone: slotGone("Banjara Hills", "booked"),
      pickup: [
        {
          ...basket(
            "With pleasure, Farhan. Choose pickup at checkout, and we'll message you as soon as your order is packed at Banjara Hills.",
            "Open my basket",
            "/basket?pickup=1",
          ),
          bot: "the packed message is the existing order-ready utility template",
        },
      ],
    },
  },
];
