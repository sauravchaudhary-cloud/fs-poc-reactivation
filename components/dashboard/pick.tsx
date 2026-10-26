"use client";
// A filter in the dashboard's header: a native select whose options are links the server already built.
import { useRouter } from "next/navigation";

export type PickOption = [value: string, label: string, href: string];
type Props = { label: string; value: string; options: PickOption[] };

export function Pick({ label, value, options }: Props) {
  const router = useRouter();
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => {
        const href = options.find(([optionValue]) => optionValue === event.target.value)?.[2] ?? "/dashboard";
        router.push(href, { scroll: false });
      }}
      className="h-9 cursor-pointer rounded-lg border border-rule bg-white px-2.5 text-sm font-medium hover:border-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {options.map(([optionValue, text]) => (
        <option key={optionValue} value={optionValue}>
          {text}
        </option>
      ))}
    </select>
  );
}
