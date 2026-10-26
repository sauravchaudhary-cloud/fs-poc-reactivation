// The reply bot's webhook: Gupshup posts every inbound message here. Answers 200 at once, then works; one phone at a
// time; deduped by message id. What each message gets is decided in lib/whatsapp.ts; this file is the wire. See BOT.md.
import { after } from "next/server";
import { flows } from "@/content/flows";
import { aiOn } from "@/lib/ai";
import { toGupshup, unfold, type Flow, type Msg } from "@/lib/bot";
import { handle, type Inbound } from "@/lib/whatsapp";

type GupshupJson = ReturnType<typeof toGupshup>;

// What the wire can't work without; GET lists any that's missing.
const REQUIRED_ENV = [
  "GUPSHUP_WEBHOOK_SECRET",
  "GUPSHUP_API_KEY",
  "GUPSHUP_SOURCE",
  "GUPSHUP_APP",
  "CLEVERTAP_ACCOUNT_ID",
  "CLEVERTAP_PASSCODE",
];

// ponytail: in memory, per instance, like the bot's state in lib/whatsapp.ts. Move to KV before scaling out.
const seen = new Set<string>(); // Gupshup message ids answered
const queue = new Map<string, Promise<void>>(); // one phone at a time, so two replies never interleave a node

// Uptime check, and a loud failure on a missing secret before any customer taps. `ai` says whether typed text reaches
// the AI.
export function GET() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) return Response.json({ missing, ai: aiOn() }, { status: 500 });
  return Response.json({ ok: true, flows: flows.length, ai: aiOn(), carousels: carousels() });
}

export async function POST(req: Request) {
  // Gupshup signs nothing, so the callback URL carries a secret: https://…/api/whatsapp?k=<GUPSHUP_WEBHOOK_SECRET>
  if (new URL(req.url).searchParams.get("k") !== process.env.GUPSHUP_WEBHOOK_SECRET)
    return new Response(null, { status: 403 });
  const body = await req.json().catch(() => null);
  if (body?.type === "message-event" && body.payload?.type === "failed")
    console.error("whatsapp delivery failed", body.payload.id, body.payload.payload?.reason); // ponytail: alert on this
  const message: Inbound | undefined = body?.type === "message" ? body.payload : undefined;
  // Receipts, opt events, malformed retries: nothing to answer.
  if (!message?.id || !message.sender?.phone) return new Response(null, { status: 200 });
  // Gupshup retries anything not answered within 10 s.
  if (seen.has(message.id)) return new Response(null, { status: 200 });
  if (seen.size > 10_000) seen.clear();
  seen.add(message.id);
  queueTurn(message);
  return new Response(null, { status: 200 });
}

// Answer Gupshup now; send and record after the response, one message at a time per phone.
function queueTurn(message: Inbound) {
  const phone = message.sender.phone;
  const turn = (queue.get(phone) ?? Promise.resolve())
    .then(() => handle(message, { send, event, subscribe }))
    .catch((err) => console.error("whatsapp webhook", phone.slice(-4), err));
  queue.set(phone, turn);
  after(async () => {
    await turn;
    if (queue.get(phone) === turn) queue.delete(phone);
  });
}

// Each message as Gupshup JSON, in order. One that fails throws with its `index`, for WA Send Failed (lib/whatsapp.ts).
async function send(phone: string, msgs: Msg[], flow?: Flow, choice = "", item = choice) {
  const outgoing = carousels() ? msgs : msgs.flatMap(unfold);
  for (const [index, msg] of outgoing.entries()) {
    const json = toGupshup(msg, flow, choice, item);
    const res = json.type === "interactive" ? await postV3(phone, json) : await postV1(phone, json);
    if (!res.ok) throw Object.assign(new Error(`Gupshup ${res.status}: ${await res.text()}`), { index });
  }
}

// A carousel (the AI's product picks) is Meta's Cloud API JSON, which only Gupshup's v3 endpoint takes, with the app's
// id and token. Without them it goes the old way: its text, then a message per card.
const carousels = () => !!(process.env.GUPSHUP_APP_ID && process.env.GUPSHUP_APP_TOKEN);

function postV3(phone: string, json: GupshupJson) {
  return fetch(`https://partner.gupshup.io/partner/app/${env("GUPSHUP_APP_ID")}/v3/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Gupshup's docs name both headers.
      Authorization: env("GUPSHUP_APP_TOKEN"),
      token: env("GUPSHUP_APP_TOKEN"),
    },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, ...json }),
  });
}

function postV1(phone: string, json: GupshupJson) {
  return fetch("https://api.gupshup.io/wa/api/v1/msg", {
    method: "POST",
    headers: { apikey: env("GUPSHUP_API_KEY") },
    body: new URLSearchParams({
      channel: "whatsapp",
      source: env("GUPSHUP_SOURCE"),
      destination: phone,
      "src.name": env("GUPSHUP_APP"),
      message: JSON.stringify(json),
    }),
  });
}

async function clevertap(path: "upload" | "subscribe", body: unknown) {
  const res = await fetch(`https://${process.env.CLEVERTAP_REGION ?? "in1"}.api.clevertap.com/1/${path}`, {
    method: "POST",
    headers: {
      "X-CleverTap-Account-Id": env("CLEVERTAP_ACCOUNT_ID"),
      "X-CleverTap-Passcode": env("CLEVERTAP_PASSCODE"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CleverTap ${res.status}: ${await res.text()}`);
}
const event = (phone: string, evtName: string, evtData: Record<string, unknown>) =>
  clevertap("upload", {
    d: [{ type: "event", identity: identity(phone), evtName, evtData, ts: Math.floor(Date.now() / 1000) }],
  });
const subscribe = (phone: string, status: "Unsubscribe" | "Resubscribe") =>
  clevertap("subscribe", { d: [{ type: "whatsapp", value: identity(phone), status }] });

// ponytail: Gupshup gives "9198…"; whether CleverTap profiles are keyed "+91…" or a custom id is an open question
// (BOT.md). One place to change.
const identity = (phone: string) => "+" + phone.replace(/^\+/, "");

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};
