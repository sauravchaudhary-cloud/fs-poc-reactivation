// The presenter's path through the demo (the Present button at /): one stop a step, each opening a conversation and
// saying what to show. `stress` plays the fallbacks; `type` puts a question in the message box, ready to send.
export type Stop = { flow: string; title: string; say: string; stress?: boolean; type?: string };

export const tour: Stop[] = [
  {
    flow: "bruised-delivery",
    title: "Service first",
    say: "Farhan's last delivery never reached him. The first message confirms his refund and asks what happened, blaming no one. Tap “I was home, nobody came”: customer care gets a ticket, and his order is back in his basket at today's prices.",
  },
  {
    flow: "vip-kept-aside",
    title: "A VIP gets her usual, not a discount",
    say: "Anjali hasn't ordered in 30 days. Instead of a discount, her signature burrata is set aside in her name. Tap “Send it over”: the bot checks Banjara Hills' live stock before it says yes (see the log), and the slot list leads straight to paying.",
  },
  {
    flow: "vip-kept-aside",
    title: "Sold out is never a dead end",
    stress: true,
    say: "Stress test on: this time the burrata sold out before she tapped. Tap “Send it over” again. The bot never promises a restock date: she's just missed it, and the closest cheeses in stock come next.",
  },
  {
    flow: "gift-diwali-list",
    title: "Last season's gift list, in one tap",
    say: "Neha sent 8 hampers last Christmas. She gets her list back for Christmas and New Year, with a firm order-by date. Names and addresses stay on the website, never in the chat, and company orders go to the gifting concierge.",
  },
  {
    flow: "regular-new-arrivals",
    title: "Ask anything",
    type: "What would go well with the Manchego?",
    say: "Anything the buttons don't cover goes to the AI, which answers from FoodStories' live catalogue: real prices and photos, and Add to basket on every card. Press send; the log shows how long the answer took and what it cost, in rupees.",
  },
  {
    flow: "regular-new-arrivals",
    title: "Ask for a discount",
    type: "Can I get a discount if I order today?",
    say: "No discounts, ever. The AI declines politely and stays with the products, and a guardrail stops any reply that offers a deal, a restock date or a price the catalogue didn't give it.",
  },
  {
    flow: "regular-new-arrivals",
    title: "One word to opt out",
    type: "STOP",
    say: "STOP is handled by rules, not the AI: one confirmation, CleverTap is told, and nothing more is sent. Next, the dashboard: CleverTap's export of these replies becomes today's call lists.",
  },
];
