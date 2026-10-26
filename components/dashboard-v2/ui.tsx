// /dashboard-v2's building blocks in liquid glass (./glass.css): buttons, section heads, number tiles, the Do next
// rows, the charts and the drawer. Inside a glass panel nothing paints a surface of its own, so spacing and type
// weight do the separating that hairlines do in /dashboard.
import Link from "next/link";
import type { ReactNode } from "react";
import { shortDate, formatCount } from "@/lib/dashboard/data";

export const GLASS = "liquid-glass liquid-glass--frost"; // refracted by ./glass.tsx
export const BAR = "liquid-glass liquid-glass--modal"; // darker frost, for what the page scrolls under
const BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
export const PRIMARY = `${BUTTON} glass-primary`;
export const GHOST = `${BUTTON} liquid-glass-chip`;
// The funnel's stages, light aqua to deep emerald: each a step darker, so the later and rarer stages stand out on
// the light glass. The counts are written beside them, so the paler early steps don't carry anything alone.
export const RAMP = ["#22d3ee", "#06b6d4", "#14b8a6", "#10b981", "#059669", "#047857"];

// Calls a day: today in teal, the days before in translucent teal.
export function Bars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  const w = 80 / values.length;
  return (
    <svg viewBox="0 0 80 28" className="h-7 w-20 shrink-0" role="img" aria-label={`${label}: ${values.join(", ")}`}>
      {values.map((v, i) => {
        const h = Math.max(1, (v / max) * 26);
        return (
          <rect
            key={i}
            x={i * w + 0.5}
            width={w - 1}
            y={28 - h}
            height={h}
            rx="1"
            fill={i === values.length - 1 ? "var(--color-accent)" : "rgb(13 148 136 / 0.3)"}
          />
        );
      })}
    </svg>
  );
}

export function Head({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-charcoal">{note}</p>
    </div>
  );
}

export function Tile({
  label,
  value,
  sub,
  chart,
  className = "",
}: {
  label: string;
  value: string;
  sub: ReactNode;
  chart?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${GLASS} p-4 sm:p-5 ${className}`}>
      <p className="text-xs font-semibold uppercase leading-4 tracking-[0.12em] text-charcoal">{label}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p className="whitespace-nowrap text-[28px] font-semibold leading-9 tracking-tight">{value}</p>
        {chart}
      </div>
      <p className="mt-1 text-sm text-charcoal">{sub}</p>
    </div>
  );
}

// `tone`: the badge's glass, by rank: glass-primary, glass-strong, or a chip.
export function Action({
  n,
  tone,
  title,
  why,
  to,
  cta,
  primary,
}: {
  n: number | string;
  tone: string;
  title: string;
  why: string;
  to: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <li className="flex items-center gap-4 py-2.5">
      <span
        className={`grid h-11 min-w-11 shrink-0 place-items-center rounded-full px-2 text-base font-semibold ${tone}`}
      >
        {n}
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

// Won back by the week they were messaged; weeks still inside their 45-day window are paler, since they'll rise.
export function Weekly({ weeks }: { weeks: { start: string; messaged: number; won: number; filling: boolean }[] }) {
  const max = Math.max(...weeks.map((w) => w.won), 1);
  return (
    <figure className="mt-8">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold">Won back, by week messaged</span>
        <span className="flex items-center gap-3 text-xs text-charcoal">
          <span className="flex items-center gap-1">
            <span aria-hidden className="size-2.5 rounded-full bg-accent" /> final
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="size-2.5 rounded-full bg-accent/35" /> still within 45 days
          </span>
        </span>
      </figcaption>
      <div
        className="mt-3 flex h-32 items-end gap-1.5"
        role="img"
        aria-label={`Won back by week messaged: ${weeks.map((w) => `${shortDate(w.start)} ${w.won}`).join(", ")}`}
      >
        {weeks.map((w) => (
          <div
            key={w.start}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            title={`Week of ${shortDate(w.start)}: ${w.won} won back of ${formatCount(w.messaged)} messaged${w.filling ? ", still within 45 days" : ""}`}
          >
            <span className="text-xs leading-4 text-charcoal">{w.won || ""}</span>
            <span
              className={`w-full max-w-6 rounded-t-md shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] ${w.filling ? "bg-accent/35" : "bg-accent"}`}
              style={{ height: `${Math.max(w.won ? 2 : 0, (w.won / max) * 100)}px` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-1.5 text-[11px] leading-4 text-charcoal">
        {weeks.map((w, i) => (
          <span key={w.start} className="flex min-w-0 flex-1 justify-center whitespace-nowrap">
            {i % 3 === 0 ? shortDate(w.start) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

// A floating glass sheet over a blurred scrim. The scrim is the sheet's sibling, not its parent: a parent with a
// backdrop-filter would be all the sheet could see through itself. It frosts as hard as the sticky bar, or the
// table under it shows through as ghost text behind the form.
export function Drawer({ close, label, children }: { close: string; label: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end sm:p-3">
      <Link href={close} scroll={false} aria-label="Close" className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" />
      <aside
        aria-label={label}
        data-glass-blur="24"
        className={`${BAR} flex h-full w-full max-w-md flex-col overflow-y-auto backdrop-blur-xl backdrop-saturate-125 max-sm:rounded-none`}
      >
        {children}
      </aside>
    </div>
  );
}

export function Panel({
  title,
  kicker,
  sub,
  close,
  children,
}: {
  title: string;
  kicker?: string;
  sub?: string;
  close: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="flex items-start gap-3 px-5 pt-5">
        <div className="min-w-0 flex-1">
          {kicker && (
            <p className="text-xs font-semibold uppercase leading-4 tracking-[0.12em] text-charcoal">{kicker}</p>
          )}
          <h2 className="mt-1 text-xl font-semibold leading-7">{title}</h2>
          {sub && <p className="text-charcoal">{sub}</p>}
        </div>
        <Link
          href={close}
          scroll={false}
          aria-label="Close"
          className="liquid-glass-chip grid size-9 shrink-0 place-items-center text-xl text-charcoal"
        >
          ×
        </Link>
      </header>
      <div className="space-y-6 p-5">{children}</div>
    </>
  );
}
