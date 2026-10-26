// One customer, in glass: their journey dots, last call and Call button in the list, and the drawer card where calls
// are logged. /dashboard's customer.tsx restyled: pills and fields are glass, and nothing inside the sheet is boxed.
import { Fragment, type ReactNode } from "react";
import { segments } from "@/content/flows";
import { logCallV2 } from "@/lib/dashboard/actions-v2";
import {
  shortDate,
  dayOf,
  FLOWS,
  formatRupees,
  formatCount,
  OUTCOMES,
  formatPhone,
  STORE_SHORT_NAMES,
  STAGES,
  stageOf,
  wonBack,
  type Call,
  type Customer,
} from "@/lib/dashboard/data";
import { GHOST, Panel, PRIMARY, RAMP } from "./ui";

// Warm outcomes get colour: ordering the wins' emerald, interested teal.
const TONE: Record<string, string> = {
  ordering: "bg-good/15 text-ink",
  interested: "bg-accent/15 text-ink",
  call_back: "text-ink",
  not_interested: "text-charcoal",
  no_answer: "text-charcoal",
  wrong_number: "text-ink",
  do_not_call: "text-ink",
};

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`liquid-glass-chip inline-block whitespace-nowrap px-2 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

export function Journey({ c }: { c: Customer }) {
  if (c.opted_out) return <Pill className="text-charcoal">Opted out</Pill>;
  if (c.control) return <Pill className="text-charcoal">Control group</Pill>;
  const s = stageOf(c);
  if (s < 0) return <span className="text-charcoal">Not messaged</span>;
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="flex gap-1">
        {STAGES.map((st, i) => (
          <span
            key={st}
            className={`size-2 rounded-full ${i <= s ? "" : "bg-ink/15"}`}
            style={i <= s ? { background: RAMP[i] } : undefined}
          />
        ))}
      </span>
      <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{STAGES[s]}</span>
    </span>
  );
}

const ago = (d: string, today: string) => {
  const n = Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n}d ago`;
};
const when = (at: string) =>
  new Date(at).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export function LastCall({ call, today }: { call?: Call; today: string }) {
  if (!call) return <span className="text-charcoal">–</span>;
  const due = !!call.follow_up && call.follow_up <= today;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="flex items-center gap-1.5">
        <Pill className={TONE[call.outcome] ?? ""}>{OUTCOMES[call.outcome]?.label ?? call.outcome}</Pill>
        <span className="text-xs text-charcoal">{ago(dayOf(call.at), today)}</span>
      </span>
      {call.follow_up && (
        <span className={`text-xs ${due ? "font-semibold text-accent-ink" : "text-charcoal"}`}>
          {due ? `Due ${shortDate(call.follow_up)}` : `Follow up ${shortDate(call.follow_up)}`}
        </span>
      )}
    </span>
  );
}

function Phone() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="currentColor">
      <path d="M3.6 2.2a1.6 1.6 0 0 1 2.1-.2l2 1.5c.6.5.8 1.3.4 2l-.9 1.6a.6.6 0 0 0 .1.7l3 3a.6.6 0 0 0 .7.1l1.6-.9c.7-.4 1.5-.2 2 .4l1.5 2c.5.6.4 1.5-.2 2.1l-1.1 1.1c-.9.9-2.3 1.2-3.5.7-2.3-.9-4.4-2.4-6.2-4.2S2.1 8.2 1.2 5.9c-.5-1.2-.2-2.6.7-3.5z" />
    </svg>
  );
}

// tel: dials from a phone, or from the Mac's phone app over an iPhone. Samples and do-not-call numbers can't be dialled.
export function CallButton({ c, stop, big }: { c: Customer; stop: string; big?: boolean }) {
  const size = big ? "h-11 w-full text-base" : "";
  if (c.sample || stop)
    return (
      <span
        aria-disabled
        className={`${GHOST} ${size} cursor-not-allowed text-charcoal opacity-60`}
        title={c.sample ? "Sample customer: calling is off" : `${stop}: don't call`}
      >
        <Phone /> {big ? (c.sample ? "Sample customer: calling is off" : `Don't call · ${stop}`) : "Call"}
      </span>
    );
  return (
    <a href={`tel:+${c.phone}`} className={`${PRIMARY} ${size}`}>
      <Phone /> Call{big && ` ${formatPhone(c.phone)}`}
    </a>
  );
}

