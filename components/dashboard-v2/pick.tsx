"use client";
import { useRouter } from "next/navigation";

// A filter in the glass bar: a native select, clear inside a glass chip, whose options are links the server built.
export function Pick({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: [value: string, label: string, href: string][];
}) {
  const router = useRouter();
  return (
    <span className="liquid-glass-chip relative inline-flex h-9 items-center">
      <select
        aria-label={label}
        value={value}
        onChange={(e) =>
          router.push(options.find((o) => o[0] === e.target.value)?.[2] ?? "/dashboard-v2", { scroll: false })
        }
        className="h-full cursor-pointer appearance-none rounded-full bg-transparent pl-3.5 pr-8 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      <svg aria-hidden viewBox="0 0 12 12" className="pointer-events-none absolute right-3 size-3 text-charcoal">
        <path
          d="M3 4.5 6 7.5 9 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
