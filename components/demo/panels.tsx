// The panels around the phone: the segments and their conversations (a row on phones, a list on laptops), and what's
// behind the open conversation, with the Stress test switch and, while presenting, the presenter's path.
import Link from "next/link";
import { flows, segments, sendGates } from "@/content/flows";
import { tour } from "@/content/tour";
import type { Segment } from "@/lib/bot";
import { Icon } from "./icons";

// One accent per deck segment, so each is recognisable at a glance.
const TONE: Record<number, { soft: string; solid: string }> = {
  1: { soft: "bg-rose-100 text-rose-700", solid: "bg-rose-600 text-white" },
  2: { soft: "bg-violet-100 text-violet-700", solid: "bg-violet-600 text-white" },
  3: { soft: "bg-amber-100 text-amber-800", solid: "bg-amber-500 text-white" },
  4: { soft: "bg-sky-100 text-sky-700", solid: "bg-sky-600 text-white" },
  5: { soft: "bg-indigo-100 text-indigo-700", solid: "bg-indigo-600 text-white" },
  6: { soft: "bg-emerald-100 text-emerald-700", solid: "bg-emerald-600 text-white" },
};

const PRIORITY: Record<string, string> = {
  P0: "bg-rose-50 text-rose-700 ring-rose-200",
  P1: "bg-amber-50 text-amber-800 ring-amber-200",
  P2: "bg-slate-100 text-slate-600 ring-slate-200",
};

// The segment a conversation is derived from, and a segment's conversations (its sub-segments) as indexes in `flows`.
const segmentOf = (flowIdx: number) => segments.find((s) => s.n === flows[flowIdx].n)!;
const subSegmentsOf = (n: number) => flows.flatMap((f, i) => (f.n === n ? [i] : []));

// The open conversation, and how to restart the chat on another.
type PanelProps = { flowIdx: number; restart: (flowIdx: number) => void };
type StressProps = { stress: boolean; setStress: (on: boolean) => void };
type ProviderProps = {
  aiProvider: "gemini" | "anthropic";
  setAiProvider: (provider: "gemini" | "anthropic") => void;
  aiModel: string;
  setAiModel: (model: string) => void;
};

