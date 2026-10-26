# The reply bot: Gupshup ↔ CleverTap

CleverTap sends the templates in `content/flows/` through its Gupshup connector. Nothing handles the
customer's taps and typed replies today. This is the smallest service that does, and what each side
has to be set up to do. Items marked [confirm] depend on the account and were not verifiable from the
docs (sources at the end). `PRESSURE-TEST.md` has every scenario that shaped it.

## Shape

```
CleverTap ──template (buttons carry a payload)──▶ Gupshup ──▶ customer
customer ──tap / text / photo──▶ Gupshup ──webhook──▶ app/api/whatsapp?k=<secret> (this repo)
                                                 ├──▶ Gupshup /wa/api/v1/msg   the node's session messages
                                                 ├──▶ CleverTap /1/upload      events (WA Reply, WA Handoff, …)
                                                 ├──▶ CleverTap /1/subscribe   on STOP, wrong number, START
                                                 └──▶ Claude (typed text only) ──▶ api.foodstories.shop/graphql  catalogue, stock per store
                                                                                └──▶ FOODSTORIES_API_URL         customer, basket (to build)
```

1. **The bot owns the Gupshup callback.** CleverTap's connector runs on a Gupshup Enterprise account
   (HSM + two-way credentials), and an Enterprise account takes **one** callback URL. Point it at
   `/api/whatsapp?k=<GUPSHUP_WEBHOOK_SECRET>` and relay delivery receipts and inbound messages on to the
   two CleverTap URLs the connector shows (`cb.wzrkt.com/gupshup/status` and `/response`), in the format
   CleverTap documents, so its Sent/Delivered/Read stats keep working [confirm the account type; on a
   self-serve app, keep CleverTap primary and add the bot as a secondary subscription].
2. **Every button carries a payload** `<flow key>:<node>:<option>`, e.g. `browse-cart:book:0`
   (`lib/bot.ts`). Flow keys are fixed in `content/flows/` and must never change once a template has gone out.
   CleverTap's template editor lets each quick-reply carry a custom payload; the bot also resolves a bare
   button title when the payload doesn't come through, but only when the title is unique or follows the
   customer's last message [confirm it arrives as `postbackText`; if it doesn't, make every start-button
   title unique per flow]. Session messages put the same payload in `postbackText`, so a tap on any
   message, old or new, resolves without "last message" state.
3. **Answer first, work after.** The webhook returns 200 as soon as the inbound is parsed and deduped
   (Gupshup retries after 10 s), then sends and records in `after()`. One phone is handled at a time, so
   two replies never interleave a node. A failed send raises `WA Send Failed`; nothing is retried, because
   a retry would send the same messages twice. Failed delivery receipts are logged (alert on them).
4. **The 24-hour window.** A customer's tap or text re-opens it, so the node that answers a tap is
   always sendable as session messages. Not free, though: since 1 Oct 2026 Meta charges per service message
   (a free-form reply inside the window) after 1,000 a month per business number, and Gupshup adds its own
   fee, about $0.001, on every message (third-party sources, Oct 2026; confirm on Gupshup's rate card). Every
   bubble counts: a product card, or a node's second message. Anything promised for later (`bot:`
   notes that name a template) is a CleverTap journey on the event the bot records, sending an approved
   utility template: `weekly_basket`, `care_reply`, "running late", the sheet reminder, and
   `back_in_stock` only where a stock feed can trigger it (3.4). Nothing promises stock on a date.
