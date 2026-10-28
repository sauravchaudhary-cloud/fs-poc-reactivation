# FoodStories WhatsApp Reactivation Bot: Project Overview

*Written 21 Oct 2026. This document describes the whole project in plain language: what it is, how it's built, what works today, and what is planned. It contains no code. For more detail, see `README.md` (quick start), `BOT.md` (bot and AI set-up, launch dependencies) and `PRESSURE-TEST.md` (every scenario tested).*

---

## 1. What this project is

**FoodStories** is a premium grocery and gourmet food retailer in India. It has physical stores in Delhi NCR, Mumbai, Bengaluru and Hyderabad, and a website, foodstories.shop. Many customers have stopped buying ("inactive" or "lapsed"). A strategy deck, *FoodStories: Reactivating Inactive Customers* (v7), proposes winning them back with personalised WhatsApp conversations.

This repository (`~/projects/v2`) has two parts:

1. **A clickable prototype.** A web page that looks like WhatsApp on a phone and plays all 24 conversations from the deck. Stakeholders can tap through every path, type replies, and see what the bot would do at each step.
2. **The production reply bot, mostly built.** A webhook service between **Gupshup** (the WhatsApp provider) and **CleverTap** (the marketing/CRM platform that sends the templates). It handles every tap and typed reply. An **AI layer** (Claude Haiku 5.5) answers free-text questions using the live product catalogue.

The core principle: **every promise in a message must be true when the customer taps.** Nothing is "kept aside", "in your basket" or "booked" unless a system checks it or does it. Stock is never forecast. Nothing is given away free.

### The sibling spec repo
`~/projects/foodstories-reactivation/` holds the earlier prototype and `PROTOTYPE_SPEC.md`. Section 5 of that file lists the deck's rules: segments, overlays, guardrails, copy lint and category playbooks. v2 keeps the spec's segment order (1 = Service-bruised) except that quiet regulars (5) come before one-time buyers (6), and drops relationship managers.

---

## 2. Business goals and rules

### Goals
- Bring inactive customers back to a **second order**. The deck's headline metric is "real reactivation = a second order within 45 days". CleverTap can't measure this natively, so it needs a weekly export and a small script.
- Do it **without discounts**. Customers won with deep discounts are worth about half as much over time (Lewis 2006).
- Every path ends **one tap from something to buy**: a basket, a product, an aisle or checkout.

### Copy and brand rules (enforced automatically)
- **No stock forecasts.** FoodStories has no inbound-stock forecast. Never say "next batch Thursday", "we'll tell you when it's back" or "reserve from Friday's bake". When something is sold out: "you've just missed it", plus the closest in-stock items from the same category and price band.
- **No surveillance language.** Never "we saw", "we noticed", "you were looking at", "you viewed", "you browsed" or "you searched".
- **Banned words:** "team" (say "customer care") and "tracking".
- **No time words for stock** ("came in this morning", "sold out this afternoon"). The stock feed knows only in or out, never when.
- **No ✅ unless earned.** "Done ✅" appears only when the bot actually did something or checked it first.
- **No echoing typed text** (emails, complaints) back in the bot's words.
- **"Reply STOP" footer** on every marketing template.
- **No alcohol** anywhere (WhatsApp bans alcohol promotion in India). No supplements, infant food or health claims (Meta Commerce Policy, FSSAI).
- **No false urgency** ("only a few left", "today only"), except real, specific scarcity tied to an actual allocation.
- **Slots are never "booked" or "held"** in chat. They are "open now, yours once you pay".
- Everything is at **normal prices**: no free items, codes or cashback.

---

## 3. The six customer segments and 24 conversations

Segments are computed in CleverTap from behaviour. What a customer receives is decided by their **signal** (past behaviour) and their **category** (what they buy most), never by a person.

| # | Segment | Priority | Who |
|---|---|---|---|
| 1 | Service-bruised | P0 | Inactive, and their last order went wrong; day 31–90 after that order |
| 2 | Lapsed VIPs | P0 | A VIP with no purchase in 30+ days |
| 3 | Past gift buyers | P1 | Inactive, and has bought a gift hamper at least once, browsed the gift section in the last 30 days, or ordered corporate gifts; only in the 21 days before an occasion |
| 4 | Inactive, still browsing | P1 | No purchase in 30+ days, but visited the app or site in the last 30 days |
| 5 | Quiet regulars | P1 | 2+ orders, no purchase and no visit in 30+ days |
| 6 | One-time buyers | P2 | Bought once, nothing since, no recent visit |

### All 24 flows

Each flow has a **stable key** that never changes once a template has gone out, because every button payload carries it.

**Segment 1: Service-bruised**
| Flow | Key | Trigger and idea |
|---|---|---|
| Cancelled it themselves | `bruised-cancelled` | Asks rather than apologises. "I changed my mind" moves them back to their usual segment. Utility template with a marketing twin. |
| Payment didn't go through | `bruised-payment` | The biggest group (~1,100). Includes the order number so it doesn't read like phishing. "My money isn't back" goes to care. Never asks for card or UPI details. |
| Delivery failed | `bruised-delivery` | States the refund first. Blames no one. Fixes by cause: nobody came (ticket), not home (easier slot), address trouble (map pin). |

