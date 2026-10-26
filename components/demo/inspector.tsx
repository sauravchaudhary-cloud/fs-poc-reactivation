// The message log on the right: one card per tap or typed message, saying whether internal logic or the AI handled it,
// with the AI's calls, tokens and cost. The demo's words for what happened live here too: the log's notes, and the
// stress test's note under each AI answer in the chat.
import { useEffect, useRef, useState, useCallback } from "react";
import { REPLIES } from "@/content/replies";
import type { Answer, Trace } from "@/lib/ai";
import type { Msg, Option } from "@/lib/bot";
import type { Read } from "@/lib/read";
import type { Added } from "@/lib/store";

export type AnthropicApiCall = {
  id: string;
  timestamp: string;
  timeFormatted: string;
  model: string;
  durationMs: number;
  speedTokPerSec: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;
  costFormatted: string;
  stopReason: string;
  tools: string[];
  status: "success" | "error";
  error?: string;
};

export type AnthropicStats = {
  totalCalls: number;
  totalCost: number;
  totalTokens: number;
  totalDurationMs: number;
  avgDurationMs: number;
  avgSpeedTokPerSec: number;
};

// One card in the log: what was tapped or typed, what handled it, and the AI's trace when it was asked.
export type Entry = {
  id: number;
  time: string;
  said: string;
  tapped?: boolean;
  via: "logic" | "ai" | "fallback" | "waiting";
  note: string;
  trace?: Trace;
};

// Why internal logic handled a typed message (`read` in lib/read.ts), in words.
const WHY: Record<Exclude<Read["do"], "ai" | "node" | "tap" | "say">, string> = {
  crisis: "Reads as a crisis: the helpline line, and a person is told.",
  stop: "STOP: unsubscribed in CleverTap, with one confirmation.",
  wrong: "Wrong number: unsubscribed.",
  start: "START: subscribed again.",
  who: "“Who is this?”: says it's FoodStories.",
  escalate: "A legal threat: flagged to the customer-care lead.",
  human: "Asks for a person: handed to customer care.",
  media: "A photo or file: handed to customer care.",
};
export function explain(reading: Read) {
  switch (reading.do) {
    case "node":
      return `It answers a question that asks for typed text, so the flow takes it as written (step “${reading.node}”).`;
    case "tap":
      return `It picks “${reading.option.title}” (the option's own words, or a yes/no to a yes/no question), so it's tapped.`;
    case "say":
      return reading.msg === REPLIES.thanks ? "Thanks, so “You're welcome”." : "Nothing to answer, so a nod.";
    case "ai":
      return "";
    default:
      return WHY[reading.do];
  }
}

// The AI is off or its call failed, so internal logic answered (`fallbackReply` in lib/read.ts): why, and with what.
export function fallbackNote(why: string | undefined, reply: Msg) {
  if (why === "off") return `The AI is off (no API key in .env.local), so internal logic answered: ${fellBack(reply)}.`;
  return `The AI call failed (${failure(why)}), so internal logic answered: ${fellBack(reply)}.`;
}
function fellBack(reply: Msg) {
  if (reply === REPLIES.nudge) return "“could you tap one of the options above?”";
  if (reply === REPLIES.handoff) return "a handoff to customer care";
  if (reply === REPLIES.nod) return "a nod";
  if (reply === REPLIES.thanks) return "“you're welcome”";
  return "a one-line FAQ answer";
}
function failure(why = "") {
  if (/exceeded your current quota/i.test(why)) return "Gemini's free daily quota is used up";
  if (/\b503\b|high demand|overloaded/i.test(why)) return "the model is overloaded";
  if (/timeout|aborted/i.test(why)) return "it timed out";
  if (/\b40[13]\b|api key/i.test(why)) return "the API key was refused";
  return why || "no response";
}

