import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import Form from "next/form";
import { cookies } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Change, Delta, Spark } from "@/components/dashboard/charts";
import { CallButton, CustomerCard, Journey, LastCall } from "@/components/dashboard-v2/customer";
import { Refraction } from "@/components/dashboard-v2/glass";
import "@/components/dashboard-v2/glass.css";
import { Pick } from "@/components/dashboard-v2/pick";
import {
  Action,
  BAR,
  Bars,
  Drawer,
  GHOST,
  GLASS,
  Head,
  Panel,
  PRIMARY,
  RAMP,
  Tile,
  Weekly,
} from "@/components/dashboard-v2/ui";
import { segments } from "@/content/flows";
import {
  FLOWS,
  LISTS,
  PAGE_SIZE,
  PERIODS,
  STORE_SHORT_NAMES,
  buildBoard,
  shortDate,
  dashboardHref,
  formatRupees,
  indiaDate,
  formatCount,
  parseFilters,
  formatPercent,
  formatPhone,
  rate,
  stopReason,
  type Filters,
} from "@/lib/dashboard/data";
import { database } from "@/lib/dashboard/db";
import { STORES } from "@/lib/store";

// /dashboard in liquid glass, in the Lagoon palette: the same command center on the same data, in panels that frost
// and bend the page behind them. Filters live in the URL here too.
const sans = Schibsted_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = { title: "Reactivation v2 · FoodStories" };
export const viewport: Viewport = { themeColor: "#e4f2f0" };

const COLUMNS = [
  ["phone", "Required: a mobile number, with or without +91"],
  ["name, store, segment", "Store code or name; segment 1–6 or its name"],
  ["last_order, orders, lifetime_value", "Their history before they went quiet"],
  ["flow, sent_at", "The flow (key or number, like 2.3) and the day it went"],
  ["read, replied, basket", "What they did on WhatsApp"],
  ["first_order_at, second_order_at, revenue", "Orders since the message"],
  ["opted_out, control", "Replied STOP; held back in CleverTap's control group"],
];
const ERRORS: Record<string, string> = {
  empty: "Choose a CSV file first.",
  big: "That file is over 50 MB.",
  nophone: "No row had a usable phone number. Is there a phone column?",
};

// href() links to /dashboard; the same view, on this page.
const to = (f: Filters, change: Partial<Filters>) =>
  `/dashboard-v2${dashboardHref(f, change).slice("/dashboard".length)}`;

