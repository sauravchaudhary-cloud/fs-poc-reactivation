# FoodStories · WhatsApp bot prototype

A clickable WhatsApp mock-up of the reactivation conversations in *FoodStories: Reactivating Inactive Customers* (v7).

```bash
npm install
npm run dev     # http://localhost:3000
npm run format    # Prettier, line width 120: run it after editing
npm run check     # every flow is wired up and fits WhatsApp's limits; the bot and the AI's loop, offline; the dashboard's sums
npm run pressure  # the AI against ~80 live scenarios (needs a key in .env.local; about a cent)
```

- `content/flows/`: the deck's six segments and the 24 conversations derived from them, one file per segment (`shared.ts` holds the pieces several use), each with presenter notes on why it's written that way. Edit the copy here. Each flow also carries its `gate` (what CleverTap checks at send), and each node its `needs` (what the bot checks at tap time, and the fallback node) and `bot` (what the bot does or records).
- `content/replies.ts`: what the bot says in its own words outside a flow: the fixed replies (STOP, handoff, the crisis line), one-line FAQ answers, and the messages it writes from what a tool did (added to the basket, moved store, reminder set).
- `prompts/assistant.ts`: everything the AI reads: the system prompt, its tools, and each turn's message.
- `components/demo/` (`demo.tsx` is the page at `/`): the phone UI. **▶ Present** walks a seven-stop path for a pitch (`content/tour.ts`; arrow keys or a clicker move along it), `/?flow=2.1` opens one conversation, and `/?dev` adds the log's Clear logs. Tick **Stress test** in the side panel to play the fallbacks (sold out, slot filled, cut-off passed, and products selling out while the AI adds them) and see the bot's notes under each message. Typed replies are read the way the bot reads them: yes/no/haan/nahi as a tap, thanks as a nod, STOP as an opt-out.
- `lib/bot.ts` (a flow's shape, button payloads, Gupshup JSON), `lib/read.ts` (typed text, read in order), `lib/guardrails.ts` (the rules every reply passes), `lib/whatsapp.ts` (one inbound message, start to finish) and `app/api/whatsapp/route.ts` (the webhook): the reply bot between Gupshup and CleverTap. `BOT.md` explains the set-up and what has to exist before launch.
- `lib/ai.ts` and `lib/store.ts`: what customers type, answered by Claude Haiku 5.5 with the live catalogue (prices and stock per store) and their basket. Put `ANTHROPIC_API_KEY=…` in `.env.local` (or, for free testing with synthetic data only, `GEMINI_API_KEY=…`, through `lib/gemini.ts`) and the demo's typed messages go to it too (BOT.md, "The AI"). `npm run pressure` tests it against about 80 scenarios.
- `app/dashboard/`, `components/dashboard/` and `lib/dashboard/`: the reactivation dashboard at `/dashboard`. Tiles for inactive, messaged, won back (a second order within 45 days, with the lift over the control group), orders and today's calls; the funnel; won back by week; a Do next list (hot leads, follow-ups due, unhappy customers, quiet VIPs, a lagging flow); and every customer with **Call** (a `tel:` link) and **Log** (outcome, note, follow-up date), so each call is tracked. **Import customers** reads a CSV (only `phone` is required; the panel lists the columns it understands). Customers and calls live in `data/dashboard.db` (Node's built-in SQLite, gitignored); until the first import it holds 3,040 sample customers whose numbers can't be dialled, seeded again each day so their dates stay current. Delete the file to start over.
- `app/dashboard-v2/` and `components/dashboard-v2/`: the same dashboard at `/dashboard-v2`, in liquid glass and the Lagoon palette (a pale aqua page, turquoise, aqua and coral light, coral buttons), on the same data, calls and import. `glass.css` holds the glass and its palette; `glass.tsx` bends the page behind each panel's rim (Chromium only; other browsers get a plain frosted blur).
- `PRESSURE-TEST.md`: every scenario the flows and the bot were tested against, with what was fixed, what needs a decision, and what only a live test can settle.

`lib/`, `content/` and `prompts/` import each other by relative path with the `.ts` extension, so the checks in `scripts/` load them in plain Node; `app/` and `components/` use the `@/` alias.

Products, hampers, prices and stores come from foodstories.shop (October 2026). People's names are placeholders; photos are the catalogue's own product images.