// Phones and tablets: the six segments on one row, the chosen segment's sub-segments on the next.
export function SegmentBar({ flowIdx, restart, stress, setStress }: PanelProps & StressProps) {
  const chosen = segmentOf(flowIdx);
  return (
    <div className="shrink-0 border-b border-black/5 bg-white lg:hidden">
      <div className="flex gap-2 overflow-x-auto px-3 pt-2.5">
        {segments.map((segment) => (
          <button
            key={segment.n}
            onClick={() => restart(flows.findIndex((f) => f.n === segment.n))}
            aria-pressed={segment.n === chosen.n}
            className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm ${segment.n === chosen.n ? "bg-[#111b21] text-white" : "bg-[#f0f2f5] text-[#3b4a54]"}`}
          >
            <span
              className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${TONE[segment.n].solid}`}
            >
              {segment.n}
            </span>
            {segment.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2">
        {subSegmentsOf(chosen.n).map((i, k) => (
          <button
            key={i}
            onClick={() => restart(i)}
            aria-pressed={i === flowIdx}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${i === flowIdx ? "bg-[#d9fdd3] font-medium ring-1 ring-[#00a884]/40" : "text-[#54656f] ring-1 ring-black/10"}`}
          >
            <span className="tabular-nums text-[#8696a0]">
              {chosen.n}.{k + 1}
            </span>{" "}
            {flows[i].name}
          </button>
        ))}
        <button onClick={() => restart(flowIdx)} className="shrink-0 px-2 text-xs font-medium text-[#008069]">
          ↻ Replay
        </button>
        <Link href="/dashboard" className="shrink-0 px-2 text-xs font-medium text-[#008069]">
          Dashboard →
        </Link>
        <label className="flex shrink-0 cursor-pointer items-center gap-1 px-1 text-xs text-[#3b4a54]">
          <input
            type="checkbox"
            checked={stress}
            onChange={(e) => setStress(e.target.checked)}
            className="size-3.5 accent-[#008069]"
          />
          Stress test
        </label>
        <span className="shrink-0 text-[10px] text-[#8696a0]">·</span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-[#3b4a54]">AI</span>
      </div>
    </div>
  );
}

const ANTHROPIC_MODELS = [
  { key: "haiku", label: "Haiku" },
  { key: "sonnet", label: "Sonnet" },
  { key: "opus", label: "Opus" },
  { key: "fable", label: "Fable" },
];

// Laptops and up: the six segments, with the chosen one opened to show its sub-segments.
export function SegmentNav({ flowIdx, restart, present }: PanelProps & { present: () => void }) {
  const chosen = segmentOf(flowIdx);
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#008069]">FoodStories · reactivation</p>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={present}
            className="rounded-full bg-[#1c3b2e] px-2.5 py-1 text-xs font-medium text-[#f5e9d3] hover:bg-[#1c3b2e]/90"
          >
            ▶ Present
          </button>
          <Link
            href="/dashboard"
            className="rounded-full px-2.5 py-1 text-xs font-medium text-[#008069] ring-1 ring-[#008069]/30 hover:bg-[#d9fdd3]"
          >
            Dashboard →
          </Link>
        </div>
      </div>
      <h1 className="mt-0.5 text-lg font-semibold leading-snug">WhatsApp conversations</h1>
      <p className="mt-1 text-xs leading-relaxed text-[#667781]">
        The deck&apos;s six segments, each opened into the conversations derived from it.
      </p>
      <nav aria-label="Segments" className="mt-4 space-y-1">
        {segments.map((s) => (
          <SegmentRow key={s.n} segment={s} open={s.n === chosen.n} flowIdx={flowIdx} restart={restart} />
        ))}
      </nav>
    </div>
  );
}

// One segment in the list: its number, name, size and priority; opened, who it's for and its conversations.
function SegmentRow({ segment, open, flowIdx, restart }: PanelProps & { segment: Segment; open: boolean }) {
  const subSegments = subSegmentsOf(segment.n);
  return (
    <div className={`rounded-xl ${open ? "bg-[#f5f7f8] ring-1 ring-black/5" : ""}`}>
      <button
        onClick={() => restart(subSegments[0])}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-[#f5f7f8]"
      >
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${open ? TONE[segment.n].solid : TONE[segment.n].soft}`}
        >
          {segment.n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{segment.name}</span>
          <span className="block text-[11px] text-[#8696a0]">{subSegments.length} conversations</span>
        </span>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${PRIORITY[segment.priority]}`}
        >
          {segment.priority}
        </span>
        <Icon
          name="chevron"
          className={`size-4 shrink-0 text-[#8696a0] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-2.5 pb-2.5">
          <p className="mb-2 ml-10 text-xs leading-relaxed text-[#667781]">{segment.who}</p>
          <ul className="ml-[0.85rem] space-y-0.5 border-l-2 border-[#dfe5e7] pl-3">
            {subSegments.map((i, k) => (
              <li key={i}>
                <button
                  onClick={() => restart(i)}
                  aria-current={i === flowIdx}
                  className={`flex w-full items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${i === flowIdx ? "bg-[#008069] font-medium text-white shadow-sm" : "text-[#3b4a54] hover:bg-white"}`}
                >
                  <span className={`tabular-nums text-[11px] ${i === flowIdx ? "text-white/75" : "text-[#8696a0]"}`}>
                    {segment.n}.{k + 1}
                  </span>
                  {flows[i].name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// The open conversation: its segment, the behaviour and category it's built on, the presenter notes, what CleverTap
// checks before it goes, the Stress test switch and the AI model picker; while presenting, the presenter's stop above
// it all.
export function About({
  flowIdx,
  restart,
  stress,
  setStress,
  aiProvider,
  setAiProvider,
  aiModel,
  setAiModel,
  tourAt,
  present,
}: PanelProps & StressProps & ProviderProps & { tourAt: number | null; present: (at: number | null) => void }) {
  const flow = flows[flowIdx];
  const segment = segmentOf(flowIdx);
  return (
    <section aria-label="About this conversation" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      {tourAt !== null && <PresenterStop at={tourAt} present={present} />}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8696a0]">About this conversation</p>
        <button
          onClick={() => restart(flowIdx)}
          className="rounded-full px-2.5 py-1 text-xs font-medium text-[#008069] ring-1 ring-[#008069]/30 hover:bg-[#008069]/5"
        >
          ↻ Replay
        </button>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${TONE[segment.n].solid}`}
        >
          {segment.n}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] text-[#8696a0]">
            Segment {segment.n} · {segment.priority}
          </p>
          <p className="font-semibold leading-tight">{segment.name}</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#54656f]">{segment.who}</p>
      <div className="mt-4 rounded-xl bg-[#f5f7f8] p-3">
        <p className="text-[11px] text-[#8696a0]">
          Sub-segment {segment.n}.{subSegmentsOf(segment.n).indexOf(flowIdx) + 1}
        </p>
        <p className="text-sm font-semibold">{flow.name}</p>
        <dl className="mt-2.5 space-y-2 text-xs leading-snug">
          <div>
            <dt className="text-[11px] text-[#8696a0]">Past behaviour</dt>
            <dd className="text-[#3b4a54]">{flow.signal}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#8696a0]">Category</dt>
            <dd className="text-[#3b4a54]">{flow.category}</dd>
          </div>
        </dl>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {flow.who.split(" · ").map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#3b4a54] ring-1 ring-black/5"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-[#8696a0]">Why this message</p>
      <ul className="mt-2 space-y-2.5">
        {flow.why.map((reason) => (
          <li key={reason} className="flex gap-2.5 text-[13px] leading-snug text-[#3b4a54]">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#00a884]" />
            {reason}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-[#8696a0]">Sent only if</p>
      <ul className="mt-2 space-y-2">
        {flow.gate.map((check) => (
          <li key={check} className="flex gap-2.5 text-[12px] leading-snug text-[#3b4a54]">
            <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-[#f0a500]" />
            {check}
          </li>
        ))}
        <li className="text-[11px] leading-snug text-[#8696a0]">And for every template: {sendGates.join(". ")}.</li>
      </ul>
      <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-xl bg-[#fff8e6] p-3 text-[12px] leading-snug text-[#3b4a54] ring-1 ring-[#f0a500]/30">
        <input
          type="checkbox"
          checked={stress}
          // No restart: the chat carries on, stress-tested from the next tap or message.
          onChange={(e) => setStress(e.target.checked)}
          className="mt-0.5 size-4 accent-[#008069]"
        />
        <span>
          <b>Stress test.</b> Play what happens when the bot&apos;s check fails (sold out, slot filled, cut-off passed),
          and show what the bot does at each step. Products the AI adds to the basket sell out mid-add too: one product
          sells out entirely, and of two, the first does. Without it, a check that names a product reads its stock live
          from foodstories.shop; slot and cut-off checks pass until those services are wired in.
        </span>
      </label>
      <ProviderPicker {...{ aiProvider, setAiProvider, aiModel, setAiModel }} />
      <p className="mt-5 border-t border-black/5 pt-3 text-[11px] leading-relaxed text-[#8696a0]">
        Products, photos, prices and stores are from foodstories.shop. People are placeholders.
      </p>
    </section>
  );
}

// While presenting: the stop on the presenter's path (content/tour.ts), what to show there, and the way on.
function PresenterStop({ at, present }: { at: number; present: (at: number | null) => void }) {
  const stop = tour[at];
  return (
    <div className="mb-5 rounded-xl bg-[#1c3b2e] p-4 text-[#f5e9d3] shadow-sm">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#f5e9d3]/70">
        <span>
          Presenting · {at + 1} of {tour.length}
        </span>
        <button
          onClick={() => present(null)}
          aria-label="Stop presenting"
          className="rounded-full px-1.5 text-base leading-none hover:bg-white/10"
        >
          ×
        </button>
      </div>
      <p className="mt-1.5 font-semibold leading-snug">{stop.title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#f5e9d3]/90">{stop.say}</p>
      <div className="mt-3 flex items-center gap-2 text-xs font-medium">
        <button
          onClick={() => present(at - 1)}
          disabled={!at}
          className="whitespace-nowrap rounded-full px-3 py-1.5 ring-1 ring-[#f5e9d3]/30 hover:bg-white/10 disabled:opacity-40"
        >
          ← Back
        </button>
        {at < tour.length - 1 ? (
          <button
            onClick={() => present(at + 1)}
            className="whitespace-nowrap rounded-full bg-[#f5e9d3] px-3 py-1.5 text-[#1c3b2e]"
          >
            Next →
          </button>
        ) : (
          <Link href="/dashboard-v2" className="whitespace-nowrap rounded-full bg-[#f5e9d3] px-3 py-1.5 text-[#1c3b2e]">
            Dashboard →
          </Link>
        )}
        <span className="ml-auto whitespace-nowrap text-[11px] text-[#f5e9d3]/60">← → keys</span>
      </div>
    </div>
  );
}

// Which model answers typed text: Claude by default, Gemini's free tier for testing.
function ProviderPicker({ aiProvider, setAiProvider, aiModel, setAiModel }: ProviderProps) {
  return (
    <div className="mt-4 rounded-xl bg-[#f0f8ff] p-3 ring-1 ring-[#008069]/20">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#008069]">AI Provider</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setAiProvider("gemini")}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            aiProvider === "gemini"
              ? "bg-[#008069] text-white shadow-sm"
              : "bg-white text-[#3b4a54] ring-1 ring-black/10 hover:bg-[#f5f7f8]"
          }`}
        >
          Gemini
        </button>
        <button
          onClick={() => setAiProvider("anthropic")}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            aiProvider === "anthropic"
              ? "bg-[#da7756] text-white shadow-sm"
              : "bg-white text-[#3b4a54] ring-1 ring-black/10 hover:bg-[#f5f7f8]"
          }`}
        >
          Anthropic
        </button>
      </div>
      {aiProvider === "anthropic" && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-[#8696a0]">Model</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {ANTHROPIC_MODELS.map((m) => (
              <button
                key={m.key}
                onClick={() => setAiModel(m.key)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  aiModel === m.key
                    ? "bg-[#da7756] text-white shadow-sm"
                    : "bg-white text-[#3b4a54] ring-1 ring-black/10 hover:bg-[#f5f7f8]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[#8696a0]">
            All models run in low-effort mode. Needs ANTHROPIC_API_KEY in .env.local.
          </p>
        </div>
      )}
    </div>
  );
}