const extraOf = (s: string): Record<string, string> => {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

export function CustomerCard({
  c,
  calls,
  stop,
  close,
  today,
  caller,
}: {
  c: Customer;
  calls: Call[];
  stop: string;
  close: string;
  today: string;
  caller: string;
}) {
  const seg = segments.find((s) => s.n === c.segment);
  const flow = FLOWS.find((x) => x.key === c.flow);
  const s = stageOf(c);
  const dates = [c.sent_at, "", "", "", c.first_order_at, wonBack(c) ? c.second_order_at : ""];
  const extra = Object.entries(extraOf(c.extra));
  return (
    <Panel
      title={c.name || "Unnamed"}
      kicker={[seg && `${seg.n} · ${seg.name}`, STORE_SHORT_NAMES[c.store]].filter(Boolean).join(" · ") || "Customer"}
      sub={formatPhone(c.phone)}
      close={close}
    >
      <CallButton c={c} stop={stop} big />
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Lifetime", c.lifetime_value ? formatRupees(c.lifetime_value) : "–"],
          ["Orders", c.orders ? formatCount(c.orders) : "–"],
          ["Last order", c.last_order ? shortDate(c.last_order) : "–"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-charcoal">{k}</dt>
            <dd className="text-lg font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <section>
        <h3 className="text-sm font-semibold">Journey{flow && ` · flow ${flow.code}`}</h3>
        {flow && <p className="text-sm text-charcoal">{flow.name}</p>}
        {c.opted_out || c.control ? (
          <p className="mt-2 text-sm text-charcoal">
            {c.opted_out ? "Opted out of WhatsApp." : "In the control group: not messaged, so not called either."}
          </p>
        ) : (
          <ol className="mt-3 grid grid-cols-6 gap-1 text-center text-xs">
            {STAGES.map((st, i) => (
              <li key={st} className="flex flex-col items-center gap-1">
                <span
                  aria-hidden
                  className={`h-1.5 w-full rounded-full ${i <= s ? "" : "bg-ink/10"}`}
                  style={i <= s ? { background: RAMP[i] } : undefined}
                />
                <span className={i <= s ? "font-semibold" : "text-charcoal"}>
                  {st}
                  <span className="sr-only">{i <= s ? ", done" : ", not yet"}</span>
                </span>
                {dates[i] && i <= s && <span className="text-charcoal">{shortDate(dates[i])}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Log a call</h3>
        <form action={logCallV2} className="mt-3 space-y-3">
          <input type="hidden" name="phone" value={c.phone} />
          <fieldset>
            <legend className="sr-only">Outcome</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(OUTCOMES).map(([k, o]) => (
                <label key={k} className="cursor-pointer">
                  <input type="radio" name="outcome" value={k} required className="peer sr-only" />
                  <span className="liquid-glass-chip block px-3 py-1 text-sm peer-checked:border-ink peer-checked:bg-ink peer-checked:bg-none peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                    {o.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <textarea
            name="note"
            rows={2}
            maxLength={1000}
            placeholder="What did they say?"
            aria-label="Note"
            className="glass-field block w-full rounded-2xl px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-charcoal">
              Follow up on
              <input
                type="date"
                name="follow_up"
                min={today}
                className="glass-field mt-1 block h-9 w-full rounded-full px-3 text-sm font-normal text-ink"
              />
            </label>
            <label className="text-xs font-semibold text-charcoal">
              Called by
              <input
                name="caller"
                defaultValue={caller}
                maxLength={60}
                placeholder="Your name"
                className="glass-field mt-1 block h-9 w-full rounded-full px-3 text-sm font-normal text-ink"
              />
            </label>
          </div>
          <button className={`${PRIMARY} w-full`}>Save call</button>
        </form>
      </section>
      <section>
        <h3 className="text-sm font-semibold">Calls · {calls.length}</h3>
        {calls.length ? (
          <ol className="mt-2 space-y-3">
            {calls.map((k) => (
              <li key={k.id} className="text-sm">
                <p className="flex flex-wrap items-center gap-x-2">
                  <Pill className={TONE[k.outcome] ?? ""}>{OUTCOMES[k.outcome]?.label ?? k.outcome}</Pill>
                  <span className="text-charcoal">
                    {when(k.at)}
                    {k.caller && ` · ${k.caller}`}
                  </span>
                </p>
                {k.note && <p className="mt-1">{k.note}</p>}
                {k.follow_up && <p className="text-xs text-charcoal">Follow up {shortDate(k.follow_up)}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-charcoal">No calls yet.</p>
        )}
      </section>
      {extra.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">From the import</h3>
          <dl className="mt-2 grid grid-cols-[minmax(0,auto)_1fr] gap-x-4 gap-y-1 text-sm">
            {extra.map(([k, v]) => (
              <Fragment key={k}>
                <dt className="text-charcoal">{k}</dt>
                <dd className="break-words">{v}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      )}
    </Panel>
  );
}