**Segment 2: Lapsed VIPs**
| Flow | Key | Trigger and idea |
|---|---|---|
| Day 30 · their usual, kept aside | `vip-kept-aside` | Signature item (burrata) set aside under their name until a deadline. Send it, pick it up, or decline. A pre-send job allocates stock per store, sends are capped at 30% of stock, and untapped holds are released at 8 pm. The store gets a POS hold list. |
| Day 60 · first pick of a new drop | `vip-new-drop` | First pick of a small-batch single-origin coffee before it reaches the shelf. At most one coffee drop a month. |
| Day 64 · their usual, ready to go | `vip-usual-basket` | Usual Saturday basket rebuilt from 6 months of orders. Only in-stock items are named; the message is skipped if fewer than 3 survive. |
| Day 70 · festive hampers, two days early | `vip-diwali-early` | Early access to the season's hampers (Christmas and New Year in the demo), "same as last year" in one tap. Falls back to a concierge call if last year's list can't be rebuilt. |

**Segment 3: Past gift buyers**
| Flow | Key | Trigger and idea |
|---|---|---|
| Bought a gift hamper at least once | `gift-diwali-list` | Anyone who has ever bought a gift hamper, in any year. Start from their last gift list for the next occasion that can still be delivered (Christmas and New Year in the demo; Diwali when the calendar allows), with a firm order-by date. Names and addresses never appear in chat. The email on file is offered first. Worded as "season's greetings", with no alcohol. |
| Browsed gifts in the last 30 days | `browse-gifts` | Viewed the gift section but never bought a hamper (buyers get the flow above). Hampers in their price band. 10 or more go to the concierge, because the site caps orders at 10 hampers. |
| Corporate gifting | `gift-diwali-corporate` | 60-hamper corporate buyer, handled by the gifting concierge: GST invoice, co-branded cards, address list due by a deadline (11 Dec for Christmas delivery in the demo). The spreadsheet arrives as a document and the bot files it (`received` node). |

**Segment 4: Inactive, still browsing** (sent only after the 72 hours the cart journeys own)
| Flow | Key | Trigger and idea |
|---|---|---|
| Reached checkout | `browse-checkout` | Blocked at checkout by a full slot. Offers 60-minute delivery or pickup. The variant depends on the blocker. |
| Left items in a cart | `browse-cart` | Names the cart items and the next open slot. Sent before 2 pm. |
| Viewed a product | `browse-product` | Product as news, plus one pairing (diet-guarded). "Add both" says Done only if both adds succeed. |
| Viewed, but sold out | `browse-sold-out` | Cross-sell: it's sold out, here's what's at the counter (never "you just missed it", which reads as blame to someone who looked while it was already out). "Tell me if it's back" appears only if a stock feed can trigger it. |
| Searched, not stocked | `browse-search` | Only for terms the buyers have mapped to an aisle and closest items. No sourcing promise. |
| Browsed a category | `browse-category` | Carousel of three newest in-stock picks. A three-button fallback covers old clients. |
| Home page only | `browse-home` | The weakest signal: what's new in their top category. "Not now" adds nothing. |

**Segment 5: Quiet regulars**
| Flow | Key | Trigger and idea |
|---|---|---|
| Day 31–60 · new arrivals | `regular-new-arrivals` | Carousel of the newest Cheese Cellar arrivals. A standing-order pitch comes only after interest, and only once. |
| Day 61–180 · what went wrong? | `regular-what-went-wrong` | A senior, personal voice (the Head of Guest Experience) asks why, and says what's changed (new app, live delivery updates). Branches: wrong, busy, moved (city list leads to a store switch or gifting only), price (noted, never discounted). 200-person pilot first. |
| Day 61–180 · their usual day | `regular-usual-day` | A gentle welcome-back from the bakers, then their Saturday sourdough at the door by 9. Offers a weekly reminder. Sends are capped at 3× slot capacity. |
| Festive hosting | `regular-diwali-hosting` | A hosting pattern before festivals: platters and a delivery day before Christmas Eve or New Year's Eve. Tested against "what changed". |

**Segment 6: One-time buyers**
| Flow | Key | Trigger and idea |
|---|---|---|
| Day 31 · feedback first | `once-feedback-first` | From "Meher Sethi, Head of Guest Experience" (a fictional placeholder; the real person in that role signs at launch): "How was your first order?" Utility template. Each reply gets a real answer; complaints go to care. |
| Day 31 · basket first | `once-basket-first` | The other arm of the A/B test: a second basket first, then feedback. Marketing template. |
| After the feast | `once-after-feast` | The week after Diwali (9–15 Nov): a light, fresh basket. Also goes to quiet regulars. |

### What each flow carries
- **`who`**: when it goes, who it's from (their store, Meher Sethi, the fictional Head of Guest Experience, or the gifting concierge), and whether it's a marketing or utility template.
- **`why`**: presenter notes explaining the copy, with research citations (Aggarwal 2011, Dholakia & Morwitz 2002, Herlocker 2000, Shu & Gneezy 2010, Gallino & Moreno 2014, Dai 2014, Lewis 2006).
- **`gate`**: what CleverTap checks at the moment of sending. Segmentation is days old by then.
- **`start`**: the approved template CleverTap sends.
- **`nodes`**: the session messages each tap leads to.

---

## 4. The flow contract: gate, needs and bot

Three mechanisms keep the copy honest once a real bot runs it:

