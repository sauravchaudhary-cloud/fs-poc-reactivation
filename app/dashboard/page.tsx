// The reactivation command center: the numbers as tiles, the funnel and weekly wins, who to call next, and every
// customer with a Call and a Log. Filters live in the URL, so any view can be shared as a link.
import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Bars, Change, Delta, Spark, Weekly } from "@/components/dashboard/charts";
import { CustomerCard } from "@/components/dashboard/customer";
import { ImportPanel } from "@/components/dashboard/import";
import { Pick, type PickOption } from "@/components/dashboard/pick";
import { CustomerTable } from "@/components/dashboard/table";
import { Action, Drawer, Head, PRIMARY, RAMP, Tile } from "@/components/dashboard/ui";
import { segments } from "@/content/flows";
import {
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
  rate,
  type Filters,
} from "@/lib/dashboard/data";
import { database } from "@/lib/dashboard/db";
import { STORES } from "@/lib/store";

const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted" });

export const metadata: Metadata = { title: "Reactivation · FoodStories" };
export const viewport: Viewport = { themeColor: "#fbf8f4" };

type Board = ReturnType<typeof buildBoard>; // everything the page shows, for one set of filters
type FilterHref = (change: Partial<Filters>) => string;

export default function Page({ searchParams }: PageProps<"/dashboard">) {
  return (
    <div className={`${sans.variable} min-h-dvh bg-page font-ui text-[15px] leading-6 text-ink`}>
      <Suspense>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type DashboardProps = { searchParams: PageProps<"/dashboard">["searchParams"] };

async function Dashboard({ searchParams }: DashboardProps) {
  const query = await searchParams;
  await connection(); // the store reads SQLite synchronously, so wait for the request before reading it
  const filters = parseFilters(query);
  const db = database();
  const customers = db.customers();
  const today = indiaDate();
  const board = buildBoard(customers, db.calls(), filters, today);
  const caller = (await cookies()).get("caller")?.value ?? "";
  // The import route reports back in the query: ?imported=…&skipped=…, or ?panel=import&error=….
  const param = (key: string) => (typeof query[key] === "string" ? query[key] : "");
  // A filter change starts the list over and closes any panel.
  const filterHref: FilterHref = (change) => dashboardHref(filters, { page: 1, customer: "", panel: "", ...change });
  const closeHref = dashboardHref(filters, { customer: "", panel: "" });
  const importHref = dashboardHref(filters, { customer: "", panel: "import" });
  const openCustomer = filters.customer ? customers.find((c) => c.phone === filters.customer) : undefined;

  return (
    <>
      <main className="mx-auto max-w-[1280px] px-4 pb-24 sm:px-8">
        <Header filters={filters} filterHref={filterHref} importHref={importHref} />
        <Notices
          hasSamples={customers.some((c) => c.sample === 1)}
          importHref={importHref}
          imported={param("imported")}
          skipped={param("skipped")}
        />
        <KeyNumbers board={board} period={filters.period} />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Funnel board={board} period={filters.period} />
          <DoNext board={board} filterHref={filterHref} />
        </div>
        <CustomerTable
          rows={board.rows}
          counts={board.counts}
          total={board.total}
          filters={filters}
          filterHref={filterHref}
          today={today}
        />
      </main>

      {openCustomer && (
        <Drawer closeHref={closeHref} label={`Customer ${openCustomer.name}`}>
          <CustomerCard
            customer={openCustomer}
            calls={board.history(openCustomer.phone)}
            closeHref={closeHref}
            today={today}
            caller={caller}
          />
        </Drawer>
      )}
      {filters.panel === "import" && (
        <Drawer closeHref={closeHref} label="Import customers">
          <ImportPanel closeHref={closeHref} error={param("error")} />
        </Drawer>
      )}
    </>
  );
}

type HeaderProps = { filters: Filters; filterHref: FilterHref; importHref: string };

function Header({ filters, filterHref, importHref }: HeaderProps) {
  const periodOptions = Object.entries(PERIODS).map(([key, { label }]): PickOption => [
    key,
    label,
    filterHref({ period: key }),
  ]);
  const storeOptions: PickOption[] = [
    ["all", "All stores", filterHref({ store: "all" })],
    ...STORES.map(({ code }): PickOption => [code, STORE_SHORT_NAMES[code], filterHref({ store: code })]),
  ];
  const segmentOptions: PickOption[] = [
    ["0", "All segments", filterHref({ segment: 0 })],
    ...segments.map(({ n, name }): PickOption => [String(n), `${n} · ${name}`, filterHref({ segment: n })]),
  ];
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 py-6">
      <div className="mr-auto">
        <p className="text-xs font-semibold uppercase leading-4 tracking-[0.14em] text-charcoal">FoodStories</p>
        <h1 className="text-2xl font-semibold leading-8 tracking-tight">Reactivation</h1>
      </div>
      <nav aria-label="Filters" className="flex flex-wrap items-center gap-2">
        <Pick label="Period" value={filters.period} options={periodOptions} />
        <Pick label="Store" value={filters.store} options={storeOptions} />
        <Pick label="Segment" value={String(filters.segment)} options={segmentOptions} />
        <Link href={importHref} scroll={false} className={PRIMARY}>
          Import customers
        </Link>
      </nav>
    </header>
  );
}

type NoticesProps = { hasSamples: boolean; importHref: string; imported: string; skipped: string };

// Over the tiles: that these are sample customers, and what the last import did.
function Notices({ hasSamples, importHref, imported, skipped }: NoticesProps) {
  return (
    <>
      {hasSamples && (
        <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-cream px-4 py-3 text-sm">
          <b className="font-semibold">Sample customers</b>
          <span className="text-charcoal">Import your export to replace them. Calling is off for samples.</span>
          <Link
            href={importHref}
            scroll={false}
            className="ml-auto font-semibold text-accent-ink underline underline-offset-4"
          >
            Import CSV
          </Link>
        </p>
      )}
      {imported && (
        <p role="status" className="mb-4 rounded-xl bg-good-tint px-4 py-3 text-sm text-good">
          Imported {formatCount(Number(imported))} customers
          {Number(skipped) > 0 && ` · ${formatCount(Number(skipped))} rows skipped, no usable phone number`}.
        </p>
      )}
    </>
  );
}

type SectionProps = { board: Board; period: string };

function KeyNumbers({ board, period }: SectionProps) {
  const filling = board.weekly.map((w) => w.filling);
  return (
    <section
      aria-label="Key numbers"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule lg:grid-cols-5"
    >
      <Tile
        label="Inactive"
        value={formatCount(board.inactive)}
        sub={`${formatCount(board.untouched)} not messaged yet`}
      />
      <Tile
        label="Messaged"
        value={formatCount(board.messaged)}
        sub={<MessagedNote board={board} period={period} />}
        chart={<Spark values={board.weekly.map((w) => w.messaged)} label="Messaged per week" />}
      />
      <Tile
        label="Won back"
        value={formatCount(board.won)}
        sub={
          board.lift === undefined ? (
            `${formatPercent(board.wonRate)} of messaged`
          ) : (
            <>
              <Delta points={board.lift} /> vs control
            </>
          )
        }
        chart={<Spark values={board.weekly.map((w) => w.won)} filling={filling} label="Won back per week" />}
      />
      <Tile
        label="Orders"
        value={formatRupees(board.revenue)}
        sub={`≈ ${formatRupees(board.spend)} on messages`}
        chart={<Spark values={board.weekly.map((w) => w.revenue)} filling={filling} label="Orders per week, ₹" />}
      />
      <Tile
        className="col-span-2 lg:col-span-1"
        label="Calls today"
        value={formatCount(board.callsToday)}
        sub={`${board.reachedToday} reached · ${board.orderedAfterCall} ordered after a call`}
        chart={<Bars values={board.callsDaily} label="Calls a day, last 14 days" />}
      />
    </section>
  );
}

// Under Messaged: the change on the 4 weeks before when the period has them, else the stretch it covers.
function MessagedNote({ board, period }: SectionProps) {
  if (board.messagedBefore !== undefined) return <Change now={board.messaged} before={board.messagedBefore} />;
  if (period === "all" && board.since) return `Since ${shortDate(board.since)}`;
  return PERIODS[period].label;
}

function Funnel({ board, period }: SectionProps) {
  return (
    <section className="rounded-xl border border-rule bg-white p-5 lg:col-span-7">
      <Head title="Funnel" note={`Messaged · ${PERIODS[period].label}`} />
      <ol className="mt-4 space-y-2">
        {board.funnel.map((stage, i) => (
          <FunnelStage
            key={stage.label}
            stage={stage}
            previous={i > 0 ? board.funnel[i - 1] : undefined}
            messaged={board.messaged}
            color={RAMP[i]}
          />
        ))}
      </ol>
      <Weekly weeks={board.weekly} />
    </section>
  );
}

const SLIVER = 0.5; // % of the funnel's width, so a stage nobody reached still shows

type Stage = Board["funnel"][number];
type FunnelStageProps = { stage: Stage; previous?: Stage; messaged: number; color: string };

// A bar as wide as the stage's share of everyone messaged, and what share of the stage before got this far.
function FunnelStage({ stage, previous, messaged, color }: FunnelStageProps) {
  const ofPrevious = previous ? formatPercent(rate(stage.n, previous.n)) : "";
  const width = messaged ? Math.max(SLIVER, rate(stage.n, messaged) * 100) : 0;
  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]"
      title={previous ? `${ofPrevious} of ${previous.label.toLowerCase()}` : undefined}
    >
      <span aria-hidden className="block h-6 rounded-r bg-surface">
        <span className="block h-full rounded-r" style={{ width: `${width}%`, background: color }} />
      </span>
      <span className="text-sm">
        <b className="font-semibold">{formatCount(stage.n)}</b> {stage.label.toLowerCase()}
        {previous && <span className="text-charcoal"> · {ofPrevious}</span>}
      </span>
    </li>
  );
}

