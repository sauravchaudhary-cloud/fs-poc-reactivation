"use client";
// The clickable WhatsApp demo at / (app/page.tsx): the phone, its panels and the message log, and the chat's state
// machine. It mirrors the webhook (lib/whatsapp.ts) in the browser: taps play the flow; typed text goes to the rules,
// then the AI.

import { use, useEffect, useEffectEvent, useRef, useState } from "react";
import { Message, OptionSheet, type Item, type Sheet } from "@/components/demo/chat";
import { Icon } from "@/components/demo/icons";
import {
  aiNote,
  BACKSTOP_NOTES,
  basketNote,
  explain,
  fallbackNote,
  Inspector,
  pickedNote,
  replyNote,
  stockNote,
  unsentNote,
  type Entry,
  type StockCheck,
} from "@/components/demo/inspector";
import { About, SegmentBar, SegmentNav } from "@/components/demo/panels";
import { flows } from "@/content/flows";
import { ADD_TO_BASKET, disclose, notAdded, REPLIES } from "@/content/replies";
import { tour } from "@/content/tour";
import type { Answer, Trace, ChatLine, ProviderConfig } from "@/lib/ai";
import { boldText, choicesOf, fillPlaceholders, flowCode, optionsOf, type Msg, type Option } from "@/lib/bot";
import { clean } from "@/lib/guardrails";
import { fallbackReply, read, type Read } from "@/lib/read";

type ChatAnswer = Answer & { trace?: Trace }; // what app/api/chat returns
type Choice = Option & { card?: string }; // an option, with the card it sits on (`optionsOf` in lib/bot.ts)

const TEMPLATE_DELAY_MS = 600; // the template lands a moment after the chat opens
// Before each message the bot types for a moment, longer for a longer message, up to a cap.
const TYPING_BASE_MS = 600;
const TYPING_MS_PER_CHAR = 12;
const TYPING_MAX_EXTRA_MS = 1400;
const HISTORY_LENGTH = 12; // the AI reads the chat's last dozen messages

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// The keys that move the presenter along: a clicker's page keys, or the arrows.
const TOUR_KEYS: Record<string, number> = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 };
const typingDelay = (text: string) => TYPING_BASE_MS + Math.min(text.length * TYPING_MS_PER_CHAR, TYPING_MAX_EXTRA_MS);

