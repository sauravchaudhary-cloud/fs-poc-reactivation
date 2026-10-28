// The demo's typed messages, answered by the same AI as the webhook (lib/ai.ts) for the flow's sample customer, whose
// basket is the sample in lib/store.ts; a product card's "Add to basket" tap, which needs no AI; and a tap's stock
// check (`needs.stock`), live from the catalogue. The AI is off without a key; all are capped per visitor, since anyone
// who opens the demo can call them.
import { addedTo } from "@/content/replies";
import { aiOn, answer, type ChatLine, type ProviderConfig } from "@/lib/ai";
import { flowByKey, storeOf } from "@/lib/bot";
import { clean } from "@/lib/guardrails";
import { addToBasket, inStockInstead, stockAt, STORES, storeFor } from "@/lib/store";

const CALLS_PER_HOUR = 60;
const HOUR_MS = 3_600_000;
const MAX_VISITORS = 10_000; // past this many the window starts over, so a long-lived instance doesn't creep
const hits = new Map<string, number[]>(); // when each visitor (by IP) called, for CALLS_PER_HOUR

// The provider the UI picked, if valid; undefined otherwise.
function providerFrom(body: { provider?: unknown; model?: unknown }): ProviderConfig | undefined {
  if (body.provider === "anthropic" || body.provider === "gemini")
    return { provider: body.provider, model: typeof body.model === "string" ? body.model : undefined };
  return undefined;
}

export async function POST(req: Request) {
  if (!allowVisitor(clientIp(req)))
    return Response.json({ kind: "fail", why: "demo limit", tools: [] }, { status: 429 });
  const body = await req.json().catch(() => null);
  const flow = flowByKey(str(body?.flow, 40));
  if (!flow) return new Response(null, { status: 400 });
  // A store they moved to earlier in this chat (change_store), if it's one of the stores; else the flow's.
  const store = STORES.find((s) => s.code === body.store)?.code ?? storeOf(flow);
  const stress = body.stress === true;
  // A card's "Add to basket": added there and then, as the webhook does (lib/whatsapp.ts), sold out mid-add in the
  // stress test.
  const adding = str(body.add, 120);
  if (/^[\w-]+$/.test(adding)) return addFromCard(adding, store, stress);
  // A tap's stock check: the products its node names, from the flow's own list, never the browser's.
  const checking = str(body.check, 40);
  const stock = Object.hasOwn(flow.nodes, checking) ? flow.nodes[checking][0].needs?.stock : undefined;
  if (stock) {
    const found = await stockAt(stock, store).catch(() => undefined);
    return Response.json(found ? { ...found, store: storeFor(store).name } : {});
  }
  if (!aiOn()) return Response.json({ kind: "fail", why: "off", tools: [] });
  if (!str(body.text, 1)) return new Response(null, { status: 400 });
  const history = historyFrom(body.history);
  const options = optionsFrom(body.options);
  const providerConfig = providerFrom(body);
  return Response.json(
    await answer({
      text: clean(str(body.text, 1000)),
      phone: "demo",
      store,
      name: /^Hi (\p{Lu}\p{Ll}+)/u.exec(flow.start.text)?.[1], // the sample customer's first name, from the greeting
      history,
      options,
      stress,
      providerConfig,
    }),
  );
}

async function addFromCard(key: string, store: string, stress: boolean) {
  const at = storeFor(store);
  const result = await addToBasket("demo", at.code, [{ key, qty: 1 }], stress).catch(() => undefined);
  if (!result) return Response.json({ kind: "fail", why: "the add didn't go through", tools: [] });
  const alternatives = result.out.length
    ? await inStockInstead(
        result.out,
        at.code,
        result.added.map((l) => l.name),
      )
    : [];
  const [msg, ...more] = addedTo(at.name, result, alternatives);
  return Response.json({ kind: "say", msg, more, added: result, tools: ["add_to_basket"] });
}

// The demo's chat comes from the browser, so a visitor can write FoodStories' side of it too; any other speaker counts
// as the visitor. Fine for a demo, which is why it isn't for a public URL with a production key (BOT.md). The webhook
// keeps its chat server-side.
function historyFrom(raw: unknown): ChatLine[] {
  return (Array.isArray(raw) ? raw : []).slice(-12).map((line: { who?: unknown; text?: unknown }) => ({
    who: line?.who === "us" ? "us" : "customer",
    text: str(line?.text, 500),
  }));
}

// The open question's options as the browser sends them: ten at most, each field cut short.
function optionsFrom(raw: unknown) {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 10)
    .map((option: { title?: unknown; description?: unknown; card?: unknown }) => ({
      title: str(option?.title, 25),
      description: str(option?.description, 72) || undefined,
      card: str(option?.card, 160) || undefined,
      next: "",
    }));
}

// x-real-ip is the platform's.
const clientIp = (req: Request) =>
  req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

// Counts a call against the visitor's past hour, allowed or not: false once it has made CALLS_PER_HOUR.
function allowVisitor(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
  if (hits.size > MAX_VISITORS) hits.clear();
  hits.set(ip, [...recent, now]);
  return recent.length < CALLS_PER_HOUR;
}

// An untrusted value as a string of at most `max` characters; anything else is "".
const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
