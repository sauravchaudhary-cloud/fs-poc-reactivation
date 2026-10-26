// One customer: their journey dots, last call and Call button in the list, and the drawer card where calls are logged.
import { Fragment, type ReactNode } from "react";
import { GHOST, Panel, PRIMARY, RAMP } from "@/components/dashboard/ui";
import { segments } from "@/content/flows";
import { logCall } from "@/lib/dashboard/actions";
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
  stopReason,
  wonBack,
  type Call,
  type Customer,
} from "@/lib/dashboard/data";

const DAY_MS = 86_400_000;
const SAMPLE_OFF = "Sample customer: calling is off";

const TONE: Record<string, string> = {
  ordering: "bg-good-tint text-good",
  interested: "bg-gold-tint text-gold-ink",
  call_back: "bg-surface text-ink",
  not_interested: "bg-surface text-charcoal",
  no_answer: "bg-surface text-charcoal",
  wrong_number: "bg-surface text-ink",
  do_not_call: "bg-surface text-ink",
};

type PillProps = { className: string; children: ReactNode };

function Pill({ className, children }: PillProps) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

// A call's outcome; one the dashboard no longer knows shows as it was saved.
function Outcome({ outcome }: { outcome: string }) {
  return <Pill className={TONE[outcome] ?? "bg-surface"}>{OUTCOMES[outcome]?.label ?? outcome}</Pill>;
}

// Stages reached take their step of the ramp; the rest stay grey.
const stageColor = (i: number, reached: number) => (i <= reached ? RAMP[i] : "var(--color-rule)");

// In the list: a dot per stage, the furthest one named.
export function Journey({ customer }: { customer: Customer }) {
  if (customer.opted_out) return <Pill className="bg-surface text-charcoal">Opted out</Pill>;
  if (customer.control) return <Pill className="bg-surface text-charcoal">Control group</Pill>;
  const stage = stageOf(customer);
  if (stage < 0) return <span className="text-charcoal">Not messaged</span>;
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="flex gap-1">
        {STAGES.map((name, i) => (
          <span key={name} className="size-2 rounded-full" style={{ background: stageColor(i, stage) }} />
        ))}
      </span>
      <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{STAGES[stage]}</span>
    </span>
  );
}