| Mechanism | When | What it means |
|---|---|---|
| **`gate`** | At send time, checked by CleverTap | Per-flow conditions on top of the global send gates: stock that morning, allocation, deadlines, cart unchanged, and so on |
| **`needs`** | At tap time, checked by the bot | On a node's first message, the bot verifies something (hold still live, item still in stock, slot still open, cut-off not passed). If the check fails, it plays a fallback node instead (`else`): "you just missed it", "that slot just filled", "too late for this occasion" |
| **`bot`** | When a message is sent | The side effect: add to basket, raise a ticket, set a CleverTap profile property, schedule a utility template. Each one is a line of integration work |

### Global send gates (every template)
1. WhatsApp opt-in is on, with a recorded source and date (DPDP). The customer isn't in the control group and isn't on a care hold.
2. No order since segmentation and no open care ticket.
3. **Caps:** at most 2 marketing WhatsApps in 7 days and 3 touches in 21 days. Priority when flows collide: service, then weekly reminder, then hosting, then new arrivals, then after-the-feast. The loser is skipped, not delayed. Nothing on 8 Nov (Diwali). Sending window 09:00–20:00 IST.
4. Every product named is in stock at their store that morning: bakery and produce 10+, cheese 3+, hampers 5+. The stock feed must be under 6 hours old, and the store must be open today and tomorrow.
5. Batches of at most 150 an hour, none after 5 pm, after a **50-person canary** whose replies a person has read.
6. First name on file, else "Hi there". Dates, order numbers and store names are template variables.

### Shared building blocks
- **Basket links:** every path ends in a deep link to the site. The bot sends a basket link only if the basket has at least one in-stock line; otherwise it links the flow's aisle.
- **Slot lists:** example rows in the prototype. In production the bot rebuilds them from the slot service at tap time (next open slots, dated, none started or full). With no open slots, it sends one line with the checkout link.
- **Care hours:** `{care_by}` and `{concierge_by}` are filled from the IST clock. In hours: "within 2 working hours (9 am–8 pm, Mon–Sat)". Outside hours: "by 11 am on Monday". The concierge works 10 am–6 pm.
- **Putting a problem right:** a complaint raises a care ticket, pauses all marketing for 7 days (`care_hold_until`, cleared when the ticket closes), and still ends with "your basket is here whenever you're ready".
- **The "it was okay" branches** are shared by both arms of the one-time-buyer A/B test: faster delivery, more choice, freshness, price, or something else.

### Links
Links deep-link into the site with UTM tags per flow and node (`utm_source=whatsapp`, `utm_campaign=<flow key>`, `utm_content=<node>`). In production the bot appends a **signed, short-lived token** (phone, store, items, slot id). The token can only prefill a basket. It never logs anyone in or pays, because WhatsApp messages get forwarded. **The flows' paths (`/basket`, `/collections/…`, `/orders`, `/checkout`) are placeholders that 404 on the live site.** The AI and the rules already use real pages: `/checkout/cart/`, `/account/orders/`, `/search-results/?query=` and `/category/new-arrivals/`.

---

## 5. Current architecture

### Tech stack
- **Next.js 16.4** (App Router, Cache Components, Turbopack), **React 19.3**, **Tailwind CSS 4**, TypeScript.
- **`@anthropic-ai/sdk`** for Claude, plus a small built-in adapter that runs Gemini through the same interface for free testing.
- No database yet. All bot state is **in memory, per instance**, which is a known limitation (see §9).
- Intended host: Vercel, on the default Node.js runtime.

### System diagram (described)
```
CleverTap ──template (buttons carry a payload)──▶ Gupshup ──▶ customer
customer ──tap / text / photo──▶ Gupshup ──webhook──▶ /api/whatsapp?k=<secret>  (this repo)
                                              ├──▶ Gupshup send API         the node's session messages
                                              ├──▶ CleverTap /1/upload      events (WA Reply, WA Handoff, …)
                                              ├──▶ CleverTap /1/subscribe   STOP, wrong number, START
                                              └──▶ Claude (typed text only)
                                                     ├──▶ api.foodstories.shop/graphql   catalogue, stock per store (public)
                                                     └──▶ FOODSTORIES_API_URL            customer + basket (to be built by FoodStories)
```

