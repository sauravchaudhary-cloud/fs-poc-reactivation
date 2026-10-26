// The customer table: the call lists as tabs, search, a row per customer with Call and Log, and paging.
import Form from "next/form";
import Link from "next/link";
import { CallButton, Journey, LastCall } from "@/components/dashboard/customer";
import { GHOST } from "@/components/dashboard/ui";
import { segments } from "@/content/flows";
import {
  FLOWS,
  LISTS,
  PAGE_SIZE,
  STORE_SHORT_NAMES,
  dashboardHref,
  formatRupees,
  formatCount,
  formatPhone,
  type Call,
  type Customer,
  type Filters,
} from "@/lib/dashboard/data";

const COLUMN_COUNT = 7; // the header's cells, Actions included
const ANY_ORIGIN = "http://x"; // new URL() needs one to parse a path; only the query is read

type FilterHref = (change: Partial<Filters>) => string;
type Row = { c: Customer; last?: Call; stop: string };
type Props = {
  rows: Row[]; // this page's
  counts: Record<string, number>; // per call list
  total: number; // rows in the list, over all pages
  filters: Filters;
  filterHref: FilterHref;
  today: string;
};

export function CustomerTable({ rows, counts, total, filters, filterHref, today }: Props) {
  const flow = FLOWS.find((f) => f.key === filters.flow);
  return (
    <section id="customers" className="mt-6 scroll-mt-4 rounded-xl border border-rule bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule p-4">
        <h2 className="mr-1 text-lg font-semibold">Customers</h2>
        <ListTabs current={filters.list} counts={counts} filterHref={filterHref} />
        {flow && (
          <Link
            href={`${filterHref({ flow: "" })}#customers`}
            className="rounded-full bg-surface px-3 py-1 text-sm hover:bg-rule"
            aria-label={`Clear flow ${flow.code}`}
          >
            Flow {flow.code} ×
          </Link>
        )}
        <Search text={filters.q} filterHref={filterHref} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="whitespace-nowrap border-b border-rule text-xs uppercase leading-4 tracking-[0.1em] text-charcoal">
              <th className="px-4 py-2.5 font-semibold">Customer</th>
              <th className="hidden px-4 py-2.5 font-semibold md:table-cell">Segment</th>
              <th className="hidden px-4 py-2.5 font-semibold xl:table-cell">Store</th>
              <th className="px-4 py-2.5 font-semibold">Journey</th>
              <th className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">Lifetime</th>
              <th className="hidden px-4 py-2.5 font-semibold lg:table-cell">Last call</th>
              <th className="px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c: customer, last, stop }) => (
              <CustomerRow
                key={customer.phone}
                customer={customer}
                lastCall={last}
                stop={stop}
                selected={customer.phone === filters.customer}
                cardHref={dashboardHref(filters, { customer: customer.phone, panel: "" })}
                today={today}
              />
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-4 py-10 text-center text-charcoal">
                  No customers here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Paging filters={filters} total={total} />
    </section>
  );
}

type ListTabsProps = { current: string; counts: Record<string, number>; filterHref: FilterHref };

function ListTabs({ current, counts, filterHref }: ListTabsProps) {
  return (
    <nav aria-label="Lists" className="flex flex-wrap gap-1 rounded-lg bg-surface p-1 text-sm">
      {Object.entries(LISTS).map(([list, label]) => {
        const active = list === current;
        return (
          <Link
            key={list}
            href={`${filterHref({ list })}#customers`}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 font-medium ${active ? "bg-white shadow-sm" : "text-charcoal hover:text-ink"}`}
          >
            {label}
            {list !== "all" && <span className="ml-1.5 text-charcoal">{counts[list]}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

type SearchProps = { text: string; filterHref: FilterHref };

// A search keeps the other filters, as hidden fields, and like any filter change starts the list over.
function Search({ text, filterHref }: SearchProps) {
  const kept = new URL(filterHref({ q: "" }), ANY_ORIGIN).searchParams;
  return (
    <Form action="/dashboard" scroll={false} className="ml-auto w-full sm:w-auto">
      {[...kept].map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input
        type="search"
        name="q"
        defaultValue={text}
        placeholder="Search name or phone"
        aria-label="Search customers"
        className="h-9 w-full rounded-lg border border-rule px-3 text-sm sm:w-64"
      />
    </Form>
  );
}

type CustomerRowProps = {
  customer: Customer;
  lastCall?: Call;
  stop: string; // why they can't be called, or ""
  selected: boolean; // their card is open
  cardHref: string;
  today: string;
};

function CustomerRow({ customer, lastCall, stop, selected, cardHref, today }: CustomerRowProps) {
  const segment = segments.find((s) => s.n === customer.segment);
  return (
    <tr className={`border-b border-rule ${selected ? "bg-blush" : "hover:bg-surface"}`}>
      <td className="px-4 py-2.5">
        <Link href={cardHref} scroll={false} className="font-semibold hover:underline">
          {customer.name || "Unnamed"}
        </Link>
        <span className="block text-xs text-charcoal">{formatPhone(customer.phone)}</span>
      </td>
      <td className="hidden px-4 md:table-cell">{segment?.name ?? "–"}</td>
      <td className="hidden px-4 xl:table-cell">{STORE_SHORT_NAMES[customer.store] ?? "–"}</td>
      <td className="px-4">
        <Journey customer={customer} />
      </td>
      <td className="hidden whitespace-nowrap px-4 text-right sm:table-cell">
        {customer.lifetime_value ? formatRupees(customer.lifetime_value) : "–"}
      </td>
      <td className="hidden px-4 lg:table-cell">
        <LastCall call={lastCall} today={today} />
      </td>
      <td className="px-4">
        <span className="flex justify-end gap-2">
          <CallButton customer={customer} stop={stop} />
          <Link href={cardHref} scroll={false} className={`${GHOST} max-sm:hidden`}>
            Log
          </Link>
        </span>
      </td>
    </tr>
  );
}

type PagingProps = { filters: Filters; total: number };

// "26–50 of 3,040", and the pages either side. Turning a page keeps the filters but closes any card.
function Paging({ filters, total }: PagingProps) {
  const { page } = filters;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const pageHref = (to: number) => `${dashboardHref(filters, { page: to, customer: "" })}#customers`;
  return (
    <footer className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-charcoal">
      <span>{total > 0 && `${formatCount(first)}–${formatCount(last)} of ${formatCount(total)}`}</span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link href={pageHref(page - 1)} className={GHOST}>
            Previous
          </Link>
        )}
        {last < total && (
          <Link href={pageHref(page + 1)} className={GHOST}>
            Next
          </Link>
        )}
      </span>
    </footer>
  );
}