// What the AI did with a typed message, in words.
export function aiNote(answer: Exclude<Answer, { kind: "fail" }>, options: Option[], stress: boolean) {
  switch (answer.kind) {
    case "tap": {
      const also = answer.also ? " It also answered the rest of the message." : "";
      const complaint = answer.complaint ? ` Complaint to customer care: “${answer.complaint}”.` : "";
      return `The AI picked “${options[answer.option]?.title}”, and the flow plays it like a tap.${also}${complaint}`;
    }
    case "handoff":
      return `The AI handed it to customer care: “${answer.summary}”.`;
    case "crisis":
      return "The AI read a crisis: the helpline line, and a person is told.";
    case "escalate":
      return "The AI read a legal threat: escalated to the care lead.";
    case "optout":
      return "The AI read an opt-out: unsubscribed.";
  }
  // A reply: from what add_to_basket, set_reminder or change_store did, or the AI's own.
  if (answer.added) {
    const { added, out, missing } = answer.added;
    const soldOut = out.length
      ? `, ${out.length} sold out ${stress ? "while adding (stress test)" : "at the store"}, and the bot offered the closest in-stock items`
      : "";
    const notSold = missing.length ? `, ${missing.length} not sold here` : "";
    return `The AI called add_to_basket: ${added.length} added${soldOut}${notSold}. The bot wrote the message from what the add returned. Raises WA Basket Add.`;
  }
  if (answer.reminder)
    return `The AI set their basket reminder (set_reminder: ${JSON.stringify(answer.reminder)}), and the bot wrote the confirmation, as for a tap. Raises WA Reminder Set; CleverTap updates the profile.`;
  if (answer.store)
    return `The AI moved them to another store (change_store: ${answer.store}): their basket went too, and the bot wrote what moved. Raises WA Store Change.`;
  const lookedUp = answer.tools.length ? ` after looking up ${[...new Set(answer.tools)].join(" and ")}` : "";
  return `The AI replied${lookedUp}.`;
}

// A card's Add to basket that went through, with no AI call: what the bot added, or found sold out.
export function basketNote(result: Added, stress: boolean) {
  const did = result.added.length
    ? `added ${result.added.map((line) => line.name).join(", ")}`
    : `found ${result.out.join(", ")} sold out${stress ? " (stress test: it sold out mid-add)" : ""} and offered what's in stock instead`;
  return `A tap on Add to basket: the bot ${did}, with no AI call. Raises WA Basket Add.`;
}

// The stress test's note under each AI answer in the chat (`bot` on a Msg): what the bot does with it.

// It picked an open option, so the flow plays it; a complaint that came with it goes to customer care.
export const pickedNote = (title: string, complaint?: string) =>
  `The AI picked “${title}”${complaint ? ` and raises WA Handoff: “${complaint}”` : ""}.`;
// The AI's backstop for what the rules missed: the bot answers with its own line.
export const BACKSTOP_NOTES = {
  crisis: "The AI read a crisis: raises WA Handoff (crisis).",
  escalate: "The AI read a legal threat: raises WA Escalation.",
  optout: "The AI read an opt-out: unsubscribes in CleverTap and raises WA Opt Out.",
};
// A reply, written by the AI or by the bot from what a tool did, or a handoff to customer care.
export function replyNote(answer: Extract<Answer, { kind: "say" | "handoff" }>, stress: boolean) {
  const after = answer.tools?.length ? ` after ${answer.tools.join(", ")}` : "";
  if (answer.kind === "handoff")
    return `The AI handed this to customer care${after}: raises WA Handoff with “${answer.summary}”.`;
  if (answer.added) {
    const soldOut =
      answer.added.out.length && stress
        ? "; stress test: every other product sold out between the search and the add"
        : "";
    return `Written by the bot from what add_to_basket returned${soldOut}. Raises WA Basket Add.`;
  }
  if (answer.reminder) return "Written by the bot after the AI called set_reminder; raises WA Reminder Set.";
  if (answer.store)
    return "Written by the bot from what moved, after the AI called change_store; raises WA Store Change.";
  return `Written by the AI${after}.`;
}
// No answer to play (the AI failed, or picked an option that isn't open), so the rules answered. Nothing to say when
// the AI is simply off.
export const unsentNote = (why?: string) =>
  why === "off" ? undefined : `The AI's answer wasn't sent (${why ?? "no response"}), so the rules answered.`;

const dollars = (n: number) => "$" + (n < 0.01 ? n.toFixed(5) : n.toFixed(4));
// Who handled a card, and the colours of its badge.
const BADGE = {
  logic: { label: "Internal logic", className: "bg-slate-100 text-slate-700" },
  ai: { label: "AI", className: "bg-violet-100 text-violet-700" },
  fallback: { label: "AI failed → internal logic", className: "bg-amber-100 text-amber-800" },
  waiting: { label: "AI · waiting…", className: "animate-pulse bg-violet-100 text-violet-700" },
};