### Files and what each does
| File | Role |
|---|---|
| `content/flows/` | **The content.** The six segments and global send gates (`index.ts`), one file per segment with its flows and presenter notes, and the shared message builders (basket, slots, care, issues list) in `shared.ts`. Edit the copy here. |
| `content/replies.ts` | **The bot's own words**: the fixed replies, one-line FAQ answers, the automated-assistant footer, and the messages written from what a tool did (basket add, store move, reminder). |
| `prompts/assistant.ts` | **What the AI reads**: the system prompt, nine tools, and each turn's message, with customer text masked and fenced. |
| `lib/bot.ts` | **Pure logic, shared** by the demo, the webhook and the tests. A flow's types. Button payloads (`<flow key>:<node>:<option>`) and their parsing. The CleverTap profile properties, events and templates the bot may use. Care-hours calculation. Conversion of messages to Gupshup JSON. |
| `lib/read.ts` | Typed-text intent detection, the `read` step, and the rules fallback when the AI is off or fails. |
| `lib/guardrails.ts` | Text normalisation, the products WhatsApp won't carry, and the `vet()` rules for AI replies (also the deck's banned words and forecast regex for the flows). |
| `lib/whatsapp.ts` | **One inbound message, start to finish**: crisis check, consent, rollback mode, tap resolution, typed-text reading, AI call, tap-time checks, sending, CleverTap events. Holds the in-memory state. |
| `lib/ai.ts` | **The AI loop**: the tool loop (max 5 rounds plus one retry), turning each tool call into a reply, and cost tracing. `lib/gemini.ts` is the Gemini adapter for free testing. |
| `lib/store.ts` | **Data access**: live catalogue search per store (Magento GraphQL), basket read, add, and move between stores. Uses FoodStories' endpoint when it exists; until then, a sample basket of three real products priced live. |
| `app/api/whatsapp/route.ts` | **The webhook.** Checks the secret in the URL (403 otherwise), dedupes by message id, answers 200 immediately and does the work afterwards, one phone at a time. Sends through Gupshup, records in CleverTap. `GET` is the health check. |
| `app/api/chat/route.ts` | The demo's endpoint for typed messages: the same AI, with the flow's sample customer. Rate-limited to 60 per visitor IP per hour. |
| `app/page.tsx`, `components/demo/` | **The phone UI**: a WhatsApp-style chat, segment navigation, an "About this conversation" panel with presenter notes and gates, a **Stress test** toggle, and a collapsible message log. |
| `app/dashboard/`, `components/dashboard/`, `lib/dashboard/` | **The reactivation dashboard** at `/dashboard`: the page, its parts (tiles, charts, the customer card), and its data, SQLite store and one server action. |
| `app/layout.tsx`, `globals.css` | Shell. The page is marked `noindex` (shared by link only). |
| `scripts/check-flows.mjs` | Lints the flows: structure, WhatsApp limits, banned words, the forecast regex, the ✅ and promise rules, the date and slot rules, STOP footers, reachability, known property names. |
| `scripts/check-bot.mjs` | Every node converts to valid Gupshup JSON, every payload resolves, typed-text reading, `vet()` probes, the AI loop against a scripted model, and the webhook's full turn against a local stand-in for Claude. Fully offline. |
| `scripts/pressure-ai.mjs` | Live test: about 80 scenarios through the real webhook turn with a real model and the live catalogue. Each scenario has expect, never and not regexes. |
| `BOT.md` | Bot and AI design, set-up, launch dependencies, open questions. |
| `PRESSURE-TEST.md` | Results of three rounds of testing, about 130 flow and bot items plus about 58 AI items, each with a status. |

### How an inbound message is handled (in order)
1. **Webhook:** secret check → parse → ignore receipts and malformed bodies (log failed deliveries) → dedupe by message id → return 200 → process in the background, queued per phone.
2. **Normalise text:** Unicode NFKC folding, invisible and format characters dropped, digits in every script converted to 0–9. "ＳＴＯＰ" with a zero-width space is still STOP.
3. **Crisis** (self-harm in English, Hinglish or Devanagari) outranks everything, STOP included. One caring line in English and Hindi with the **Tele-MANAS 14416** helpline, and a handoff that no ticket cap holds back.
4. **Consent:** STOP and its variants (including "band karo" and Devanagari forms) or "wrong number" → unsubscribe in CleverTap, reply once, add to the opted-out list. START → resubscribe and send "welcome back".
5. **Rollback mode** (`BOT_MODE=handoff`): every message gets the handoff line.
6. **Taps:** the payload resolves the flow, node and option directly, so old buttons work days later. If the payload is lost, a button title stands in, but only within the open flow or for a unique template button. Opted-out phones get one line and nothing from a flow.
7. **Typed text and media** (the `read` step): "who is this?" → legal threat (escalation) → asking for a human → media (the `received` node if the flow expects a document, else a handoff) → the node the last question asked for → the exact title of an open option → a short yes/no as a tap (only on a two-button yes/no whose last button declines) → thanks gets a nod → **everything else goes to the AI.**
8. **AI turn** (if on and under 15 calls per phone per hour). It ends in one of: reply, pick an option, add to basket, change store, set reminder, hand off, or opt out. If the AI fails or breaks a rule, the **rules fallback** answers: a one-line FAQ (order status, dietary, discounts, alcohol, address change), "could you tap one of the options?", a nod, or a handoff.
9. **Node playback:** run the `needs` check (fallback node if it fails) → send the messages → record `WA Reply` in CleverTap. Then send the AI's `also` line and raise any `complaint` ticket.
10. **Caps:** at most 5 care tickets per phone per hour (a crisis is always let through).

### CleverTap integration
- **Events:** WA Reply, WA AI Reply, WA Handoff, WA Opt Out, WA Opt In, WA Wrong Number, WA Escalation, WA Send Failed, WA Callback Requested, WA Care Ticket, WA Slot Feedback, WA Store Change, WA Reminder Set, WA Basket Add.
- **Profile properties** (each with a type and expiry; the check script rejects any other name): `care_hold_until`, `wa_snooze_until`, `standing_declined_until`, `gifting_declined_until`, `corporate_gifting_declined_until`, `marketing_cadence`, `reminder_cadence`, `reminder_day`, `tea_alerts`, `tea_alert_last_sent`, `back_in_stock_alert`, `cart_nudge_suppressed`, `last_coffee_drop_at`, `reserved_until`, `usual_basket_reask_on`, `segment_exit`, `address_check`, `corporate_sheet_received`.
- **Utility templates to get approved:** `weekly_basket`, `care_reply`, `back_in_stock` (only with a stock feed), "running late", the sheet reminder, and a marketing twin of 1.1.
- **Identity:** `+` followed by the phone number, in one function. The scheme is still to be confirmed with a `dryRun=1` upload.
- A goal on `WA Reply` exits the journey.

