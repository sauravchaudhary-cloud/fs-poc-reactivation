// The dashboard's small charts: the tiles' sparklines and bars, the weekly wins, and changes in points.
import { shortDate, formatCount, formatPercent } from "@/lib/dashboard/data";

// The tiles' charts draw in an 80 × 28 box, the size of their h-7 w-20, so a unit is a pixel.
const WIDTH = 80;
const HEIGHT = 28;
const INSET = 2; // px of margin: the spark line's sides and floor (room for its 2 px stroke), the bars' headroom
const PEAK = 4; // px from the top to the spark line's highest point
// Weekly's bars, in px: the best week's height, and the least a week with any win gets.
const TALLEST_WEEK = 100;
const SHORTEST_WIN = 2;
const DATE_EVERY = 3; // weeks between date labels
const LEVEL = 0.05; // points: a smaller change would print as 0.0

type SparkProps = { values: number[]; filling?: boolean[]; label: string };

// Weekly trend in wine; weeks still inside their 45-day window are dashed, since their numbers will still rise.
export function Spark({ values, filling, label }: SparkProps) {
  const max = Math.max(...values, 1);
  const points = values.map((value, i) => {
    const x = INSET + (i / (values.length - 1)) * (WIDTH - 2 * INSET);
    const y = HEIGHT - INSET - (value / max) * (HEIGHT - INSET - PEAK);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  // Solid up to the last final week, dashed from there on; without `filling`, every week is final.
  const lastFinal = filling ? Math.max(0, filling.indexOf(true) - 1) : points.length;
  const line = (segment: string[], dashed = false) => (
    <polyline
      points={segment.join(" ")}
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? "2 3" : undefined}
    />
  );
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-7 w-20 shrink-0 overflow-visible"
      role="img"
      aria-label={`${label}: ${values.map((v) => formatCount(v)).join(", ")}`}
    >
      {line(points.slice(0, lastFinal + 1))}
      {lastFinal < points.length - 1 && line(points.slice(lastFinal), true)}
    </svg>
  );
}

type BarsProps = { values: number[]; label: string };

// A bar a day, the last one (today) in wine.
export function Bars({ values, label }: BarsProps) {
  const max = Math.max(...values, 1);
  const slot = WIDTH / values.length; // a day's share of the width, 1 px of it the gap
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-7 w-20 shrink-0"
      role="img"
      aria-label={`${label}: ${values.join(", ")}`}
    >
      {values.map((value, i) => {
        const height = Math.max(1, (value / max) * (HEIGHT - INSET)); // a day without calls still gets 1 px
        return (
          <rect
            key={i}
            x={i * slot + 0.5}
            width={slot - 1}
            y={HEIGHT - height}
            height={height}
            rx="1"
            fill={i === values.length - 1 ? "var(--color-accent)" : "#d3c8be"}
          />
        );
      })}
    </svg>
  );
}

// ▲ or ▼, read out as "up" or "down".
function Arrow({ up }: { up: boolean }) {
  return (
    <>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "up" : "down"}</span>
    </>
  );
}

// A change in points, with an arrow and a word so it never rests on colour.
export function Delta({ points }: { points: number }) {
  if (Math.abs(points) < LEVEL) return <span>level</span>;
  const up = points > 0;
  return (
    <span className={`whitespace-nowrap font-semibold ${up ? "text-good" : "text-gold-ink"}`}>
      <Arrow up={up} /> {Math.abs(points).toFixed(1)} pts
    </span>
  );
}

type ChangeProps = { now: number; before: number };

// Messaged against the 4 weeks before.
export function Change({ now, before }: ChangeProps) {
  if (!before) return <>None in the 4 weeks before</>;
  return (
    <>
      <Arrow up={now >= before} /> {formatPercent(Math.abs(now / before - 1))} vs 4 weeks before
    </>
  );
}

type Week = { start: string; messaged: number; won: number; filling: boolean };

export function Weekly({ weeks }: { weeks: Week[] }) {
  const max = Math.max(...weeks.map((w) => w.won), 1);
  return (
    <figure className="mt-6 border-t border-rule pt-4">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold">Won back, by week messaged</span>
        <span className="flex items-center gap-3 text-xs text-charcoal">
          <span className="flex items-center gap-1">
            <span aria-hidden className="size-2.5 rounded-sm bg-accent" /> final
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="size-2.5 rounded-sm bg-accent/35" /> still within 45 days
          </span>
        </span>
      </figcaption>
      <div
        className="mt-3 flex h-32 items-end gap-1"
        role="img"
        aria-label={`Won back by week messaged: ${weeks.map((w) => `${shortDate(w.start)} ${w.won}`).join(", ")}`}
      >
        {weeks.map((week) => (
          <WeekBar key={week.start} week={week} max={max} />
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-1 text-[11px] leading-4 text-charcoal">
        {weeks.map((week, i) => (
          <span key={week.start} className="flex min-w-0 flex-1 justify-center whitespace-nowrap">
            {i % DATE_EVERY === 0 ? shortDate(week.start) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

type WeekBarProps = { week: Week; max: number };

// One week's column: its wins over a bar, paler while the week can still win customers back.
function WeekBar({ week, max }: WeekBarProps) {
  const title = `Week of ${shortDate(week.start)}: ${week.won} won back of ${formatCount(week.messaged)} messaged${week.filling ? ", still within 45 days" : ""}`;
  const height = Math.max(week.won ? SHORTEST_WIN : 0, (week.won / max) * TALLEST_WEEK);
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={title}>
      <span className="text-xs leading-4 text-charcoal">{week.won || ""}</span>
      <span
        className={`w-full max-w-6 rounded-t ${week.filling ? "bg-accent/35" : "bg-accent"}`}
        style={{ height: `${height}px` }}
      />
    </div>
  );
}