// Demo clock: starts at 10:30 am, inside the deck's 09:00–20:00 WhatsApp window, then runs in real time.
const demoNow = () => new Date(new Date().setHours(10, 30, 0, 0) + performance.now());
function clock() {
  const now = demoNow();
  const hours = now.getHours();
  return `${hours % 12 || 12}:${String(now.getMinutes()).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}

// A message from the flow: not the customer's, the AI's or one of the bot's own lines.
const isFlowMessage = (item: Item) => !item.me && !item.src;

// The bot's own line for each rule that settles typed text by itself (`read` in lib/read.ts).
const RULE_REPLIES: Record<Exclude<Read["do"], "ai" | "node" | "tap" | "say">, Msg> = {
  crisis: REPLIES.crisis,
  stop: REPLIES.stopped,
  wrong: REPLIES.wrong,
  start: REPLIES.welcome,
  who: REPLIES.who,
  escalate: REPLIES.escalated,
  human: REPLIES.human,
  media: REPLIES.media,
};
// The bot's own line for what the AI caught that the rules missed: an opt-out, a crisis or a legal threat.
function backstopReply(answer: Extract<Answer, { kind: "crisis" | "escalate" | "optout" }>) {
  if (answer.kind === "optout") return answer.wrong ? REPLIES.wrong : REPLIES.stopped;
  return answer.kind === "crisis" ? REPLIES.crisis : REPLIES.escalated;
}

// A chat message as the AI reads it: whether it was a tap, and the link, cards and options it carried.
function toTurn(item: Item): ChatLine {
  const { msg } = item;
  const options = optionsOf(msg);
  return {
    who: item.me ? "customer" : "us",
    text:
      (item.quote ? "[tapped] " : "") +
      msg.text +
      (msg.link ? ` [${msg.link.label}: ${msg.link.url}]` : "") +
      (msg.cards ? ` [cards: ${msg.cards.map((c) => c.text.replace(/\n/g, " ")).join(" | ")}]` : "") +
      (options.length ? ` [options: ${options.map((o) => o.title).join(" | ")}]` : ""),
  };
}

// A flow by its key or its code (/?flow=2.1 opens 2.1); the first flow for anything else.
const flowIndex = (wanted: unknown) =>
  Math.max(
    flows.findIndex((flow) => flow.key === wanted || flowCode(flow) === wanted),
    0,
  );

// The demo's endpoint (app/api/chat): the AI for typed text, a card's Add to basket, or a tap's stock check. Null if
// the call fails.
function postChat<T = ChatAnswer>(body: object, providerConfig?: ProviderConfig): Promise<T | null> {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...body,
      ...(providerConfig && { provider: providerConfig.provider, model: providerConfig.model }),
    }),
  })
    .then((res) => res.json())
    .catch(() => null);
}

// ?flow=2.1 opens that conversation; ?dev shows the log's file and Clear logs, kept out of a presentation.
export function Demo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = use(searchParams);
  const dev = query.dev !== undefined;
  const [flowIdx, setFlowIdx] = useState(() => flowIndex(query.flow));
  const [tourAt, setTourAt] = useState<number | null>(null); // the presenter's stop in content/tour.ts, while presenting
  const [restarts, setRestarts] = useState(0); // bumped by every restart, so the template lands again
  const [items, setItems] = useState<Item[]>([]);
  const [typing, setTyping] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [picked, setPicked] = useState<Option | null>(null);
  const [draft, setDraft] = useState("");
  const [stress, setStress] = useState(false); // play the fallbacks, and show what the bot does
  const [aiProvider, setAiProvider] = useState<"gemini" | "anthropic">("anthropic");
  const [aiModel, setAiModel] = useState("haiku");
  const [log, setLog] = useState<Entry[]>([]);
  const [logOpen, setLogOpen] = useState<boolean | null>(null);
  const [store, setStore] = useState<string>(); // the store they moved to in this chat (change_store); else the flow's
  const lastEntryId = useRef(0);
  const failedNodes = useRef(new Set<string>()); // nodes whose fallback has already played this run
  const run = useRef(0); // bumped on restart so a half-played reply stops
  const typingSince = useRef<number | null>(null); // when the dots went up for a call to app/api/chat
  const chat = useRef<HTMLDivElement>(null);
  const flow = flows[flowIdx];

  // The template lands a moment after the chat opens.
  useEffect(() => {
    const timer = setTimeout(() => setItems([{ msg: flows[flowIdx].start, time: clock() }]), TEMPLATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [flowIdx, restarts]);

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: "smooth" });
  }, [items, typing]);

  // A new card in the message log. Returns its id, to update the card once the answer is in.
  function addEntry(entry: Omit<Entry, "id" | "time">) {
    lastEntryId.current += 1;
    const id = lastEntryId.current;
    setLog((prev) => [...prev, { ...entry, id, time: clock() }]);
    return id;
  }
  function updateEntry(id: number, changes: Partial<Entry>) {
    setLog((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
  }
  function noteMore(id: number, more: string) {
    setLog((prev) => prev.map((entry) => (entry.id === id ? { ...entry, note: `${entry.note} ${more}` } : entry)));
  }

  function restart(nextFlowIdx: number) {
    run.current++;
    typingSince.current = null;
    failedNodes.current.clear();
    setFlowIdx(nextFlowIdx);
    setRestarts((n) => n + 1);
    setItems([]);
    setTyping(false);
    setSheet(null);
    setDraft("");
    setLog([]);
    setStore(undefined);
  }

  // The presenter's path (content/tour.ts): each stop opens its conversation, with the Stress test as it needs and its
  // question typed, ready to send. Null ends it.
  function present(at: number | null) {
    setTourAt(at);
    if (at === null) return;
    const stop = tour[at];
    restart(flowIndex(stop.flow));
    setStress(!!stop.stress);
    setDraft(stop.type ?? "");
  }
  // While presenting, a clicker or the arrow keys move along the path (not while typing), and Escape ends it.
  const onPresenterKey = useEffectEvent((e: KeyboardEvent) => {
    if (tourAt === null || e.target instanceof HTMLInputElement) return;
    if (e.key === "Escape") return present(null);
    if (!TOUR_KEYS[e.key]) return;
    e.preventDefault();
    present(Math.min(Math.max(tourAt + TOUR_KEYS[e.key], 0), tour.length - 1));
  });
  useEffect(() => {
    window.addEventListener("keydown", onPresenterKey);
    return () => window.removeEventListener("keydown", onPresenterKey);
  }, []);

  // The bot's messages, one at a time after it types for a moment, with the copy's {choice} and {item} filled in.
  // When the dots went up for a call to app/api/chat, that wait was the typing: the answer shows as soon as it's in.
  // A restart meanwhile stops them.
  async function play(msgs: Msg[], choice: string, item = choice, src?: Item["src"]) {
    const runId = run.current;
    let since = typingSince.current ?? performance.now();
    typingSince.current = null;
    setTyping(true);
    for (const msg of msgs) {
      await sleep(Math.max(0, typingDelay(msg.text) - (performance.now() - since)));
      if (runId !== run.current) return;
      setItems((prev) => [
        ...prev,
        { msg: { ...msg, text: fillPlaceholders(msg.text, choice, item, demoNow()) }, time: clock(), src },
      ]);
      since = performance.now();
    }
    setTyping(false);
  }

  // A tap, or typed text that picked an option: the node it leads to, with {item} from its card when it's on one.
  // Stress test: the first time a node with a tap-time check is reached, the check fails and its fallback plays.
  // Otherwise a check that names products (`needs.stock`) reads their stock live at the store, and the log's newest
  // card says what it found.
  async function playOption(option: Choice, item = (option.card && boldText(option.card)) || option.title) {
    const node = flow.nodes[option.next];
    const needs = node[0].needs;
    let fails = stress && !!needs && !failedNodes.current.has(option.next);
    if (fails) failedNodes.current.add(option.next);
    else if (needs?.stock) {
      const runId = run.current;
      const entryId = lastEntryId.current;
      setTyping(true);
      typingSince.current = performance.now();
      const found = await postChat<StockCheck>({ flow: flow.key, check: option.next, store });
      if (runId !== run.current) return;
      fails = !!found?.out?.length;
      noteMore(entryId, stockNote(found));
    }
    return play(fails ? flow.nodes[needs!.else] : node, option.title, item);
  }

  // A tap on a reply button, a list row or a card's button.
  function tap(option: Option, from: Msg) {
    const quote = from.header ?? from.text;
    if (option.next === "ask") return send(option.title, quote); // the AI's suggested reply: as if they'd typed it
    if (option.next.startsWith("add:")) return addTap(option.next.slice("add:".length), from);
    addEntry({
      said: option.title,
      tapped: true,
      via: "logic",
      note: "A tap: the flow plays its next step, with no AI call.",
    });
    setSheet(null);
    setItems((prev) => [
      ...prev,
      { me: true, msg: { text: option.title, footer: option.description }, quote, time: clock() },
    ]);
    playOption(option, boldText(from.text) ?? option.title);
  }

  // A card's "Add to basket": the bot adds it there and then, with no AI call (app/api/chat, as lib/whatsapp.ts does).
  async function addTap(productKey: string, from: Msg) {
    if (typing) return;
    setItems((prev) => [...prev, { me: true, msg: { text: ADD_TO_BASKET }, quote: from.text, time: clock() }]);
    const entryId = addEntry({
      said: ADD_TO_BASKET,
      tapped: true,
      via: "logic",
      note: "A tap on Add to basket: the bot adds it, with no AI call…",
    });
    const runId = run.current;
    setTyping(true);
    typingSince.current = performance.now();
    const answer = await postChat({ flow: flow.key, add: productKey, store, stress }, providerConfig);
    if (runId !== run.current) return;
    if (answer?.kind !== "say" || !answer.added) {
      updateEntry(entryId, {
        note: "A tap on Add to basket: the add didn't go through, so the bot sent the product's page.",
      });
      return play([notAdded(productKey)], ADD_TO_BASKET, ADD_TO_BASKET, "rule");
    }
    updateEntry(entryId, { note: basketNote(answer.added, stress) });
    play([answer.msg, ...(answer.more ?? [])], ADD_TO_BASKET, ADD_TO_BASKET, "rule");
  }

  // Typed text, read the way the bot reads it (`read` in lib/read.ts): STOP and friends, the node a question asked for,
  // a short yes/no as a tap; what the rules can't settle goes to the AI.
  async function send(typed = draft, quote?: string) {
    const text = clean(typed);
    if (!text || typing) return;
    if (typed === draft) setDraft("");
    setItems((prev) => [...prev, { me: true, msg: { text }, quote, time: clock() }]);
    // It answers the newest flow message, unless the bot has said something else since (`aside`).
    const askedAt = items.findLastIndex(isFlowMessage);
    const asked = items[askedAt]?.msg;
    const aside = items.slice(askedAt + 1).some((item) => !item.me);
    const reading = read(text, false, flow, asked, aside); // false: typed, not a photo or a file
    if (reading.do === "ai") return askAI(text, asked);
    addEntry({ said: text, via: "logic", note: explain(reading) });
    if (reading.do === "node") return play(flow.nodes[reading.node], text);
    if (reading.do === "tap") return playOption(reading.option);
    if (reading.do === "say") return play([reading.msg], text, text, "rule");
    return play([RULE_REPLIES[reading.do]], text, text, "rule");
  }

  // Nothing in the rules settles it: the AI answers (app/api/chat), the log says what it did, and its answer plays.
  // When it's off or its answer fails a check, the rules answer instead: a one-line answer or a person.
  async function askAI(text: string, asked?: Msg) {
    const runId = run.current;
    const options = choicesOf(flow, asked);
    const history = items.slice(-HISTORY_LENGTH).map(toTurn);
    setTyping(true);
    typingSince.current = performance.now();
    const entryId = addEntry({
      said: text,
      via: "waiting",
      note: "Nothing in the rules settles it, so it's sent to the AI…",
    });
    const answer = await postChat({ flow: flow.key, text, history, options, store, stress }, providerConfig);
    if (runId !== run.current) return;
    if (answer?.kind === "say" && answer.store) setStore(answer.store);
    const rulesReply = fallbackReply(text, asked);
    if (!answer || answer.kind === "fail")
      updateEntry(entryId, { via: "fallback", trace: answer?.trace, note: fallbackNote(answer?.why, rulesReply) });
    else updateEntry(entryId, { via: "ai", trace: answer.trace, note: aiNote(answer, options, stress) });
    return playAnswer(answer, text, options, rulesReply);
  }

  // The AI's answer, or the rules' when there's none to play, each with the stress test's note on what the bot does.
  async function playAnswer(answer: ChatAnswer | null, text: string, options: Choice[], rulesReply: Msg) {
    const told = items.some((item) => item.src === "ai"); // the chat's first AI answer says what it is
    if (answer?.kind === "tap" && options[answer.option]) {
      const option = options[answer.option];
      const runId = run.current;
      await playOption(option);
      if (runId !== run.current) return; // restarted while the option played: its extra line belongs to the old chat
      if (answer.also) {
        const also = told ? answer.also : disclose(answer.also);
        play([{ ...also, bot: pickedNote(option.title, answer.complaint) }], text, text, "ai");
      }
      return;
    }
    if (answer?.kind === "crisis" || answer?.kind === "escalate" || answer?.kind === "optout")
      return play([{ ...backstopReply(answer), bot: BACKSTOP_NOTES[answer.kind] }], text, text, "rule");
    if (answer?.kind === "say" || answer?.kind === "handoff") {
      const msg = told ? answer.msg : disclose(answer.msg);
      const more = answer.kind === "say" ? (answer.more ?? []) : [];
      return play([{ ...msg, bot: replyNote(answer, stress) }, ...more], text, text, "ai");
    }
    const why = answer?.kind === "fail" ? answer.why : undefined;
    play([{ ...rulesReply, bot: unsentNote(why) }], text, text, "rule");
  }

  function openSheet(title: string, options: Option[], from: Msg, section?: string) {
    setPicked(null);
    setSheet({ title, section, options, from });
  }

  // Only the newest flow message is tappable, once it has finished arriving: an AI answer or a rule's line after it
  // leaves its options open, as WhatsApp does.
  const live = typing ? -1 : items.findLastIndex(isFlowMessage);
  // Room for the open message log, where the page is wide enough.
  const logRoom = logOpen === false ? "" : "2xl:pr-[404px]";
  const providerConfig: ProviderConfig = { provider: aiProvider, model: aiModel };
  const about = (
    <About
      flowIdx={flowIdx}
      restart={restart}
      stress={stress}
      setStress={setStress}
      aiProvider={aiProvider}
      setAiProvider={setAiProvider}
      aiModel={aiModel}
      setAiModel={setAiModel}
      tourAt={tourAt}
      present={present}
    />
  );

  return (
    <main
      className={`flex h-dvh flex-col bg-[#eef1f3] text-[#111b21] lg:flex-row lg:items-center lg:justify-center lg:gap-8 lg:p-6 xl:gap-10 ${logRoom}`}
    >
      <SegmentBar flowIdx={flowIdx} restart={restart} stress={stress} setStress={setStress} />

      {/* Laptops and up: the six segments, with the chosen one opened to show its sub-segments */}
      <aside className="hidden max-h-full w-80 shrink-0 space-y-4 overflow-y-auto lg:block">
        <SegmentNav flowIdx={flowIdx} restart={restart} present={() => present(0)} />
        <div className="xl:hidden">{about}</div>
      </aside>

      <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#efeae2] text-[15px] lg:h-[min(800px,calc(100dvh_-_3rem))] lg:w-[380px] lg:flex-none lg:rounded-[2.75rem] lg:border-[10px] lg:border-[#111] lg:shadow-2xl">
        <div className="relative hidden items-center justify-between bg-[#008069] px-6 pt-2 text-xs font-medium text-white lg:flex">
          <span>10:30</span>
          <span className="absolute left-1/2 top-1.5 size-3.5 -translate-x-1/2 rounded-full bg-black" />
          <span className="flex gap-1">
            <Icon name="signal" className="size-3.5" />
            <Icon name="wifi" className="size-3.5" />
            <Icon name="battery" className="size-3.5" />
          </span>
        </div>
        <header className="flex items-center gap-2 bg-[#008069] px-2 py-2.5 text-white">
          <Icon name="back" />
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1c3b2e] text-sm font-semibold text-[#f5e9d3]">
            FS
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="font-medium">FoodStories</p>
            <p className="text-xs text-white/80">{typing ? "typing…" : "online"}</p>
          </div>
          <Icon name="video" className="mx-1.5 size-6" />
          <Icon name="call" className="mx-1.5 size-5" />
          <Icon name="more" />
        </header>

        <div ref={chat} role="log" className="flex flex-1 flex-col overflow-y-auto px-3 pb-2">
          <p className="mx-auto mt-3 rounded-md bg-white px-2.5 py-1 text-xs text-[#54656f] shadow-sm">Today</p>
          <p className="mx-auto mt-2 max-w-[90%] rounded-md bg-[#ffeecd] px-3 py-1.5 text-center text-xs text-[#54656f]">
            This business uses a secure service from Meta to manage this chat. Tap to learn more.
          </p>
          {items.map((item, i) => (
            <Message
              key={i}
              item={item}
              firstInRun={i === 0 || !items[i - 1].me !== !item.me}
              closed={i !== live}
              typing={typing}
              stress={stress}
              onReply={tap}
              onSheet={openSheet}
            />
          ))}
          {typing && (
            <div className="mt-3 flex gap-1 self-start rounded-lg rounded-tl-none bg-white px-3 py-3 shadow-sm">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="size-1.5 animate-bounce rounded-full bg-[#8696a0]"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-1.5 p-1.5"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 text-[#54656f] shadow-sm">
            <Icon name="emoji" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message"
              aria-label="Message"
              className="min-w-0 flex-1 bg-transparent text-base text-[#111b21] outline-none placeholder:text-[#8696a0]"
            />
            <Icon name="attach" className="size-6 rotate-45" />
            {!draft && <Icon name="camera" />}
          </div>
          <button
            aria-label={draft ? "Send" : "Voice message"}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-[#00a884] text-white"
          >
            <Icon name={draft ? "send" : "mic"} />
          </button>
        </form>

        {sheet && (
          <OptionSheet sheet={sheet} picked={picked} onPick={setPicked} onClose={() => setSheet(null)} onSend={tap} />
        )}
      </div>

      <aside className="hidden max-h-full w-80 shrink-0 overflow-y-auto xl:block">{about}</aside>
      <Inspector log={log} open={logOpen} setOpen={setLogOpen} dev={dev} />
    </main>
  );
}