### Gupshup integration
- Session messages are sent as quick replies (buttons), lists, CTA-URL messages (with an image header for product cards) or text.
- Every button and list row carries `postbackText = <flow key>:<node>:<option>` (under 128 characters).
- A failed send raises `WA Send Failed` with the message index. **Nothing is retried**, because a retry would duplicate messages.

---

## 6. The AI layer

### Purpose
To answer what the rules can't settle: product and stock questions, the basket, a typed answer to a flow's question ("kal shaam ko bhej do"), store changes, reminder changes, complaints.

### Model
- **Production:** Claude Haiku 5.5 (`claude-haiku-5-5`). List price $0.10 / $0.50 per million input/output tokens. About $0.0005–0.001 per typed message with the cached system prompt, so 1,000 typed messages cost under $1. Expected latency is 1–3 seconds per call.
- **Free testing (current):** Gemini through Google's OpenAI-compatible API, tried in order: `gemini-3.5-flash` → `gemini-3.6-flash` → `gemini-3.5-flash-lite`. Several keys from different Google projects can be comma-separated. Each call goes to the first model and key that isn't rate-limited. The free tier gives Flash 20 requests a day (fast, 5–12 s a message) and Flash-Lite 500 a day (slow, about 50 s a message). Google may train on free-tier prompts, so **use synthetic data only**.
- Other options: Vercel AI Gateway (one bill), local llama.cpp with Qwen (plumbing only), OpenRouter free.
- `AI_MODEL` overrides the model. Claude-only fields (prompt caching, effort) are sent only to Claude models.

### Tools (nine)
| Tool | Kind | What it does |
|---|---|---|
| `search_products` | read | Live catalogue search at the customer's store, or another store if asked. Up to 6 results, in-stock first. Restricted products (alcohol, supplements, infant food and similar) are filtered out. |
| `get_basket` | read | The customer's basket: lines, quantity, unit price, in stock or not. |
| `choose_option` | ends turn | Picks an open option from typed text. The bot then plays that node exactly as if tapped. It can carry `also` (an answer to a side question) and `complaint` (a ticket). The flow's own decline is offered when no open option declines. |
| `add_to_basket` | ends turn | Adds 1–10 products, 1–10 of each, **only by product pages FoodStories showed** (never a link the customer typed). The bot writes the confirmation. Anything sold out by then gets "you just missed it" plus the 2 closest in-stock items. |
| `change_store` | ends turn | Moves the customer and basket to another store ("I've moved to Andheri"). The bot says what moved and what that store doesn't sell. The store sticks for the rest of the chat. |
| `set_reminder` | ends turn | Sets or changes the basket reminder's day and cadence (weekly, fortnightly, off). The bot confirms in the tap's words and raises `WA Reminder Set`. **What a tap set, typing can change, without customer care.** |
| `reply` | ends turn | Text, plus up to 4 product cards (photo, name, price, "Take a look" button), plus one link (basket, orders or search). |
| `handoff` | ends turn | To customer care with a one-line summary. Reason `crisis` sends the helpline; `legal` escalates. |
| `opt_out` | ends turn | Unsubscribes, exactly like STOP. |

### What the model sees
The customer's first name, their store, the IST time, the last dozen messages of this chat (kept for a day), the open options, and tool results. **Never the phone number.** Phone, OTP, card, PAN and order numbers, emails and UPI ids are masked before reaching the model (DPDP and SPDI minimisation). The customer's text is fenced, and its angle brackets are escaped so it can't forge system notes.

### Guardrails on output (`vet`)
Every AI reply must pass these checks or it isn't sent. The model gets one retry, told which rule it broke; after that the rules answer. On 28 Oct the prototype stopped blocking copy style (the words "team" and "tracking", label words like "pure" or "organic", care timing like "shortly"), offers that wait on the customer's answer ("tell me the items and I'll check them") and polite Hindi's "करेंगे"; the prompt still asks for all of it, and a launch adds its own guardrails. Blocked:
- watching language ("we noticed", "you viewed")
- stock forecasts or restock dates
- deals (%, free, codes, "on the house", Hindi/Hinglish forms)
- health claims
- false urgency
- alcohol
- claimed or promised actions nobody takes ("I've added", "I'll call", "won't message you", "bhej denge")
- links off foodstories.shop
- any 3+ digit number or rupee amount it wasn't shown (no made-up prices or order numbers)
- replies over 1,000 characters
- leaking the system-prompt marker

Product names from the catalogue are exempt, so "Immunity Boosters" eggs are fine.