export default function Page({ searchParams }: PageProps<"/dashboard-v2">) {
  return (
    <div className={`${sans.className} liquid-glass-backdrop min-h-dvh text-[15px] leading-6 text-ink`}>
      <Suspense>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  await connection();
  const f = parseFilters(q);
  const db = database();
  const customers = db.customers();
  const today = indiaDate();
  const b = buildBoard(customers, db.calls(), f, today);
  const caller = (await cookies()).get("caller")?.value ?? "";
  const note = (k: string) => (typeof q[k] === "string" ? q[k] : "");
  // A filter change starts the list over and closes any panel.
  const go = (change: Partial<Filters>) => to(f, { page: 1, customer: "", panel: "", ...change });
  const close = to(f, { customer: "", panel: "" });
  const open = f.customer ? customers.find((c) => c.phone === f.customer) : undefined;
  const flow = FLOWS.find((x) => x.key === f.flow);
  const filling = b.weekly.map((w) => w.filling);

  return (
    <>
      {/* In the panels' Suspense boundary, so it styles them after they hydrate, not before (a hydration mismatch). */}
      <Refraction />
      <main className="mx-auto max-w-[1280px] px-4 pb-24 pt-3 sm:px-8">
        {/* Sticky glass: the page scrolls under it, so it frosts harder than the panels (and in Safari, blurs harder). */}
        <header
          data-glass-blur="24"
          className={`${BAR} z-40 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 backdrop-blur-xl backdrop-saturate-125 sm:sticky sm:top-3`}
        >
          <div className="mr-auto">
            <p className="text-xs font-semibold uppercase leading-4 tracking-[0.14em] text-charcoal">FoodStories</p>
            <h1 className="text-2xl font-semibold leading-8 tracking-tight">Reactivation</h1>
          </div>
          <nav aria-label="Filters" className="flex flex-wrap items-center gap-2">
            <Pick
              label="Period"
              value={f.period}
              options={Object.entries(PERIODS).map(([k, p]): [string, string, string] => [
                k,
                p.label,
                go({ period: k }),
              ])}
            />
            <Pick
              label="Store"
              value={f.store}
              options={[
                ["all", "All stores", go({ store: "all" })],
                ...STORES.map((s): [string, string, string] => [
                  s.code,
                  STORE_SHORT_NAMES[s.code],
                  go({ store: s.code }),
                ]),
              ]}
            />
            <Pick
              label="Segment"
              value={String(f.segment)}
              options={[
                ["0", "All segments", go({ segment: 0 })],
                ...segments.map((s): [string, string, string] => [
                  String(s.n),
                  `${s.n} · ${s.name}`,
                  go({ segment: s.n }),
                ]),
              ]}
            />
            <Link href={to(f, { customer: "", panel: "import" })} scroll={false} className={PRIMARY}>
              Import customers
            </Link>
          </nav>
        </header>

        {customers.some((c) => c.sample === 1) && (
          <p className={`${GLASS} mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm`}>
            <span aria-hidden className="size-2 rounded-full bg-accent-ink" />
            <b className="font-semibold">Sample customers</b>
            <span className="text-charcoal">Import your export to replace them. Calling is off for samples.</span>
            <Link
              href={to(f, { customer: "", panel: "import" })}
              scroll={false}
              className="ml-auto font-semibold text-accent-ink underline underline-offset-4"
            >
              Import CSV
            </Link>
          </p>
        )}
        {note("imported") && (
          <p role="status" className={`${GLASS} mb-4 flex items-center gap-3 px-4 py-3 text-sm text-good`}>
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-good" />
            <span>
              Imported {formatCount(Number(note("imported")))} customers
              {Number(note("skipped")) > 0 &&
                ` · ${formatCount(Number(note("skipped")))} rows skipped, no usable phone number`}
              .
            </span>
          </p>
        )}

        <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <Tile label="Inactive" value={formatCount(b.inactive)} sub={`${formatCount(b.untouched)} not messaged yet`} />
          <Tile
            label="Messaged"
            value={formatCount(b.messaged)}
            sub={
              b.messagedBefore !== undefined ? (
                <Change now={b.messaged} before={b.messagedBefore} />
              ) : f.period === "all" && b.since ? (
                `Since ${shortDate(b.since)}`
              ) : (
                PERIODS[f.period].label
              )
            }
            chart={<Spark values={b.weekly.map((w) => w.messaged)} label="Messaged per week" />}
          />
          <Tile
            label="Won back"
            value={formatCount(b.won)}
            sub={
              b.lift === undefined ? (
                `${formatPercent(b.wonRate)} of messaged`
              ) : (
                <>
                  <Delta points={b.lift} /> vs control
                </>
              )
            }
            chart={<Spark values={b.weekly.map((w) => w.won)} filling={filling} label="Won back per week" />}
          />
          <Tile
            label="Orders"
            value={formatRupees(b.revenue)}
            sub={`≈ ${formatRupees(b.spend)} on messages`}
            chart={<Spark values={b.weekly.map((w) => w.revenue)} filling={filling} label="Orders per week, ₹" />}
          />
          <Tile
            className="col-span-2 lg:col-span-1"
            label="Calls today"
            value={formatCount(b.callsToday)}
            sub={`${b.reachedToday} reached · ${b.orderedAfterCall} ordered after a call`}
            chart={<Bars values={b.callsDaily} label="Calls a day, last 14 days" />}
          />
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-12">
          <section className={`${GLASS} p-5 lg:col-span-7`}>
            <Head title="Funnel" note={`Messaged · ${PERIODS[f.period].label}`} />
            <ol className="mt-4 space-y-2">
              {b.funnel.map((s, i) => {
                const step = i ? rate(s.n, b.funnel[i - 1].n) : 1;
                return (
                  <li
                    key={s.label}
                    className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]"
                    title={i ? `${formatPercent(step)} of ${b.funnel[i - 1].label.toLowerCase()}` : undefined}
                  >
                    <span aria-hidden className="block h-5 rounded-full bg-ink/5">
                      <span
                        className="block h-full rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
                        style={{
                          width: `${b.messaged ? Math.max(0.5, rate(s.n, b.messaged) * 100) : 0}%`,
                          background: RAMP[i],
                        }}
                      />
                    </span>
                    <span className="text-sm">
                      <b className="font-semibold">{formatCount(s.n)}</b> {s.label.toLowerCase()}
                      {i > 0 && <span className="text-charcoal"> · {formatPercent(step)}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
            <Weekly weeks={b.weekly} />
          </section>

          <section className={`${GLASS} p-5 lg:col-span-5`}>
            <Head title="Do next" note="Who to call now" />
            <ul className="mt-2">
              <Action
                n={b.counts.hot}
                tone="glass-primary"
                title="Hot leads"
                why="Replied in the last 3 weeks, no order yet"
                to={`${go({ list: "hot" })}#customers`}
                cta="Call list"
                primary
              />
              <Action
                n={b.counts.due}
                tone="glass-strong"
                title="Follow-ups due"
                why="A call back was promised by today"
                to={`${go({ list: "due" })}#customers`}
                cta="Open"
              />
              <Action
                n={b.counts.unhappy}
                tone="liquid-glass-chip text-ink"
                title="Unhappy customers"
                why="Last order went wrong; replied this month"
                to={`${go({ list: "unhappy" })}#customers`}
                cta="Open"
              />
              <Action
                n={b.counts.vip}
                tone="liquid-glass-chip text-ink"
                title="VIPs gone quiet"
                why="Messaged this month, no reply yet"
                to={`${go({ list: "vip" })}#customers`}
                cta="Open"
              />
              {b.weakest && (
                <Action
                  n={formatPercent(b.weakest.replied)}
                  tone="liquid-glass-chip text-charcoal"
                  title={`Flow ${b.weakest.code} is lagging`}
                  why={`${b.weakest.name}: ${formatPercent(b.weakest.replied)} replied vs ${formatPercent(b.weakest.average)} overall`}
                  to={`${go({ flow: b.weakest.key, list: "all" })}#customers`}
                  cta="See who"
                />
              )}
            </ul>
          </section>
        </div>

        <section id="customers" className={`${GLASS} mt-4 scroll-mt-4 sm:mt-6 sm:scroll-mt-28`}>
          <div className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
            <h2 className="mr-1 text-lg font-semibold">Customers</h2>
            <nav aria-label="Lists" className="flex flex-wrap gap-1.5 text-sm">
              {Object.entries(LISTS).map(([k, label]) => (
                <Link
                  key={k}
                  href={`${go({ list: k })}#customers`}
                  aria-current={f.list === k ? "page" : undefined}
                  className={`inline-flex h-8 items-center rounded-full px-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${f.list === k ? "glass-strong" : "liquid-glass-chip"}`}
                >
                  {label}
                  {k !== "all" && (
                    <span className={`ml-1.5 ${f.list === k ? "opacity-60" : "text-charcoal"}`}>{b.counts[k]}</span>
                  )}
                </Link>
              ))}
            </nav>
            {flow && (
              <Link
                href={`${go({ flow: "" })}#customers`}
                className="liquid-glass-chip inline-flex h-8 items-center px-3 text-sm"
                aria-label={`Clear flow ${flow.code}`}
              >
                Flow {flow.code} ×
              </Link>
            )}
            <Form action="/dashboard-v2" scroll={false} className="ml-auto w-full sm:w-auto">
              {[...new URL(go({ q: "" }), "http://x").searchParams].map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <input
                type="search"
                name="q"
                defaultValue={f.q}
                placeholder="Search name or phone"
                aria-label="Search customers"
                className="glass-field h-9 w-full rounded-full px-4 text-sm sm:w-64"
              />
            </Form>
          </div>
          <div className="overflow-x-auto px-2">
            <table className="w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="whitespace-nowrap text-xs uppercase leading-4 tracking-[0.1em] text-charcoal">
                  <th className="px-3 py-2.5 font-semibold">Customer</th>
                  <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Segment</th>
                  <th className="hidden px-3 py-2.5 font-semibold xl:table-cell">Store</th>
                  <th className="px-3 py-2.5 font-semibold">Journey</th>
                  <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Lifetime</th>
                  <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Last call</th>
                  <th className="px-3 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {b.rows.map(({ c, last, stop }) => (
                  // No rules between rows (glass rule: nothing inside a panel draws a line or a box); a rounded wash marks hover and the open customer.
                  <tr
                    key={c.phone}
                    className={`*:first:rounded-l-xl *:last:rounded-r-xl ${c.phone === f.customer ? "*:bg-accent/10" : "hover:*:bg-white/45"}`}
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={to(f, { customer: c.phone, panel: "" })}
                        scroll={false}
                        className="font-semibold hover:underline"
                      >
                        {c.name || "Unnamed"}
                      </Link>
                      <span className="block text-xs text-charcoal">{formatPhone(c.phone)}</span>
                    </td>
                    <td className="hidden px-3 md:table-cell">
                      {segments.find((s) => s.n === c.segment)?.name ?? "–"}
                    </td>
                    <td className="hidden px-3 xl:table-cell">{STORE_SHORT_NAMES[c.store] ?? "–"}</td>
                    <td className="px-3">
                      <Journey c={c} />
                    </td>
                    <td className="hidden whitespace-nowrap px-3 text-right sm:table-cell">
                      {c.lifetime_value ? formatRupees(c.lifetime_value) : "–"}
                    </td>
                    <td className="hidden px-3 lg:table-cell">
                      <LastCall call={last} today={today} />
                    </td>
                    <td className="px-3">
                      <span className="flex justify-end gap-2">
                        <CallButton c={c} stop={stop} />
                        <Link
                          href={to(f, { customer: c.phone, panel: "" })}
                          scroll={false}
                          className={`${GHOST} max-sm:hidden`}
                        >
                          Log
                        </Link>
                      </span>
                    </td>
                  </tr>
                ))}
                {!b.rows.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-charcoal">
                      No customers here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-charcoal sm:px-5">
            <span>
              {b.total > 0 &&
                `${formatCount((f.page - 1) * PAGE_SIZE + 1)}–${formatCount(Math.min(f.page * PAGE_SIZE, b.total))} of ${formatCount(b.total)}`}
            </span>
            <span className="flex gap-2">
              {f.page > 1 && (
                <Link href={`${to(f, { page: f.page - 1, customer: "" })}#customers`} className={`${GHOST} text-ink`}>
                  Previous
                </Link>
              )}
              {f.page * PAGE_SIZE < b.total && (
                <Link href={`${to(f, { page: f.page + 1, customer: "" })}#customers`} className={`${GHOST} text-ink`}>
                  Next
                </Link>
              )}
            </span>
          </footer>
        </section>
      </main>

      {open && (
        <Drawer close={close} label={`Customer ${open.name}`}>
          <CustomerCard
            c={open}
            calls={b.history(open.phone)}
            stop={stopReason(open, b.history(open.phone)[0])}
            close={close}
            today={today}
            caller={caller}
          />
        </Drawer>
      )}
      {f.panel === "import" && (
        <Drawer close={close} label="Import customers">
          <Panel title="Import customers" close={close}>
            <form action="/dashboard-v2/import" method="post" encType="multipart/form-data" className="space-y-3">
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                required
                aria-label="CSV file"
                className="block w-full text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-full file:border-0 file:bg-white/70 file:px-4 file:font-semibold file:text-ink file:shadow-[0_1px_2px_rgba(11,47,51,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]"
              />
              <button className={`${PRIMARY} w-full`}>Import</button>
            </form>
            {ERRORS[note("error")] && (
              <p className="rounded-2xl bg-accent-ink/10 px-3 py-2 text-sm font-semibold text-accent-ink">
                {ERRORS[note("error")]}
              </p>
            )}
            <section>
              <h3 className="text-sm font-semibold">Columns it reads</h3>
              <p className="mt-1 text-sm text-charcoal">
                One row per customer. Dates as YYYY-MM-DD or DD/MM/YYYY; yes/no columns take yes, 1 or a date. Other
                columns are kept and shown on the customer&rsquo;s card.
              </p>
              <dl className="mt-3 space-y-2.5 text-sm">
                {COLUMNS.map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-mono text-xs leading-5">{k}</dt>
                    <dd className="text-charcoal">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <p className="text-sm text-charcoal">
              Customers update by phone and keep their calls; your first import replaces the sample. Everything stays in
              data/dashboard.db on this machine.
            </p>
          </Panel>
        </Drawer>
      )}
    </>
  );
}