type DoNextProps = { board: Board; filterHref: FilterHref };

// The four call lists, and a flow whose replies lag the rest, if there is one.
function DoNext({ board, filterHref }: DoNextProps) {
  const { counts, weakest } = board;
  return (
    <section className="rounded-xl border border-rule bg-white p-5 lg:col-span-5">
      <Head title="Do next" note="Who to call now" />
      <ul className="mt-2 divide-y divide-rule">
        <Action
          value={counts.hot}
          tone="bg-accent text-white"
          title="Hot leads"
          why="Replied in the last 3 weeks, no order yet"
          to={`${filterHref({ list: "hot" })}#customers`}
          cta="Call list"
          primary
        />
        <Action
          value={counts.due}
          tone="bg-ink text-white"
          title="Follow-ups due"
          why="A call back was promised by today"
          to={`${filterHref({ list: "due" })}#customers`}
          cta="Open"
        />
        <Action
          value={counts.unhappy}
          tone="bg-blush text-accent-ink"
          title="Unhappy customers"
          why="Last order went wrong; replied this month"
          to={`${filterHref({ list: "unhappy" })}#customers`}
          cta="Open"
        />
        <Action
          value={counts.vip}
          tone="bg-gold-tint text-gold-ink"
          title="VIPs gone quiet"
          why="Messaged this month, no reply yet"
          to={`${filterHref({ list: "vip" })}#customers`}
          cta="Open"
        />
        {weakest && (
          <Action
            value={formatPercent(weakest.replied)}
            tone="bg-surface text-charcoal"
            title={`Flow ${weakest.code} is lagging`}
            why={`${weakest.name}: ${formatPercent(weakest.replied)} replied vs ${formatPercent(weakest.average)} overall`}
            to={`${filterHref({ flow: weakest.key, list: "all" })}#customers`}
            cta="See who"
          />
        )}
      </ul>
    </section>
  );
}