// An AI turn's calls, tokens and cost.
function usage(trace: Trace) {
  if (!trace.calls.length) return "no answer, nothing billed";
  const calls = `${trace.calls.length} call${trace.calls.length === 1 ? "" : "s"}`;
  const { input, output, cacheRead } = trace.tokens;
  const cached = cacheRead ? ` (${cacheRead.toLocaleString()} cached)` : "";
  const tokens = `${input.toLocaleString()} in / ${output.toLocaleString()} out tokens${cached}`;
  const speed = trace.speed ? ` · ${trace.speed} tok/s` : "";
  const cost =
    trace.cost === undefined
      ? "price unknown"
      : dollars(trace.cost) + (trace.free ? " at list price; the free tier bills $0" : "");
  return `${calls} · ${tokens}${speed} · ${cost}`;
}

type InspectorProps = { log: Entry[]; open: boolean | null; setOpen: (open: boolean) => void };

// A collapsible panel on the right: one card per tap or message, saying whether it went to the AI and what that cost.
// Includes a dedicated Anthropic API Tracker tab for tracking all Anthropic API calls, timings, speeds and costs.
export function Inspector({ log, open, setOpen }: InspectorProps) {
  const end = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"chat" | "anthropic">("chat");
  const [anthropicData, setAnthropicData] = useState<{ calls: AnthropicApiCall[]; stats: AnthropicStats } | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchAnthropicLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/anthropic-logs");
      if (res.ok) {
        const data = await res.json();
        setAnthropicData(data);
      }
    } catch (err) {
      console.error("Failed to load Anthropic logs", err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "anthropic") {
      fetchAnthropicLogs();
    }
  }, [tab, fetchAnthropicLogs, log]);

  // Initial load of stats
  useEffect(() => {
    fetchAnthropicLogs();
  }, [fetchAnthropicLogs]);

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear the Anthropic API call logs?")) return;
    try {
      await fetch("/api/anthropic-logs", { method: "DELETE" });
      fetchAnthropicLogs();
    } catch (e) {
      console.error("Failed to clear logs", e);
    }
  };

  useEffect(() => {
    if (tab === "chat") {
      end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [log, tab]);

  const sentToAI = log.filter((entry) => entry.trace);
  const byLogic = log.filter((entry) => entry.via === "logic").length;
  const calls = sentToAI.reduce((n, entry) => n + entry.trace!.calls.length, 0);
  const tokens = sentToAI.reduce((n, entry) => n + entry.trace!.tokens.input + entry.trace!.tokens.output, 0);
  const cost = sentToAI.reduce((n, entry) => n + (entry.trace!.cost ?? 0), 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open the message log"
        className={`fixed right-0 top-1/2 z-30 -translate-y-1/2 rounded-l-xl bg-[#111b21] px-2 py-4 text-xs font-medium text-white shadow-lg [writing-mode:vertical-rl] ${open === null ? "lg:hidden" : open ? "hidden" : ""}`}
      >
        Message log · {log.length}
      </button>
      <aside
        aria-label="Message log"
        className={`fixed inset-y-0 right-0 z-30 w-[min(420px,94vw)] flex-col bg-white shadow-2xl ring-1 ring-black/10 ${open === null ? "hidden lg:flex" : open ? "flex" : "hidden"}`}
      >
        <header className="border-b border-black/5">
          <div className="flex items-start gap-3 p-4 pb-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#008069]">Message log</p>
              <p className="mt-0.5 text-sm font-semibold">Activity & AI Tracker</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Collapse the message log"
              className="rounded-full px-2 py-1 text-lg leading-none text-[#54656f] hover:bg-black/5"
            >
              ›
            </button>
          </div>

          {/* Tab selector */}
          <div className="flex px-4 gap-2">
            <button
              onClick={() => setTab("chat")}
              className={`border-b-2 pb-2 text-xs font-semibold transition-all ${
                tab === "chat"
                  ? "border-[#008069] text-[#008069]"
                  : "border-transparent text-[#667781] hover:text-[#111b21]"
              }`}
            >
              Chat log ({log.length})
            </button>
            <button
              onClick={() => setTab("anthropic")}
              className={`flex items-center gap-1.5 border-b-2 pb-2 text-xs font-semibold transition-all ${
                tab === "anthropic"
                  ? "border-[#da7756] text-[#da7756]"
                  : "border-transparent text-[#667781] hover:text-[#111b21]"
              }`}
            >
              <span className="size-2 rounded-full bg-[#da7756]" />
              Anthropic API {anthropicData?.stats.totalCalls ? `(${anthropicData.stats.totalCalls})` : ""}
            </button>
          </div>
        </header>

        {tab === "chat" ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-black/5 bg-[#fcfdfe] px-4 py-2 text-xs text-[#667781]">
              {byLogic} by internal logic · {sentToAI.length} sent to AI ({calls} model calls, {tokens.toLocaleString()}{" "}
              tokens, {dollars(cost)})
            </div>
            <ol className="flex-1 space-y-3 overflow-y-auto p-4">
              {!log.length && (
                <li className="text-xs text-[#8696a0]">
                  Tap a button or type in the chat: each one shows up here, with whether it went to the AI.
                </li>
              )}
              {log.map((entry) => (
                <LogCard key={entry.id} entry={entry} />
              ))}
              <div ref={end} />
            </ol>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 bg-[#fbfcfc]">
            {/* Top metrics summary cards */}
            <div className="p-3 border-b border-black/5 bg-white space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[#fff8f5] p-2.5 ring-1 ring-[#da7756]/20">
                  <p className="text-[10px] font-semibold uppercase text-[#da7756]">Total API Cost</p>
                  <p className="text-base font-bold text-[#111b21]">{dollars(anthropicData?.stats.totalCost ?? 0)}</p>
                  <p className="text-[10px] text-[#8696a0]">
                    {(anthropicData?.stats.totalTokens ?? 0).toLocaleString()} tokens billed
                  </p>
                </div>
                <div className="rounded-lg bg-[#f5f9ff] p-2.5 ring-1 ring-[#0066cc]/20">
                  <p className="text-[10px] font-semibold uppercase text-[#0066cc]">Avg API Speed</p>
                  <p className="text-base font-bold text-[#111b21]">
                    {anthropicData?.stats.avgSpeedTokPerSec ?? 0} <span className="text-xs font-normal">tok/s</span>
                  </p>
                  <p className="text-[10px] text-[#8696a0]">avg {anthropicData?.stats.avgDurationMs ?? 0} ms / call</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5 text-[11px] text-[#8696a0]">
                  <span>📁 logs/anthropic_api.log</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchAnthropicLogs}
                    disabled={loadingLogs}
                    className="text-[11px] font-medium text-[#da7756] hover:underline"
                  >
                    {loadingLogs ? "Refreshing..." : "↻ Refresh"}
                  </button>
                  <span className="text-black/10">|</span>
                  <button onClick={handleClearLogs} className="text-[11px] font-medium text-rose-600 hover:underline">
                    Clear logs
                  </button>
                </div>
              </div>
            </div>

            {/* List of Anthropic API calls */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {!anthropicData?.calls || anthropicData.calls.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8696a0]">
                  <p className="font-medium text-[#111b21]">No Anthropic calls recorded yet</p>
                  <p className="mt-1">
                    Select Anthropic in the About panel and send a message in the chat to see real-time cost, timings
                    and speed.
                  </p>
                </div>
              ) : (
                anthropicData.calls.map((call) => <AnthropicCallCard key={call.id} call={call} />)
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

// Card for a single Anthropic API call in the tracker
function AnthropicCallCard({ call }: { call: AnthropicApiCall }) {
  const isError = call.status === "error";
  return (
    <div
      className={`rounded-xl bg-white p-3 shadow-sm ring-1 transition-all ${
        isError ? "ring-rose-200 bg-rose-50/20" : "ring-black/5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-md bg-[#fff3ee] px-2 py-0.5 text-[11px] font-semibold text-[#da7756] ring-1 ring-[#da7756]/20">
          {call.model}
        </span>
        <span className="text-[11px] text-[#8696a0] tabular-nums">{call.timeFormatted}</span>
      </div>

      {/* Metrics row: Timing, Speed, Cost */}
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-[#f7f8f9] p-2 text-center text-[11px]">
        <div>
          <span className="block text-[10px] text-[#8696a0]">Timing</span>
          <span className="font-semibold text-[#111b21] tabular-nums">{call.durationMs} ms</span>
        </div>
        <div>
          <span className="block text-[10px] text-[#8696a0]">Speed</span>
          <span className="font-semibold text-[#008069] tabular-nums">{call.speedTokPerSec} tok/s</span>
        </div>
        <div>
          <span className="block text-[10px] text-[#8696a0]">Cost</span>
          <span className="font-semibold text-[#da7756] tabular-nums">{call.costFormatted}</span>
        </div>
      </div>

      {/* Token breakdown */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-[#54656f]">
        <span>
          Tokens: <strong className="text-[#111b21]">{call.tokens.input}</strong> in /{" "}
          <strong className="text-[#111b21]">{call.tokens.output}</strong> out
          {call.tokens.cacheRead > 0 && <span className="text-[#8696a0]"> ({call.tokens.cacheRead} cached)</span>}
        </span>
        <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-[#3b4a54]">
          {call.stopReason}
        </span>
      </div>

      {/* Tools called if any */}
      {call.tools && call.tools.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {call.tools.map((t, idx) => (
            <span
              key={idx}
              className="inline-flex items-center rounded bg-[#e8f5e9] px-1.5 py-0.5 text-[10px] font-medium text-[#2e7d32]"
            >
              🛠️ {t}
            </span>
          ))}
        </div>
      )}

      {isError && call.error && <p className="mt-2 rounded bg-rose-50 p-2 text-[11px] text-rose-700">{call.error}</p>}
    </div>
  );
}

// One card: what was tapped or typed, what handled it and why, and for the AI, its cost and what went back and forth.
function LogCard({ entry }: { entry: Entry }) {
  const { trace } = entry;
  return (
    <li className="rounded-xl p-3 ring-1 ring-black/10">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[entry.via].className}`}>
          {BADGE[entry.via].label}
        </span>
        <span className="text-[11px] text-[#8696a0]">{entry.time}</span>
      </div>
      <p className="mt-2 text-[13px]">
        <span className="text-[#8696a0]">{entry.tapped ? "Tapped" : "Typed"}: </span>“{entry.said}”
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[#3b4a54]">{entry.note}</p>
      {trace && (
        <p className="mt-2 rounded-md bg-[#f5f7f8] px-2 py-1 text-[11px] leading-snug text-[#3b4a54]">
          {trace.model} · {(trace.ms / 1000).toFixed(1)} s · {usage(trace)}
        </p>
      )}
      {trace && <TraceDetails trace={trace} />}
    </li>
  );
}

// What went to the AI, and what came back: the prompt, then each call, with what its tools returned.
function TraceDetails({ trace }: { trace: Trace }) {
  return (
    <details className="mt-2 text-[12px] [overflow-wrap:anywhere]">
      <summary className="cursor-pointer font-medium text-[#008069]">What went to the AI, and what came back</summary>
      <p className="mt-2 text-[11px] text-[#8696a0]">Sent, with the system prompt and the tool definitions:</p>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-[#f5f7f8] p-2 text-[11px] leading-snug">
        {trace.prompt}
      </pre>
      <ol className="mt-2 space-y-1.5">
        {trace.calls.map((call, i) => (
          <li key={i} className="leading-snug">
            <span className="font-medium">Call {i + 1}</span>
            <span className="text-[#8696a0]">
              {" "}
              · {(call.ms / 1000).toFixed(1)} s{call.speed ? ` (${call.speed} tok/s)` : ""}
              {call.cost !== undefined ? ` · ${dollars(call.cost)}` : ""}
              {" · "}
              {call.tokens.input.toLocaleString()} in / {call.tokens.output.toLocaleString()} out
              {call.tokens.cacheRead ? ` (${call.tokens.cacheRead.toLocaleString()} cached)` : ""}
              {call.key ? ` · ${call.model} · key ${call.key}` : ` · ${call.model}`}:{" "}
            </span>
            {call.tools.map((tool) => `${tool.name}(${JSON.stringify(tool.input)})`).join(", ") ||
              call.text ||
              call.stop}
            {trace.results
              .filter((result) => result.call === i)
              .map((result, j) => (
                <span key={j} className="mt-0.5 block pl-3 text-[#54656f]">
                  → {result.tool}: {result.summary}
                </span>
              ))}
          </li>
        ))}
      </ol>
      {trace.error && <p className="mt-2 text-rose-700">Error: {trace.error.replace(/^(Error:\s*)+/, "")}</p>}
    </details>
  );
}