5. **Consent.** STOP and its variants ("stop promotions", "unsubscribe me", "remove my number", "band
   karo"), and "wrong number", call CleverTap's Subscribe API (`Unsubscribe`), reply once, and put the
   phone on the bot's opted-out list; any later tap gets one line and nothing from a flow until START,
   which resubscribes. Gupshup no longer checks opt-outs itself. Opt-out applies to utility templates too:
   Meta would allow them, the quality rating would not.
6. **Typed text**, in order (`read()` in `lib/read.ts`, shared by the webhook and the demo): STOP / wrong
   number / START → "who is this?" → a legal threat (`WA Escalation`, "the care lead will call you by …")
   → a photo, voice note or document: `received` while a flow expects one, otherwise `WA Handoff` → the node
   the last question asked for (`typed`) → a short yes/no (three words at most, Hinglish and Indic scripts
   included) as a tap on the first/last button when the last button is a decline, or a nod when nothing is
   open → thanks gets a nod → **everything else goes to the AI** (next section), which answers, picks the
   option the customer meant, or hands off. If the AI is off, fails or breaks a rule, the old chain answers:
   a one-line FAQ (order status, dietary, discount, alcohol, address change), "could you tap one of the
   options?", a nod, or `WA Handoff` with when a person will reply. Rules never echo typed text into a
   message. `{care_by}` and `{concierge_by}` are filled from the IST clock: "within 2 working hours
   (9 am–8 pm, Mon–Sat)" in hours, "by 11 am on Monday" on a Saturday night.
7. **What the bot records** (CleverTap `/1/upload`, identity = `+` + phone in one function; [confirm
   the identity scheme with a `dryRun=1` upload]): `WA Reply {flow, node, option, choice}` on every node
   sent (`ai: true` when the AI picked the option), `WA AI Reply {flow, node, outcome, tools, why}` on every
   AI answer (`outcome` say, handoff or fail: alert when fails climb), `WA Handoff {text, media}` (`text` is
   the AI's summary when it handed off), `WA Escalation`, `WA Opt Out`, `WA Opt In`, `WA Wrong Number`,
   `WA Send Failed`, `WA Basket Add {store, added, out, missing}`, `WA Reminder Set {reminder_day, reminder_cadence}`, `WA Store Change {from, to}` (the customer's store property should follow it, so campaigns
   come from the new store). Journeys use them: a goal on `WA Reply` exits the journey; the profile properties
   every `bot:` note names are listed, with type and expiry, in `PROPS` in `lib/bot.ts`, and the check
   script refuses any other name. Handoff text is customer-typed and may hold personal data: route it to
   the care system and keep only a ticket id in CleverTap once a helpdesk is connected.
8. **Rollback.** Pause all journeys in CleverTap (one click). Set `BOT_MODE=handoff` and every tap gets
   the handoff line and a `WA Handoff` event until it's cleared. `GET /api/whatsapp` is the health check
   and lists any missing environment variable.

## The AI: what customers type

`lib/ai.ts` (its prompt and tools are in `prompts/assistant.ts`) answers what `read()` can't settle: product and stock questions, the basket, a typed answer to
a flow's question ("kal shaam ko bhej do"), a complaint. Claude Haiku 5.5 with nine tools and one rule set.

- **Tools.** `search_products` and `get_basket` read; the basket is scoped to the phone the message came
  from, and search to its store (or another the customer asks about), never to anyone the model or the
  customer names. `add_to_basket` adds products when they ask (or say yes to "Shall I add it?"), each by a product
  page FoodStories showed (a search result, or a link in its own messages; never a link the customer typed), 1 to
  10 of each: the bot adds what's in stock and writes what went in, and for anything sold out by then, "you just
  missed it" and the two closest in-stock items (the store's top search matches for its name; never when it's
  back). The demo's Stress test sells out every other product mid-add: one sells out entirely, of two the first.
  `change_store` moves the customer to another store when they clearly want to shop there
  ("my location is Gurugram", "I've moved to Andheri"): the basket goes along at that store's prices and stock,
  the bot (not the model) writes what moved and what the new store doesn't sell, and the store holds for the rest
  of the chat. A question about another store's stock is only a search; a city with no store gets asked which
  store. `set_reminder` sets, changes or turns off the basket reminder ("change it to Sunday", "every two
  weeks", "no reminders"): what a tap set, typing can change, with no customer care in between; the bot confirms
  in the tap's words and raises `WA Reminder Set {reminder_day, reminder_cadence}` for CleverTap to set them.
  `choose_option` picks one of the open question's options, and the bot then plays that
  node exactly as if it were tapped (`needs` check, `bot` side effects, `WA Reply` with `ai: true`), so the AI
  never invents a flow promise; when no open option declines, the flow's own decline is offered too, so
  "rehne do" releases a hold. A pick can carry `also` (a line answering the rest of the message, sent after
  the node) and `complaint` (a `WA Handoff` alongside). `handoff` passes it to customer care with a one-line
  summary; the bot adds when they'll reply; with reason `crisis` or `legal` the bot sends the crisis line or
  escalates. `opt_out` unsubscribes, exactly like STOP. Every turn ends in `reply`, `choose_option`,
  `handoff` or `opt_out`; at most five rounds, the last two told to answer, and one retry, told which rule
  broke, for a reply `vet()` refuses.
- **What it may say.** The system prompt carries the deck's rules: tools for every product, price and stock
  fact; out of stock is "you've just missed it" plus the closest in-stock items, never a date; no codes,
  free items or totals; no alcohol; no health assurances; no store hours or fees; no promises of later
  action; only FoodStories topics (Meta's 2026 terms bar general-purpose assistants on the platform);
  the customer's own language (English, Hinglish, Hindi). The customer's text is fenced as data.
- **What it may not send.** Every reply passes `vet()` in `lib/guardrails.ts` or isn't sent, and the rules
  answer instead: banned deck words, a stock forecast, a deal, alcohol, an action or promise nobody takes
  ("I've added", "I'll call"), a link off foodstories.shop, a number of three or more digits it wasn't
  shown (a made-up price, phone or order number), over 1,000 characters. A handoff whose apology breaks a
  rule still hands off, with the standard line.
- **Products as a carousel, one tap to the basket.** A reply that names products (an occasion, a budget,
  "exotic fruits") lists them in `reply.products`, and two to four of them go as one carousel under the
  reply, like the flows' carousel templates. Each card has the product's photo, "*Name* · ₹price", its page
  and an **Add to basket** quick-reply button (id `add:<page key>`).
  - It's Meta's interactive carousel, a session message: 2–10 cards, a photo on every card, 160 characters
    each, the same buttons on all, and no footer or other buttons. So a link goes in the reply's text and
    suggested replies are left off.
  - A tap is added there and then by the bot, with no AI call (about 0.4 s against 2–4 s typed), confirmed
    from what the add returned, and recorded as `WA Basket Add` with `tapped: true`.
  - Only what this turn's search returned and is in stock, four at most, from the catalogue's own data (its
    original photo file: Magento's resized `/cache/` copies 403 until the site has shown them; photos never
    go to the model).
  - One product rides on the reply itself. If any product has no photo, they go as before: a message per
    card (Gupshup's `quick_reply`, image content, `postbackText` `add:<page key>`). So do the "in stock
    instead" items after a sold-out add, so a miss is one tap from a swap.
  - Cards land in the chat history with their pages, so "add the second one" works.
  - Carousels go to Gupshup's v3 endpoint, which takes Meta's Cloud API JSON (`toGupshup` in `lib/bot.ts`,
    `send` in the webhook) and needs `GUPSHUP_APP_ID` and `GUPSHUP_APP_TOKEN`. Without them, a carousel
    goes the old way: its text, then a message per card (`unfold`).
- **Next steps as buttons.** The AI may end a reply with up to three suggested replies ("Something cheaper",
  "What goes with it?"): WhatsApp reply buttons, 20 characters, held to `vet()`, never a second "Add to
  basket". A tap comes back as if typed (`postbackText` `ask`), and is never matched to a flow's button. A
  message has a link button or reply buttons, not both: a basket or orders link wins.
- **What buttons cost.** Reply-button and link-button messages are session messages, priced like text: a
  button adds no cost of its own. A tap is a message from the customer (free at Meta; Gupshup's fee may
  apply) that the bot answers with one, so buttons cost exactly the conversation they start. A carousel is
  one message however many cards it carries; without the v3 endpoint a card is a message, so four cards are four.
- **What it sees.** First name and store (from the customer endpoint, else the flow's store), the last
  dozen messages of this chat (kept a day, in memory), the open options, the IST time, and tool results.
  Never the phone number. The flow's template isn't in that chat, because CleverTap sends it: until
  CleverTap tells the bot which template went (a journey webhook to the bot), a typed reply to a template
  reaches the AI without it, and the AI asks or looks things up.
- **Data.** Products, prices and stock come live from the site's public catalogue, Magento GraphQL at
  `api.foodstories.shop/graphql` with a `Store` header (`vasantkunj`, the default; `hyderabad` for Banjara
  Hills; `bengaluru` for Lavelle Road; `gurugram`; `mumbai_bandra`; `mumbai_lokhandwala` for Andheri West;
  the site's own codes, from `STORE_REGION_ID_MAP` in its scripts), no credentials. The site's map also has
  `mumbai_powai`, which the catalogue answers with an error (Oct 2026). Articles in the results (priced at
  zero) are skipped.
  The customer and their basket need an endpoint FoodStories exposes (below); until then the basket is three
  real products, priced and stocked live.
- **Before the AI, always.** A crisis ("I don't want to live", "mar jana hai", "जीने की इच्छा नहीं") outranks
  everything, STOP included: one caring line, in English and Hindi, with Tele-MANAS 14416 and
  `WA Handoff {crisis: true}`, which no ticket cap holds back. Asking for a person ("I want a human",
  "manager se baat karao") gets "You're chatting with FoodStories' automated assistant. A person from
  customer care will reply …" without the model. STOP, wrong number, a legal threat ("I'll sue", "consumer
  court jaunga", "कोर्ट जाऊँगा") and "who is this" each have a rule in English, Hinglish and Devanagari. The
  rules are narrow on purpose ("stop the delivery" isn't an opt-out, "wrong number of loaves" isn't a wrong
  number, "my lawyer friend" isn't a threat): what they miss reaches the AI, which has a tool or a reason for
  each, so a miss costs a model call, not a wrong answer. A bare yes taps only a two-button yes/no, and a yes
  with a no in it ("ji nahi", "don't send it", "cancel kar do") is never a yes. Every message is folded first
  (NFKC, every script's digits to 0–9, invisible and format characters dropped), so STOP with a zero-width
  space inside, in full-width letters or behind Unicode tags is still STOP.
- **The webhook around it.** Typed text is never matched against other flows' button titles ("Call me"
  typed in a complaint isn't the corporate-gifting button); a title stands in for a lost payload only on a
  button reply, within the open flow. After STOP, a flow's taps get one line until START, but what the
  customer types still reaches the AI and customer care: opting out of marketing isn't opting out of
  service. At most five care tickets a phone an hour. If the AI is down, a short answer while options are
  open gets "could you tap one of the options?" rather than a ticket.
- **Why these rules** (sources in PRESSURE-TEST.md, section G): Meta's Business terms §4.7 (from 15 Jan
  2026) bar AI as the *primary* function, so the AI only helps with FoodStories; Meta's Commerce Policy
  keeps alcohol, supplements, infant formula and health claims off WhatsApp, so search results drop them
  and `vet()` blocks health claims and label words ("100%", "pure", "healthy") the product data doesn't use
  (saying it can't make the claim, "we can't call foods healthy", isn't one);
  the dark-pattern guidelines rule out false urgency; Anthropic's usage policy asks for AI disclosure at the
  start of a chat and its terms a caveat, so the first AI answer in a chat carries "_Automated assistant ·
  prices and stock confirmed at checkout_" (a footer on link messages); DPDP and the SPDI Rules ask for minimisation, so phone, OTP, card and order numbers, emails and
  UPI ids are masked before the model, and only the first name and store go with them.
- **Limits.** 15 AI answers per phone per hour, then the rules (an abuser or a loop costs nothing more).
  Each call has a 20-second timeout and one retry. Media never reaches the AI. A reply that quotes a
  marker planted in the system prompt is a leak, and isn't sent.
- **Cost.** Haiku 5.5 is $0.10 / $0.50 per million input and output tokens; a typed message is one to three
  calls, about $0.0005–0.001 with the cached system prompt, so 1,000 typed messages cost under a dollar.
  Meta charges more than the model: since 1 Oct 2026 every free-form reply past 1,000 a month per number
  is billed, and an AI answer is one.

**Setting it up.** Set one of these; with none, typed text goes to the rules as before. `AI_MODEL`
overrides the model. `GET /api/whatsapp` reports `ai: true|false`.

| For | Set | Notes |
|---|---|---|
| Production, and real tests | `ANTHROPIC_API_KEY` | Anthropic direct, `claude-haiku-5-5`. Prepaid by card; no training on API data, deleted within 30 days. A full `npm run pressure` costs about a cent. |
| One bill on Vercel | `ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh`, `ANTHROPIC_AUTH_TOKEN=<key or VERCEL_OIDC_TOKEN>`, `AI_MODEL=anthropic/claude-haiku-5.5` | Same price. Vercel's free monthly credit doesn't cover Claude models (Oct 2026). |
| Free, on a laptop | `llama-server -hf unsloth/Qwen3.5-9B-GGUF:Q4_K_M --alias qwen` (5.7 GB), then `ANTHROPIC_BASE_URL=http://127.0.0.1:8080`, `ANTHROPIC_API_KEY=x`, `AI_MODEL=qwen` | llama.cpp speaks the same API. Weaker than Haiku: for plumbing, not for judging replies. Nothing leaves the machine. |
| Free, hosted | `GEMINI_API_KEY` (from aistudio.google.com; used only when no Anthropic key is set) | `gemini-3.5-flash`, then `gemini-3.6-flash`, then `gemini-3.5-flash-lite` (`AI_MODEL` takes a list the same way). A small adapter in `lib/gemini.ts` speaks Google's OpenAI-compatible API, so the loop and `vet` are unchanged. On the free tier (Oct 2026) the two Flash models answer a typed message in 5–7 s but allow 20 requests a day and 5 a minute each; Flash-Lite allows 500 a day but takes 15–25 s a call even for "Say ok" (about 50 s a message), so it's the fallback. One full `npm run pressure` uses about 170 requests. Google may use free-tier prompts: synthetic data only, never real customers. Quotas are per model and per Google project, not per key: give several keys from different projects, comma-separated (`GEMINI_API_KEY=key1,key2`), and each call goes to the first model, on the first key, that isn't resting from a limit (the panel shows which answered). |
| Free, hosted (other) | `ANTHROPIC_BASE_URL=https://openrouter.ai/api`, `ANTHROPIC_AUTH_TOKEN=<OpenRouter key>`, `AI_MODEL=openrouter/free` | 50 requests a day without credits; free models may train on prompts: synthetic data only. |

Claude-only fields (`cache_control`, `effort`) are sent only when `AI_MODEL` names a Claude model. The
demo's `/api/chat` takes its chat history from the browser and spends the same key: keep the demo on a
private URL, or without a key, once a production key is set.

**What FoodStories' developers expose for the basket.** One service, server to server, bearer key in
`FOODSTORIES_API_KEY`, at `FOODSTORIES_API_URL`:

```
GET /customers/{phone}                  → {"name":"Anjali","store":"hyderabad"}                       (404 if unknown)
GET /customers/{phone}/basket?store=…   → {"lines":[{"name":"Country Sourdough","qty":2,"unit_price_inr":175,"in_stock":true}],"url":"…"}
POST /customers/{phone}/basket/items {"store":"mumbai_bandra","items":[{"sku":"19838","qty":2}]}
                                        → {"added":[{"name":"Country Sourdough","qty":2,"unit_price_inr":175}],"out":["Dark Rye Sourdough"],"url":"…"}
                                          adds each line at that store; "out" is what had sold out by the time of the add
POST /customers/{phone}/basket/move  {"store":"gurugram"}
                                        → {"lines":[…as above, at that store],"missing":["Spinach And Feta Babka"],"url":"…"}
                                          moves the basket to that store's (what it doesn't sell is left out, named in
                                          "missing") and makes it the customer's store
GET /products?q=…&store=…               → optional; without it the bot reads the public catalogue itself
```

Behind it, Magento's admin REST with an integration token limited to `Magento_Customer::manage`,
`Magento_Cart::manage` and `Magento_Sales::sales` (read): `customers/search` on the mobile-number attribute
(the site logs in by OTP, so it exists; its code is to confirm), the active quote by `customer_id`
(`carts/search`), and each line's stock from the public catalogue with the customer's `Store`. Keep the
token out of the bot: it holds only the service's bearer key.

## The contract in `content/flows/`

- `gate`: what CleverTap checks at the moment of send (segmentation is days old by then), on top of
  `sendGates`: stock per category, caps and their priority order, order-since, care hold, consent source,
  batch size and a canary, store open, feed freshness, dates as variables.
- `needs`: on a node's first message, what the bot verifies before sending it, and the node to play
  instead. `lib/whatsapp.ts` keeps a registry keyed by flow key and node; it is empty until the
  services below exist, so every check passes today, and the demo's Stress test says so.
- `bot`: the side effect of sending a message. Each one is a line of integration work.
- `{choice}` is the tapped title; `{item}` the product on the carousel card that was tapped.
- Links deep-link into the site with UTM tags per flow and node, and the bot appends a signed,
  short-lived token (phone, store, items to add, slot id) scoped to prefilling a basket: it never logs
  anyone in or pays, because WhatsApp messages get forwarded. Paths are placeholders.
- A link can be opened days after it was sent, so the chat never vouches for what the basket page will
  show. The basket page shows live stock for their store, greys out anything that has sold out since, and
  suggests the closest item. The bot sends a `/basket` link only when the basket has at least one line in
  stock; otherwise it links the flow's aisle (1.1 "Not this time" shows the pattern).

## What has to exist before launch

| Service | Used by | Without it |
|---|---|---|
| Stock by store and SKU (live, feed under 6 h old) | every `needs` about stock; the morning feed that fills product variables | templates can name sold-out items; "Done ✅" can be false |
| Cart API keyed by phone + store, idempotent adds; a basket page with live stock, sold-out lines greyed and the closest item suggested | every "in your basket" and every basket link | copy must say "ready to add" instead; a link opened later can land on a dead basket |
| Slot service: open slots, capacity, optional 48-h hold | every slot list and "is open ✅" | rows stay literal; "held" must never be said |
| Store hold list (POS note), released at 8 pm if untapped | kept aside, first pick | the physical promise can't be kept |
| Care ticketing with a close webhook | `putRight`, money, sourcing, handoff, escalation | `care_hold_until` runs its 7 days |
| Concierge task queue with a 4-hour alert, and an agent seat or a call-based rewrite of 2.3 | every "will call you", "will send last year's order here" | nobody calls; nobody can reply from the number |
| Gift-list page with the recipients of their last gift order | 1.4, 2.1 | those nodes fall back to a concierge call |
| Buyers' map of search terms to an aisle and the closest in-stock items | 3.5 | the template must not go |
| KV for the bot's `last`, `seen`, opted-out state and the AI's chat history | typed answers (email, "what were you looking for?") after a redeploy or on a second instance | a typed answer lands in handoff; the AI forgets the chat |
| The customer and basket endpoint above (a Magento integration that reads, adds to and moves a basket) | the AI's `get_basket`, `add_to_basket` and `change_store`, and the customer's name and store | the AI shows a sample basket in the demo and only simulates adds and moves; in production, turn `get_basket`, `add_to_basket` and `change_store` off until it exists |
| A CleverTap journey webhook telling the bot which template went to whom | the AI understanding a typed reply to a template ("is it fresh?") | the AI asks what they mean, or looks it up |
| An Anthropic API key, and a data-processing agreement covering it (DPDP: the store is liable for its processor) | every AI reply | typed text goes to the rules and to people, as before |
| Utility templates approved: weekly_basket, care_reply, running late, sheet reminder (back_in_stock only with a stock feed); a marketing twin of 6.1 | every later promise | the window closes and the promise is silent |

## Open questions for the Gupshup and CleverTap accounts

1. Enterprise or self-serve app behind the CleverTap connector, and can the bot be the callback?
2. Does the CleverTap button payload reach the webhook as `postbackText`? Which of the three documented
   inbound shapes for template taps does this account send? One sandbox send settles both.
3. Is "Notification Replied" still raised for WhatsApp in this project (the stats page says removed)?
4. Identity scheme (phone with `+`, or a custom id) so uploads merge into existing profiles.
5. Send rate limit on `/wa/api/v1/msg`, whether 429 carries Retry-After, and whether Gupshup auto-handles
   STOP on WhatsApp (nothing found).
6. Slot holds, cart-by-phone and stock endpoints on the Magento side. For the AI: the customer attribute
   that holds the mobile number, a read-only integration token for the endpoint above, how often stock
   syncs from the POS into Magento, and the real basket deep link (the site has no `/cart` page; the flows'
   `/basket`, `/collections/…`, `/orders` and `/checkout` paths are placeholders that 404 today: products
   are `/shop/product/<url_key>/`, search `/search-results/?query=`, categories `/category/<slug>/`).
7. Meta's per-user marketing cap in India (error 131049) drops some sends silently: journeys should fall
   back to push or email on it and not count it toward the caps.
8. Can a CleverTap journey call a webhook as it sends a WhatsApp template (phone and flow key), so the bot
   knows what a typed reply answers?
9. WhatsApp usernames: inbound messages can now arrive without a phone number, keyed by a business-scoped
   user id (BSUID). Turn on Gupshup's BSUID flag and key the bot's state by it; today a message without a
   phone is ignored. Does the Enterprise account forward BSUIDs, the typing indicator (worth showing while
   the AI thinks) and Meta's marketing-opt-out webhook?
10. Meta labels AI-provider traffic `general_purpose_ai` in pricing webhooks: alert on it, and confirm with
   Gupshup that a business's own support bot isn't classed so. Sign data-processing agreements with
   Anthropic, Gupshup and CleverTap (SPDI Rule 7 now, DPDP s.8 from May 2027), and keep a redacted log of AI
   turns for a year (CERT-In wants 180 days of logs; DPDP Rule 8(3) a year).
11. Product carousels (Gupshup's January 2026 "carousel in service message"):
   - Does this app have the Partner v3 endpoint (`partner.gupshup.io/partner/app/{appId}/v3/message`), and its app token?
   - Which header does it read: `Authorization` or `token`? The docs show both, so the bot sends both.
   - Does a card's Add to basket tap arrive with `add:<key>` as the payload's `id` or `postbackText` (the bot
     reads either)?
   - How do older WhatsApp clients show one?

   One sandbox send settles all four.

## Run it

`npm run check` proves every node maps to Gupshup JSON, every payload resolves, every `bot:` note names a
known property, and the bot's replies read right; it also runs the AI's loop and the webhook's whole turn
against a stand-in model, offline. `npm run pressure` plays about 80 scenarios through the webhook's turn with
the real model and the live catalogue, and checks the replies (`PRESSURE-TEST.md`, section G). The route
needs `GUPSHUP_WEBHOOK_SECRET`, `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE`, `GUPSHUP_APP`, `CLEVERTAP_ACCOUNT_ID`,
`CLEVERTAP_PASSCODE`, and optionally `CLEVERTAP_REGION` (default `in1`), `BOT_MODE=handoff`, the AI's key
(above), `FOODSTORIES_API_URL` + `FOODSTORIES_API_KEY`, and `GUPSHUP_APP_ID` + `GUPSHUP_APP_TOKEN` for
product carousels (`GET /api/whatsapp` reports `carousels: true` once both are set). A local test:

```
curl -s -X POST 'localhost:3000/api/whatsapp?k=<secret>' -H 'content-type: application/json' \
  -d '{"app":"fs","timestamp":1,"version":2,"type":"message","payload":{"id":"m1","source":"919999999999","type":"quick_reply","payload":{"type":"button","text":"Send it over","postbackText":"vip-kept-aside:send:0"},"sender":{"phone":"919999999999","name":"Anjali"}}}'
```

Expect 200 and one Gupshup `list` POST; a second identical call sends nothing.

Sources (Oct 2026): docs.clevertap.com/docs/gupshup, /whatsapp-editor, /whatsapp-stats,
/whatsapp-subscription-management; developer.clevertap.com/docs/upload-events-api, /subscribe-api;
docs.gupshup.io/docs/what-is-an-inbound-message, /interactive, /session-messages-1, /message-events,
/what-is-a-webhook; docs.gupshup.io/reference/quick-replies, /cta-url, /postback-text-support;
developers.facebook.com/docs/whatsapp (interactive and template limits, pricing); for carousels in a session,
developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-media-carousel-messages,
partner-docs.gupshup.io/reference/post_partner-app-appid-v3-message-19 and /changelog/january-2026.
