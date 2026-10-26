// The dashboard's building blocks: buttons, section heads, number tiles, the Do next rows, and the side drawer.
import Link from "next/link";
import type { ReactNode } from "react";

const BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
export const PRIMARY = `${BUTTON} bg-accent text-white hover:bg-accent-ink`; // white on wine is 6.6:1
export const GHOST = `${BUTTON} border border-rule bg-white hover:border-charcoal`;
// One wine ramp, rosé to burgundy, a step per stage (passes the dataviz ordinal checks on white; step 4 is the brand wine).
export const RAMP = ["#e18888", "#cf686b", "#ba4a50", "#a13940", "#822b31", "#651f24"];

type HeadProps = { title: string; note: string };

export function Head({ title, note }: HeadProps) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-charcoal">{note}</p>
    </div>
  );
}

type TileProps = {
  label: string;
  value: string;
  sub: ReactNode; // the line under the number
  chart?: ReactNode;
  className?: string;
};

export function Tile({ label, value, sub, chart, className = "" }: TileProps) {
  return (
    <div className={`bg-white p-4 sm:p-5 ${className}`}>
      <p className="text-xs font-semibold uppercase leading-4 tracking-[0.12em] text-charcoal">{label}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p className="whitespace-nowrap text-[28px] font-semibold leading-9 tracking-tight">{value}</p>
        {chart}
      </div>
      <p className="mt-1 text-sm text-charcoal">{sub}</p>
    </div>
  );
}

type ActionProps = {
  value: number | string; // what the badge shows: a count, or a rate
  tone: string; // the badge's colours
  title: string;
  why: string;
  to: string;
  cta: string;
  primary?: boolean;
};

// A Do next row: the badge, what it is and why, and a link to the customers it means.
export function Action({ value, tone, title, why, to, cta, primary }: ActionProps) {
  return (
    <li className="flex items-center gap-4 py-3">
      <span
        className={`grid h-11 min-w-11 shrink-0 place-items-center rounded-full px-2 text-base font-semibold ${tone}`}
      >
        {value}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-5">{title}</p>
        <p className="truncate text-sm text-charcoal" title={why}>
          {why}
        </p>
      </div>
      <Link href={to} className={primary ? PRIMARY : GHOST}>
        {cta}
      </Link>
    </li>
  );
}

type DrawerProps = { closeHref: string; label: string; children: ReactNode };

// A panel over the right of the page. The dimmed page behind it is a link too, so clicking it closes the drawer.
export function Drawer({ closeHref, label, children }: DrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-ink/30" />
      <aside
        aria-label={label}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
      >
        {children}
      </aside>
    </div>
  );
}

type PanelProps = {
  title: string;
  kicker?: string; // the small line over the title
  sub?: string; // the line under it
  closeHref: string;
  children: ReactNode;
};

// A drawer's contents: a header with a close button, over its sections.
export function Panel({ title, kicker, sub, closeHref, children }: PanelProps) {
  return (
    <>
      <header className="flex items-start gap-3 border-b border-rule p-5">
        <div className="min-w-0 flex-1">
          {kicker && (
            <p className="text-xs font-semibold uppercase leading-4 tracking-[0.12em] text-charcoal">{kicker}</p>
          )}
          <h2 className="mt-1 text-xl font-semibold leading-7">{title}</h2>
          {sub && <p className="text-charcoal">{sub}</p>}
        </div>
        <Link
          href={closeHref}
          scroll={false}
          aria-label="Close"
          className="grid size-9 place-items-center rounded-lg text-xl text-charcoal hover:bg-surface"
        >
          ×
        </Link>
      </header>
      <div className="space-y-6 p-5">{children}</div>
    </>
  );
}