// "today", "yesterday" or "5d ago", between two YYYY-MM-DD days.
function ago(date: string, today: string) {
  const days = Math.round((Date.parse(today) - Date.parse(date)) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

// When a call was made, in India: "21 Oct, 10:30 am".
const callTime = (at: string) =>
  new Date(at).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

type LastCallProps = { call?: Call; today: string };

// In the list: how the last call went and when, and its follow-up, in wine once it's due.
export function LastCall({ call, today }: LastCallProps) {
  if (!call) return <span className="text-charcoal">–</span>;
  const due = !!call.follow_up && call.follow_up <= today;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="flex items-center gap-1.5">
        <Outcome outcome={call.outcome} />
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

function PhoneIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="currentColor">
      <path d="M3.6 2.2a1.6 1.6 0 0 1 2.1-.2l2 1.5c.6.5.8 1.3.4 2l-.9 1.6a.6.6 0 0 0 .1.7l3 3a.6.6 0 0 0 .7.1l1.6-.9c.7-.4 1.5-.2 2 .4l1.5 2c.5.6.4 1.5-.2 2.1l-1.1 1.1c-.9.9-2.3 1.2-3.5.7-2.3-.9-4.4-2.4-6.2-4.2S2.1 8.2 1.2 5.9c-.5-1.2-.2-2.6.7-3.5z" />
    </svg>
  );
}

type CallButtonProps = {
  customer: Customer;
  stop: string; // why they can't be called, or ""
  big?: boolean; // the card's full-width button, which says why when calling is off
};

// tel: dials from a phone, or from the Mac's phone app over an iPhone. Samples and do-not-call numbers can't be dialled.
export function CallButton({ customer, stop, big }: CallButtonProps) {
  const size = big ? "h-11 w-full text-base" : "";
  if (customer.sample || stop) {
    const title = customer.sample ? SAMPLE_OFF : `${stop}: don't call`;
    const reason = customer.sample ? SAMPLE_OFF : `Don't call · ${stop}`;
    return (
      <span aria-disabled className={`${GHOST} ${size} cursor-not-allowed text-charcoal opacity-60`} title={title}>
        <PhoneIcon /> {big ? reason : "Call"}
      </span>
    );
  }
  return (
    <a href={`tel:+${customer.phone}`} className={`${PRIMARY} ${size}`}>
      <PhoneIcon /> Call{big && ` ${formatPhone(customer.phone)}`}
    </a>
  );
}

type CardProps = {
  customer: Customer;
  calls: Call[]; // newest first
  closeHref: string;
  today: string;
  caller: string; // the name this browser last logged a call under, to prefill "Called by"
};

// The drawer card: who they are, a Call button, their journey, the call form, the calls so far and imported extras.
export function CustomerCard({ customer, calls, closeHref, today, caller }: CardProps) {
  const segment = segments.find((s) => s.n === customer.segment);
  // "2 · Past gift buyers · Gurugram", or as much of it as is known
  const kicker =
    [segment && `${segment.n} · ${segment.name}`, STORE_SHORT_NAMES[customer.store]].filter(Boolean).join(" · ") ||
    "Customer";
  return (
    <Panel title={customer.name || "Unnamed"} kicker={kicker} sub={formatPhone(customer.phone)} closeHref={closeHref}>
      <CallButton customer={customer} stop={stopReason(customer, calls[0])} big />
      <Facts customer={customer} />
      <JourneyDetail customer={customer} />
      <CallForm phone={customer.phone} today={today} caller={caller} />
      <CallHistory calls={calls} />
      <Extras json={customer.extra} />
    </Panel>
  );
}

// Their history before they went quiet.
function Facts({ customer }: { customer: Customer }) {
  const facts = [
    ["Lifetime", customer.lifetime_value ? formatRupees(customer.lifetime_value) : "–"],
    ["Orders", customer.orders ? formatCount(customer.orders) : "–"],
    ["Last order", customer.last_order ? shortDate(customer.last_order) : "–"],
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {facts.map(([term, value]) => (
        <div key={term} className="rounded-lg bg-surface px-2 py-2.5">
          <dt className="text-xs text-charcoal">{term}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// The flow they were sent and how far they got.
function JourneyDetail({ customer }: { customer: Customer }) {
  const flow = FLOWS.find((f) => f.key === customer.flow);
  return (
    <section>
      <h3 className="text-sm font-semibold">Journey{flow && ` · flow ${flow.code}`}</h3>
      {flow && <p className="text-sm text-charcoal">{flow.name}</p>}
      <Stages customer={customer} />
    </section>
  );
}

// Every stage, the ones reached in the ramp's colours with their day where the export has one.
function Stages({ customer }: { customer: Customer }) {
  if (customer.opted_out) return <p className="mt-2 text-sm text-charcoal">Opted out of WhatsApp.</p>;
  if (customer.control)
    return <p className="mt-2 text-sm text-charcoal">In the control group: not messaged, so not called either.</p>;
  const stage = stageOf(customer);
  // Only Messaged, Came back and Won back have a day; a second order counts only within 45 days.
  const dates = [
    customer.sent_at,
    "",
    "",
    "",
    customer.first_order_at,
    wonBack(customer) ? customer.second_order_at : "",
  ];
  return (
    <ol className="mt-3 grid grid-cols-6 gap-1 text-center text-xs">
      {STAGES.map((name, i) => {
        const reached = i <= stage;
        return (
          <li key={name} className="flex flex-col items-center gap-1">
            <span aria-hidden className="h-1.5 w-full rounded-full" style={{ background: stageColor(i, stage) }} />
            <span className={reached ? "font-semibold" : "text-charcoal"}>
              {name}
              <span className="sr-only">{reached ? ", done" : ", not yet"}</span>
            </span>
            {dates[i] && reached && <span className="text-charcoal">{shortDate(dates[i])}</span>}
          </li>
        );
      })}
    </ol>
  );
}

type CallFormProps = { phone: string; today: string; caller: string };

function CallForm({ phone, today, caller }: CallFormProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold">Log a call</h3>
      <form action={logCall} className="mt-3 space-y-3">
        <input type="hidden" name="phone" value={phone} />
        <fieldset>
          <legend className="sr-only">Outcome</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(OUTCOMES).map(([key, outcome]) => (
              <label key={key} className="cursor-pointer">
                <input type="radio" name="outcome" value={key} required className="peer sr-only" />
                <span className="block rounded-full border border-rule px-3 py-1 text-sm peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {outcome.label}
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
          className="block w-full rounded-lg border border-rule px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-charcoal">
            Follow up on
            <input
              type="date"
              name="follow_up"
              min={today}
              className="mt-1 block h-9 w-full rounded-lg border border-rule px-2 text-sm font-normal text-ink"
            />
          </label>
          <label className="text-xs font-semibold text-charcoal">
            Called by
            <input
              name="caller"
              defaultValue={caller}
              maxLength={60}
              placeholder="Your name"
              className="mt-1 block h-9 w-full rounded-lg border border-rule px-2 text-sm font-normal text-ink"
            />
          </label>
        </div>
        <button className={`${PRIMARY} w-full`}>Save call</button>
      </form>
    </section>
  );
}

function CallHistory({ calls }: { calls: Call[] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">Calls · {calls.length}</h3>
      {calls.length ? (
        <ol className="mt-1 divide-y divide-rule">
          {calls.map((call) => (
            <li key={call.id} className="py-2.5 text-sm">
              <p className="flex flex-wrap items-center gap-x-2">
                <Outcome outcome={call.outcome} />
                <span className="text-charcoal">
                  {callTime(call.at)}
                  {call.caller && ` · ${call.caller}`}
                </span>
              </p>
              {call.note && <p className="mt-1">{call.note}</p>}
              {call.follow_up && <p className="text-xs text-charcoal">Follow up {shortDate(call.follow_up)}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 text-sm text-charcoal">No calls yet.</p>
      )}
    </section>
  );
}

// The import's other columns, kept as JSON; anything unreadable counts as none.
function parseExtra(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function Extras({ json }: { json: string }) {
  const columns = Object.entries(parseExtra(json));
  if (!columns.length) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold">From the import</h3>
      <dl className="mt-2 grid grid-cols-[minmax(0,auto)_1fr] gap-x-4 gap-y-1 text-sm">
        {columns.map(([name, value]) => (
          <Fragment key={name}>
            <dt className="text-charcoal">{name}</dt>
            <dd className="break-words">{value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}