### Prompt rules (summary)
- Use tools for every fact.
- Out of stock means "just missed it" plus alternatives as cards.
- No totals.
- No store hours or fees.
- Can't confirm allergens or diets.
- Only FoodStories topics (Meta's 2026 Business terms bar general-purpose AI assistants).
- Reply in the customer's own language and script.
- At most three sentences.
- An open option beats a handoff.

### Disclosure
The first AI answer in each chat carries "*Automated assistant · prices and stock confirmed at checkout*", per Anthropic's usage policy.

### Limits
15 AI answers per phone per hour, then the rules answer. Each call has a 20 s timeout and 1 retry. Media never reaches the AI.

---

## 7. The demo (prototype UI)

- Run `npm run dev` and open http://localhost:3000.
- **Left:** the six segments and their flows, colour-coded per segment.
- **Centre:** a WhatsApp-style phone. Tap buttons, open list sheets, swipe carousels, type messages. The demo clock starts at 10:30 am IST.
- **"About this conversation"** shows the signal, category, who it's from, presenter notes and gates.
- **▶ Present** walks a seven-stop path for a pitch (`content/tour.ts`): each stop opens its conversation, says what to show, and types any question to send. Arrow keys or a clicker move along it; Escape ends it. `/?flow=2.1` (or a flow key) opens one conversation directly; `/?dev` adds the log's Clear logs.
- **Stress test toggle** plays the fallbacks: sold out, slot filled, cut-off passed, and products selling out while the AI adds them. It also shows the bot's notes (yellow) under each message. Without it, a tap-time check that names products (`needs.stock`) reads their stock live from the catalogue at the flow's store, and the log says what it found.
- **Message log (right)** shows, for each tap or message, whether internal logic or the AI handled it, which tools were called, tokens, latency, cost (in rupees, at ₹88 to the dollar), and why it fell back.
- Typed messages go to the real AI when a key is set, and are read by the same rules as production.
- Products, prices and stores are real (foodstories.shop, Oct 2026). People's names are placeholders. Photos are the catalogue's own product images.

---

## 8. Data sources

- **Catalogue:** public Magento 2 GraphQL at `api.foodstories.shop/graphql`, no credentials, scoped by a `Store` header. Store codes come from the site's own `STORE_REGION_ID_MAP`:

| Code | Store |
|---|---|
| `vasantkunj` | Vasant Kunj, New Delhi (default) |
| `hyderabad` | Banjara Hills |
| `bengaluru` | Lavelle Road |
| `gurugram` | Gurugram |
| `mumbai_bandra` | Bandra |
| `mumbai_lokhandwala` | Lokhandwala / Andheri West |

  `mumbai_powai` is in the site's map, but the catalogue errors on it (Oct 2026). Zero-priced articles are skipped. Product photos use the original image path, because Magento's resized `/cache/` copies return 403.
- **Product pages:** `/shop/product/<url_key>/`. **Search:** `/search-results/?query=`. **Categories:** `/category/<slug>/`.
- **Customer and basket:** require an endpoint FoodStories will build (§10). Until then, a **sample basket** of three real products (SKUs 9810, 19838 ×2, 3562), priced and stocked live. Adds and moves are simulated: nothing is written.
- The user (21 Oct 2026) will provide the add-to-cart API. The project assumes it works per the contract.

---

## 9. Current status (as of 21 Oct 2026)

### Working
- All flows written, pressure-tested and rewritten (19 Oct). On 21 Oct past gift buyers were regrouped into bought a gift hamper at least once (any year), browsed gifts in the last 30 days (moved from still browsing) and corporate gifting; Christmas became a note on 3.1, leaving 24 flows. On 27 Oct the segments were renumbered: service-bruised first, quiet regulars before one-time buyers.
- `npm run check` passes: flows lint, Gupshup JSON, payloads, typed-text reading, the `vet` probes, the AI loop and the webhook turn, all offline.
- Webhook fully coded: secret, dedupe, per-phone queue, Gupshup send, CleverTap events and subscribe, health check, rollback mode.
- AI layer coded and pressure-tested (round 3, 20 Oct) on Gemini: about 300 live scenarios, 125 rule probes, 58 `vet` probes. 54 of 55 option picks were right, every price and stock claim matched the catalogue, and no discount, leak or other customer's data appeared in any answered attack.
- AI tools for add-to-basket, change-store and set-reminder, added 21 Oct.
- The demo UI with stress test and message log.

### Not done or known gaps
- **Not yet run on Claude Haiku 5.5.** No Anthropic key exists yet. `npm run pressure` must be run on it before launch (about a cent).
- **Tap-time checks (`needs`) are an empty registry.** Every check passes until the stock, slot and cut-off services exist.
- **State is in memory:** last node per phone, dedupe ids, opted-out list, AI chat history, rate limits, store changes. A redeploy or a second instance loses or diverges it. KV storage is a launch dependency.
- **The flows' site links are placeholders** that 404 on the live site.
- **The basket is a sample**; adds and moves are simulated.
- **Template context:** CleverTap sends the templates, so the bot doesn't know which template a typed reply answers until CleverTap tells it (a journey webhook).
- **Fixed lines are English only** (care timing, disclosure). The AI itself replies in Hindi, Tamil, Bengali and other languages.
- **Messages without a phone number** (WhatsApp usernames / BSUID) are currently ignored.
- **Mumbai stores' stock** may not be on the website. The AI says "on the website" for stores without online stock.

---

## 10. The plan: what's next and how

### A. Integrations FoodStories must build or provide
1. **Customer and basket API** (server to server, bearer key `FOODSTORIES_API_KEY` at `FOODSTORIES_API_URL`):

| Call | Purpose | Returns |
|---|---|---|
| `GET /customers/{phone}` | Look up the customer | name and store; 404 if unknown |
| `GET /customers/{phone}/basket?store=…` | Read the basket | lines (name, quantity, unit price, in stock), basket URL |
| `POST /customers/{phone}/basket/items` | Add products by store, SKU and quantity | what was added, what was out, basket URL |
| `POST /customers/{phone}/basket/move` | Move the basket to another store and make it the customer's store | lines at that store, what's missing, basket URL |
| `GET /products?q=…&store=…` | Optional search | Without it, the bot reads the public catalogue itself |

   Behind it: Magento admin REST with an integration token scoped to customer manage, cart manage and sales read. Customers are found by the mobile-number attribute (the site logs in by OTP, so it exists; its code is to be confirmed) and the active quote by customer id. **The Magento token stays out of the bot**, which holds only the service's bearer key.
2. **Live stock by store and SKU** (feed under 6 hours old). Used by every `needs` about stock and the morning variables.
3. **Slot service:** open slots, capacity, ideally a 48-hour hold.
4. **Store hold list** (POS note), released at 8 pm if untapped, for "kept aside" and first pick.
5. **Care ticketing with a close webhook**, for handoffs, escalations and clearing `care_hold_until`.
6. **Concierge task queue** with a 4-hour alert, plus either a Gupshup agent seat or a call-based rewrite of 3.3 (calls recommended).
7. **Gift-list page** with the recipients of their last gift order (flows 2.4, 3.1).
8. **Buyers' map** of search terms to an aisle and closest items (flow 4.5).
9. **A basket page** with live stock, sold-out lines greyed out and the closest item suggested. Plus the real deep-link paths.
10. **A KV store** for bot state and AI chat history.
11. **A CleverTap journey webhook** telling the bot which template went to whom.
12. **An Anthropic API key**, and **data-processing agreements** with Anthropic, Gupshup and CleverTap (SPDI Rule 7 now; DPDP s.8 from May 2027). Keep a redacted log of AI turns for a year.
13. **Utility templates approved by Meta.** Submit all 24 templates, plus plain-text and three-button fallbacks.

### B. Engineering steps in this repo
1. Get an Anthropic key and run `npm run pressure` on Claude Haiku 5.5. Recheck answers and speed.
2. Wire the FoodStories endpoint (`FOODSTORIES_API_URL` and key). The code already switches from the sample to live when it is set. Until then, in production, turn off `get_basket`, `add_to_basket` and `change_store`.
3. Fill the tap-time check registry: one entry per `needs` node, keyed by flow key and node, as each service lands.
4. Rebuild slot rows from the slot service at tap time.
5. Move in-memory state to KV (and read opt-out from the CleverTap profile) before scaling past one instance.
6. Append the signed basket-prefill token to links. Decide the expiry (somewhere between 15 minutes and 30 days).
7. Replace placeholder paths with the real site paths.
8. Support BSUID (WhatsApp usernames): turn on Gupshup's flag and key state by it.
9. Show WhatsApp's typing indicator while the AI thinks, if the account forwards it.
10. Translate the fixed lines (care timing, disclosure, FAQ answers).
11. Relay Gupshup callbacks on to CleverTap's status and response URLs, so its delivery stats keep working (if the bot owns the single callback).
12. Queue failed CleverTap uploads and reconcile daily.
13. Ops hardening: a Vercel WAF rate limit on the webhook path, a Gupshup IP allow-list, and one alert channel with three alerts (webhook 5xx, feed older than 6 hours, a flow skipping over half its segment).
14. Ask FoodStories for a category tag for restricted products, so the filter stops depending on names.
15. Remove the Gemini adapter once testing is on Claude.

### C. Launch sequence (recommended)
- **Week one:** the three utility flows (6.1, 1.1, 1.3) and the carousels, throttled, with the 50-person canary on each.
- **Later:** VIP, gift and corporate flows wait on the gift-list page, the hold list, a concierge seat or a call-based 3.3, and two concierges.
- 5.2 (what went wrong) starts with a 200-person pilot and continues only if blocks and STOPs stay under 0.3%.
- Pause everything with one click in CleverTap, or set `BOT_MODE=handoff` (rollback). `GET /api/whatsapp` is the health check.

---

## 11. Open questions

### For the Gupshup and CleverTap accounts
1. Is the account behind CleverTap's connector Enterprise or self-serve? Can the bot own the single callback URL?
2. Does CleverTap's button payload reach the webhook as `postbackText`? Which inbound shape does this account send? One sandbox send settles both.
3. Is "Notification Replied" still raised for WhatsApp?
4. Which identity scheme do profiles use (`+91…` or a custom id)?
5. What is the send rate limit on Gupshup's message API? Does a 429 carry Retry-After? Does Gupshup auto-handle STOP?
6. On the Magento side: slot holds, cart by phone and stock endpoints; the mobile-number attribute; how often stock syncs from POS; the real basket deep link.
7. Meta's per-user marketing cap in India (error 131049) silently drops 5–15% of sends. Journeys should fall back to push or email and not count those toward the caps.
8. Can a CleverTap journey call a webhook as it sends a template?
9. Does the Enterprise account forward BSUIDs, the typing indicator and Meta's marketing-opt-out webhook?
10. Meta labels AI-provider traffic `general_purpose_ai`. Confirm a business's own support bot isn't classed that way.

### Business decisions pending
- Per-category stock thresholds: bakery and produce 10, cheese 3, hampers 5.
- Whether calendar flows count toward the 3-in-21 cap (recommended: count toward 2-in-7 only).
- Care SLA wording and team size: a batch day can bring 50–90 tickets, so either 3 people or "next working day" wording.
- Use CleverTap's system control group at 10%.
- Drop the emoji test for launch. Split hosting-pattern regulars 50/50 for the hosting vs what-changed test.
- 3.3: a Gupshup agent seat, or "will call you" (recommended).
- Stagger the festive concierge load (3.1, 3.2 and 3.3) over three days, with 3.3 first and alone.
- Ops: is a 48-hour slot hold possible? Saturday slots 4 days ahead at Bandra? Cash on delivery? Deliveries on 8 Nov?
- Privacy and legal: accept the corporate address-sheet exception in 3.3, or "email me a template" only.
- Brand: care replies "on Meher's behalf"? Accept that a shared family phone sees gift history?
- Sign-off on the redelivery-fee waiver (1.3); merchandising for the Christmas range and whether to show price in the body (4.3).
- Substantiation for claims like "roasted this month" and "picked for ripeness" (ASCI): no catalogue field, no claim.
- A promo calendar per store, so flows skip products on promo.
- `weekly_basket` will likely be classed as marketing (about ₹40 per regular per year). Accepting the cost is recommended.

---

## 12. Costs and load

- **WhatsApp:** about ₹8,000–12,000 a month in India, plus about ₹3,000 extra in Diwali week. Since 1 Oct 2026, Meta also charges free-form service replies inside the 24-hour window, after 1,000 a month per number. Gupshup adds about $0.001 per message. Every bubble counts, including each product card.
- **AI:** under $1 per 1,000 typed messages on Haiku 5.5. A full `npm run pressure` costs about a cent on Claude, or uses about 170 Gemini requests.
- **Load estimate:** about 14,000 sends in the Diwali month and 8,000 otherwise. That produces about 270–300 care tickets, 70–100 concierge tasks, 400 hold-list entries and 150 live weekly reminders a month. That averages 13 tickets a working day, but 50–90 on a batch day, which is why batching and the canary exist.
- The conclusion: **the cost is people, not messages.** One reactivated basket pays for a week of messaging.

---

## 13. Compliance and safety summary

| Area | How it's handled |
|---|---|
| **Consent (DPDP)** | Opt-in with a recorded source and date; STOP and wrong-number in English, Hinglish and Indic scripts; START resubscribes; opt-out also covers utility templates; after STOP, typed service requests still reach care |
| **Data minimisation (DPDP, SPDI)** | Phone never sent to the model; identifiers masked; `WA Reply` events carry no typed text; handoff text goes to the care system, with only a ticket id in CleverTap once a helpdesk exists; logs show the last 4 phone digits only |
| **Meta Business terms §4.7** | AI is not the primary function; FoodStories topics only |
| **Meta Commerce Policy / IMS Act** | No alcohol (including surrogate brands), supplements or infant food; health claims blocked |
| **FSSAI / ASCI** | No health claims; label words only where the product data uses them |
| **Dark-pattern guidelines** | No false urgency |
| **Anthropic usage policy** | AI disclosure at the start of each chat |
| **Mental health** | Crisis detection with Tele-MANAS 14416 in English and Hindi; the handoff is never capped |
| **Security** | Webhook secret in the URL; dedupe; per-phone queue; prompt-injection fencing; leak marker; the deep-link token can only prefill a basket; CERT-In wants 180 days of logs and DPDP Rule 8(3) a year |

---

## 14. How to run it

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the demo at http://localhost:3000 |
| `npm run format` | Format the code with Prettier (line width 120); run it after editing |
| `npm run check` | Offline checks: flows lint, Gupshup JSON, payloads, rules, `vet`, AI loop, webhook turn |
| `npm run pressure` | Live AI scenarios. Needs an AI key in `.env.local`. Options: `--only=<regex>`, `--report=out.json`, and an extra scenarios JSON file |

### Environment variables
| Variable | Purpose |
|---|---|
| `GUPSHUP_WEBHOOK_SECRET`, `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE`, `GUPSHUP_APP` | Webhook and sending (required by the route) |
| `CLEVERTAP_ACCOUNT_ID`, `CLEVERTAP_PASSCODE`, `CLEVERTAP_REGION` (default `in1`) | Events and subscription |
| `ANTHROPIC_API_KEY`, or `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` | Claude (production) |
| `GEMINI_API_KEY` (comma-separated for several) | Free testing; used only when no Anthropic key is set |
| `AI_MODEL` | Override the model (a comma-separated list for Gemini) |
| `FOODSTORIES_API_URL`, `FOODSTORIES_API_KEY` | Customer and basket endpoint |
| `BOT_MODE=handoff` | Rollback: everything goes to customer care |

Today `.env.local` holds only `GEMINI_API_KEY`.

---

## 15. Working conventions for this repo

- After editing flows, keep `npm run check` green. It enforces the bot contract, not just WhatsApp limits.
- Never claim a basket write or slot booking in copy without `needs` or `bot` behind it.
- Flow keys never change once a template has gone out.
- Anything a tap sets (reminder day, store) must be changeable by typing, handled by the bot through a tool, and **never** handed to customer care.
- Sold out means a cross-sell, never a restock date. Keep the forecast lint.
- Leave `AI_MODEL` unset for the cheapest working default. Use synthetic data only on Gemini's free tier.
- Confirm the Gupshup and CleverTap account questions before building the webhook relay.
- This Next.js version (16.x) has breaking changes from older versions. Read `node_modules/next/dist/docs/` before changing framework code.
