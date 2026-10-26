// The import drawer's panel: the CSV upload form (posted to /dashboard/import), what went wrong with the last upload,
// and the columns the import reads.
import { Panel, PRIMARY } from "@/components/dashboard/ui";

// Column names as the import matches them, and what each holds.
const COLUMNS = [
  ["phone", "Required: a mobile number, with or without +91"],
  ["name, store, segment", "Store code or name; segment 1–6 or its name"],
  ["last_order, orders, lifetime_value", "Their history before they went quiet"],
  ["flow, sent_at", "The flow (key or number, like 2.3) and the day it went"],
  ["read, replied, basket", "What they did on WhatsApp"],
  ["first_order_at, second_order_at, revenue", "Orders since the message"],
  ["opted_out, control", "Replied STOP; held back in CleverTap's control group"],
];
// What the import route's ?error= codes mean.
const ERRORS: Record<string, string> = {
  empty: "Choose a CSV file first.",
  big: "That file is over 50 MB.",
  nophone: "No row had a usable phone number. Is there a phone column?",
};

type Props = { closeHref: string; error: string };

export function ImportPanel({ closeHref, error }: Props) {
  // ?error= comes from the URL: only our own codes, never the object's prototype ("toString", "__proto__").
  const errorMessage = Object.hasOwn(ERRORS, error) ? ERRORS[error] : undefined;
  return (
    <Panel title="Import customers" closeHref={closeHref}>
      <form action="/dashboard/import" method="post" encType="multipart/form-data" className="space-y-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          aria-label="CSV file"
          className="block w-full text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface file:px-3 file:font-semibold"
        />
        <button className={`${PRIMARY} w-full`}>Import</button>
      </form>
      {errorMessage && <p className="rounded-lg bg-blush px-3 py-2 text-sm text-accent-ink">{errorMessage}</p>}
      <section>
        <h3 className="text-sm font-semibold">Columns it reads</h3>
        <p className="mt-1 text-sm text-charcoal">
          One row per customer. Dates as YYYY-MM-DD or DD/MM/YYYY; yes/no columns take yes, 1 or a date. Other columns
          are kept and shown on the customer&rsquo;s card.
        </p>
        <dl className="mt-3 space-y-2.5 text-sm">
          {COLUMNS.map(([names, meaning]) => (
            <div key={names}>
              <dt className="font-mono text-xs leading-5">{names}</dt>
              <dd className="text-charcoal">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="text-sm text-charcoal">
        Customers update by phone and keep their calls; your first import replaces the sample. Everything stays in
        data/dashboard.db on this machine.
      </p>
    </Panel>
  );
}
