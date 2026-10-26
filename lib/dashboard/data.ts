// The reactivation dashboard's model: one row per customer, as FoodStories exports them (CSV, read by `toCustomers`),
// and the calls logged against them. Pure functions, so scripts/check-dashboard.mjs can run them; storage is db.ts.
// Until a real export is imported, `sampleCustomers` stands in.
import { flows, segments } from "../../content/flows/index.ts";
import type { Flow } from "../bot.ts";
import { STORES } from "../store.ts";

export type Customer = {
  phone: string; // digits with the country code (919876543210): the key
  name: string;
  store: string; // store code, "" if unknown
  segment: number; // 1–6, 0 if unknown
  flow: string; // key of the flow they were sent, "" if none
  last_order: string; // YYYY-MM-DD, their last order before going quiet
  orders: number;
  lifetime_value: number; // ₹
  sent_at: string; // YYYY-MM-DD the flow went out, "" if not messaged yet
  read: number; // 0/1, like replied and basket
  replied: number;
  basket: number;
  first_order_at: string; // YYYY-MM-DD, like second_order_at: their orders after the message
  second_order_at: string;
  revenue: number; // ₹ ordered since the message
  opted_out: number; // 0/1: replied STOP
  control: number; // 0/1: held back by CleverTap's control group, so never messaged (and never called)
  extra: string; // any other CSV columns, as JSON
  sample: number; // 1 = generated, removed by the first import
};
// The fields a CSV column can fill; any other column goes into `extra`. db.ts builds its SQL from these names, never
// from a file's.
export const FIELDS = [
  "phone",
  "name",
  "store",
  "segment",
  "flow",
  "last_order",
  "orders",
  "lifetime_value",
  "sent_at",
  "read",
  "replied",
  "basket",
  "first_order_at",
  "second_order_at",
  "revenue",
  "opted_out",
  "control",
] as const;
export type Call = {
  id: number;
  phone: string;
  at: string; // ISO timestamp
  caller: string;
  outcome: string; // a key of OUTCOMES
  note: string;
  follow_up: string; // YYYY-MM-DD a call back was promised for, "" if none
};
type NewCall = Omit<Call, "id">; // not saved yet, so no id

// What a call can end in. `reached`: we spoke to them; `stop`: no more calls to this number.
export const OUTCOMES: Record<string, { label: string; reached: boolean; stop?: boolean }> = {
  ordering: { label: "Will order", reached: true },
  interested: { label: "Interested", reached: true },
  call_back: { label: "Call back", reached: true },
  not_interested: { label: "Not interested", reached: true },
  no_answer: { label: "No answer", reached: false },
  wrong_number: { label: "Wrong number", reached: false, stop: true },
  do_not_call: { label: "Do not call", reached: true, stop: true },
};
// The funnel, in order; stageOf gives a customer's place in it.
export const STAGES = ["Messaged", "Read", "Replied", "Basket", "Came back", "Won back"];
// The customer list's tabs: everyone, or one of the call lists (listRules says who is on each).
export const LISTS: Record<string, string> = {
  all: "All",
  hot: "Hot leads",
  due: "Follow-ups due",
  unhappy: "Unhappy",
  vip: "VIPs gone quiet",
};
const REPLIED_STAGE = 2; // STAGES[2], "Replied"
const WON_BACK_DAYS = 45;

// Each flow's segment, by flow key.
export const SEGMENT_OF: Record<string, number> = Object.fromEntries(flows.map((flow) => [flow.key, flow.n]));
// Flows are numbered n.m in file order, the way PROJECT.md and the deck refer to them.
export const FLOWS = flows.map((flow) => {
  const inSegment = flows.filter((other) => other.n === flow.n);
  return { key: flow.key, n: flow.n, name: flow.name, code: `${flow.n}.${inSegment.indexOf(flow) + 1}` };
});
// Flows sent as a utility template, which costs less than a marketing one.
const UTILITY_FLOWS = new Set(flows.filter((flow) => /utility template/i.test(flow.who)).map((flow) => flow.key));

// Why a number can't be called, or "": they opted out, sit in the control group, or the last call said so.
export const stopReason = (customer: Customer, lastCall?: Call) => {
  if (customer.opted_out) return "Opted out";
  if (customer.control) return "Control group";
  const outcome = lastCall && OUTCOMES[lastCall.outcome];
  return outcome?.stop ? outcome.label : "";
};
// Reactivated, the deck's headline number: a second order within 45 days of the message.
export const wonBack = (customer: Customer) =>
  !!customer.sent_at &&
  !!customer.second_order_at &&
  daysBetween(customer.sent_at, customer.second_order_at) <= WON_BACK_DAYS;
// How far they got, as an index into STAGES; -1 if never messaged (the control group never is). Each stage counts
// everyone past it too, so the funnel only narrows.
export const stageOf = (customer: Customer) => {
  if (!customer.sent_at || customer.control) return -1;
  if (wonBack(customer)) return 5;
  if (customer.first_order_at) return 4;
  if (customer.basket) return 3;
  if (customer.replied) return 2;
  if (customer.read) return 1;
  return 0;
};

// ── Dates: YYYY-MM-DD strings, which compare correctly as text ───────────────────────────────────────────────────
const DAY_MS = 86_400_000;

// The date `days` after a YYYY-MM-DD one (before it, if negative).
export const addDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
// The date in India, today's or `date`'s: the en-CA locale writes it as YYYY-MM-DD.
export const indiaDate = (date = new Date()) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
// The day in India a timestamp falls on.
export const dayOf = (at: string) => indiaDate(new Date(at));

function daysBetween(from: string, to: string) {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS;
}

// ── Import ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Other names exports give our columns, once a heading is lowercased with _ between words ("Mobile Number" is
// mobile_number).
const ALIASES: Record<string, string> = {
  mobile: "phone",
  mobile_number: "phone",
  phone_number: "phone",
  whatsapp: "phone",
  msisdn: "phone",
  customer_name: "name",
  full_name: "name",
  store_code: "store",
  total_orders: "orders",
  order_count: "orders",
  ltv: "lifetime_value",
  last_order_date: "last_order",
  sent: "sent_at",
  sent_on: "sent_at",
  stop: "opted_out",
  control_group: "control",
};
const KNOWN_FIELDS = new Set<string>(FIELDS);
// A customer with nothing known: whatever a CSV doesn't say stays like this.
const BLANK: Customer = {
  phone: "",
  name: "",
  store: "",
  segment: 0,
  flow: "",
  last_order: "",
  orders: 0,
  lifetime_value: 0,
  sent_at: "",
  read: 0,
  replied: 0,
  basket: 0,
  first_order_at: "",
  second_order_at: "",
  revenue: 0,
  opted_out: 0,
  control: 0,
  extra: "{}",
  sample: 0,
};

// CSV text as rows of cells. A quoted cell can hold commas, line breaks and "" for a quote; a line ends at \n, \r\n
// or a lone \r.
export function parseCsv(text: string): string[][] {
  const csv = text.replace(/^﻿/, ""); // Excel's byte-order mark
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (csv[i + 1] === '"') {
        cell += '"';
        i++; // past the second quote of the pair
      } else {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  // The last line, when the text doesn't end with a line break.
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// Indian mobiles in any common form become 91 + 10 digits; other numbers keep their country code. "" if it can't be
// a phone number.
export function phoneOf(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^00/, ""); // 00 is the international prefix
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 11 && digits[0] === "0") return `91${digits.slice(1)}`; // dialled with a leading 0
  if (digits.length < 11 || digits.length > 15) return "";
  if (digits.startsWith("91") && digits.length !== 12) return ""; // an Indian number is 91 + 10 digits
  return digits;
}

// YYYY-MM-DD (time ignored) or day-first DD/MM/YYYY, as Indian exports write them; "" if it isn't a real date.
export function dateOf(value: string) {
  const parts = dateParts(value.trim());
  if (!parts) return "";
  const [year, month, date] = parts;
  const utc = new Date(Date.UTC(year, month - 1, date));
  // 31/02 is no date: Date.UTC rolls it over into March.
  if (!year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== date) return "";
  return utc.toISOString().slice(0, 10);
}

// A CSV's rows as customers (by phone; a later row wins), the known columns it had, and how many rows had no usable
// phone.
export function toCustomers(table: string[][]) {
  const [header = [], ...body] = table;
  const fields = header.map((heading) => fieldOf(heading));
  const columns: string[] = [...new Set(fields.filter((field) => KNOWN_FIELDS.has(field)))];
  if (fields.some((field) => !KNOWN_FIELDS.has(field))) columns.push("extra");
  const byPhone = new Map<string, Customer>();
  let skipped = 0;
  for (const cells of body) {
    if (cells.every((cell) => !cell.trim())) continue; // a blank line isn't a skipped row
    const customer = customerOf(cells, header, fields);
    if (!customer) {
      skipped++;
      continue;
    }
    byPhone.set(customer.phone, customer);
  }
  return { rows: [...byPhone.values()], columns, skipped };
}

// Year, month and day as written, or undefined if the text starts with neither form. The day-first form also takes
// . or - between the parts.
function dateParts(text: string): [number, number, number] | undefined {
  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/);
  if (dmy) return [Number(dmy[3]) + (dmy[3].length === 2 ? 2000 : 0), Number(dmy[2]), Number(dmy[1])]; // 26 is 2026
  return undefined;
}

// A heading as one of our field names: "Customer Name" and "customer_name" both become "name".
function fieldOf(heading: string) {
  const key = heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ALIASES[key] ?? key;
}

// One row as a customer, or undefined without a usable phone. `header` has the headings as written, `fields` the
// same columns as field names.
function customerOf(cells: string[], header: string[], fields: string[]): Customer | undefined {
  const cell = (field: string) => {
    const i = fields.indexOf(field);
    return i < 0 ? "" : (cells[i] ?? "");
  };
  const phone = phoneOf(cell("phone"));
  if (!phone) return undefined;
  const flowCell = cell("flow").trim();
  const flow = FLOWS.find((f) => f.key === flowCell || f.code === flowCell)?.key ?? "";
  // Free text is capped: a name at 120 characters, each other column at 200.
  const extra = Object.fromEntries(
    header
      .map((heading, i) => [heading.trim(), (cells[i] ?? "").trim().slice(0, 200)])
      .filter(([, value], i) => !KNOWN_FIELDS.has(fields[i]) && value),
  );
  return {
    ...BLANK,
    phone,
    name: cell("name").trim().slice(0, 120),
    store: storeOf(cell("store")),
    segment: segmentOf(cell("segment")) || SEGMENT_OF[flow] || 0, // else the flow's segment
    flow,
    last_order: dateOf(cell("last_order")),
    orders: numOf(cell("orders")),
    lifetime_value: numOf(cell("lifetime_value")),
    sent_at: dateOf(cell("sent_at")),
    read: flagOf(cell("read")),
    replied: flagOf(cell("replied")),
    basket: flagOf(cell("basket")),
    first_order_at: dateOf(cell("first_order_at")),
    second_order_at: dateOf(cell("second_order_at")),
    revenue: numOf(cell("revenue")),
    opted_out: flagOf(cell("opted_out")),
    control: flagOf(cell("control")),
    extra: JSON.stringify(extra),
  };
}

// 1 for yes, y, true or 1, else 0; a date counts as yes.
function flagOf(value: string) {
  return /^(1|y|yes|true)$/i.test(value.trim()) || dateOf(value) ? 1 : 0;
}

// A positive amount, rounded, ignoring ₹, commas and spaces; 0 for anything else.
function numOf(value: string) {
  const amount = Number(value.replace(/[₹,\s]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
}

// A store code, from the code or any part of the store's name ("Banjara Hills" or "Hyderabad"); "" if unknown.
function storeOf(value: string) {
  const wanted = value.trim().toLowerCase();
  if (!wanted) return "";
  const matches = STORES.filter(
    (store) =>
      store.code === wanted ||
      store.name
        .toLowerCase()
        .split(",")
        .some((part) => part.trim() === wanted),
  );
  return matches.length === 1 ? matches[0].code : ""; // "Mumbai" is two stores: left blank
}

// A segment number, from the number or the name; 0 if unknown.
function segmentOf(value: string) {
  const wanted = value.trim().toLowerCase();
  return segments.find((segment) => String(segment.n) === wanted || segment.name.toLowerCase() === wanted)?.n ?? 0;
}

// ── The board: everything the page shows, for one set of filters ─────────────────────────────────────────────────
type DateRange = [from: string, to: string]; // both days included; a `from` of "" means from the start
type Period = {
  label: string;
  range: (today: string) => DateRange;
  before?: (today: string) => DateRange; // the stretch just before, to compare with
};
type ListRule = (customer: Customer) => boolean;

// By the day the message went out. All time is the default: a second order takes up to 45 days, so a recent stretch
// always reads low.
export const PERIODS: Record<string, Period> = {
  all: { label: "All time", range: (today) => ["", today] },
  last4: { label: "Last 4 weeks", range: lastFourWeeks, before: fourWeeksBefore },
  prev4: { label: "4 weeks before", range: fourWeeksBefore },
};
// Customers per page of the list.
export const PAGE_SIZE = 25;

const HOT_LEAD_DAYS = 21; // hot leads were messaged in the last 3 weeks
const MONTH_DAYS = 30; // "this month": unhappy customers, quiet VIPs, and orders after a call
const MIN_CONTROL_GROUP = 20; // fewer held back is too few to compare with
const MIN_FLOW_SENDS = 30; // fewer sends is too few to judge a flow by
const WEEKS = 12; // in the weekly series
const CALL_DAYS = 14; // in the calls-a-day series
// The call lists, in the order the customer list puts them first.
const LIST_ORDER = ["due", "hot", "unhappy", "vip"];
// Segment numbers, as in content/flows.
const LAPSED_VIPS = 1;
const SERVICE_BRUISED = 6;

// The query string is untrusted: anything unknown falls back to its default.
export function parseFilters(query: Record<string, string | string[] | undefined>) {
  const param = (key: string) => (typeof query[key] === "string" ? query[key].trim() : "");
  const period = param("period");
  const store = param("store");
  const segment = param("segment");
  const list = param("list");
  const flow = param("flow");
  const page = Number(param("page"));
  const customer = param("customer");
  return {
    period: Object.hasOwn(PERIODS, period) ? period : "all",
    store: STORES.some((s) => s.code === store) ? store : "all",
    segment: segments.some((s) => String(s.n) === segment) ? Number(segment) : 0,
    list: Object.hasOwn(LISTS, list) ? list : "all",
    flow: FLOWS.some((f) => f.key === flow) ? flow : "",
    q: param("q").slice(0, 60),
    page: Number.isInteger(page) && page > 1 ? page : 1,
    customer: /^\d{8,15}$/.test(customer) ? customer : "",
    panel: param("panel") === "import" ? "import" : "",
  };
}
export type Filters = ReturnType<typeof parseFilters>;

// A link to this view with some filters changed; defaults stay out of the URL.
export function dashboardHref(filters: Filters, change: Partial<Filters>) {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.period !== "all") params.set("period", next.period);
  if (next.store !== "all") params.set("store", next.store);
  if (next.segment) params.set("segment", String(next.segment));
  if (next.list !== "all") params.set("list", next.list);
  if (next.flow) params.set("flow", next.flow);
  if (next.q) params.set("q", next.q);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.customer) params.set("customer", next.customer);
  if (next.panel) params.set("panel", next.panel);
  const search = params.toString();
  return search ? `/dashboard?${search}` : "/dashboard";
}

// `part` out of `whole`, 0 when there is no whole.
export const rate = (part: number, whole: number) => (whole ? part / whole : 0);

// `calls` come oldest first, as db.ts reads them. Every number covers the chosen store and segment only.
export function buildBoard(customers: Customer[], calls: Call[], filters: Filters, today: string) {
  const { store, segment } = filters;
  const scope = customers.filter((c) => (store === "all" || c.store === store) && (!segment || c.segment === segment));
  const inScope = new Set(scope.map((c) => c.phone));
  const scopeCalls = calls.filter((call) => inScope.has(call.phone));
  const lastCall = new Map(scopeCalls.map((call) => [call.phone, call])); // the newest call per phone wins
  const period = PERIODS[filters.period];
  const range = period.range(today);
  const messaged = messagedIn(scope, range);
  const heldBack = scope.filter((c) => c.control && sentDuring(c, range));
  const won = messaged.filter(wonBack);
  const wonRate = rate(won.length, messaged.length);
  const rules = listRules(lastCall, today);
  const counts = Object.fromEntries(Object.entries(rules).map(([list, rule]) => [list, scope.filter(rule).length]));
  const weakest = weakestFlow(messaged);
  const listed = listCustomers(scope, rules, filters);
  const todaysCalls = scopeCalls.filter((call) => dayOf(call.at) === today);
  return {
    inactive: scope.length,
    untouched: scope.filter((c) => !c.sent_at && !c.control).length,
    since: firstSendDay(scope),
    messaged: messaged.length,
    messagedBefore: period.before ? messagedIn(scope, period.before(today)).length : undefined,
    won: won.length,
    wonRate,
    lift: liftOverControl(wonRate, heldBack),
    revenue: revenueOf(messaged),
    spend: messageSpend(messaged),
    funnel: STAGES.map((label, stage) => ({ label, n: reached(messaged, stage) })),
    weekly: weeklySeries(scope, today),
    callsToday: todaysCalls.length,
    reachedToday: todaysCalls.filter((call) => OUTCOMES[call.outcome]?.reached).length,
    callsDaily: callsPerDay(scopeCalls, today),
    orderedAfterCall: orderedAfterCall(scope, scopeCalls, today),
    counts,
    weakest,
    total: listed.length,
    rows: listed.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE).map((c) => {
      const last = lastCall.get(c.phone);
      return { c, last, stop: stopReason(c, last) };
    }),
    // Newest first, whatever the filters.
    history: (phone: string) => calls.filter((call) => call.phone === phone).reverse(),
  };
}

// Today and the 27 days before it; then the 4 weeks before those.
function lastFourWeeks(today: string): DateRange {
  return [addDays(today, -27), today];
}
function fourWeeksBefore(today: string): DateRange {
  return [addDays(today, -55), addDays(today, -28)];
}

function sentDuring(customer: Customer, [from, to]: DateRange) {
  return !!customer.sent_at && customer.sent_at >= from && customer.sent_at <= to;
}
// The control group is held back, so never messaged.
function messagedIn(customers: Customer[], range: DateRange) {
  return customers.filter((c) => !c.control && sentDuring(c, range));
}

// Who is on each call list, given everyone's last call. Nobody who can't be called is on any of them.
function listRules(lastCall: Map<string, Call>, today: string): Record<string, ListRule> {
  const callable = (customer: Customer) => !stopReason(customer, lastCall.get(customer.phone));
  // The day a call back was promised for, "" if none.
  const followUp = (customer: Customer) => lastCall.get(customer.phone)?.follow_up ?? "";
  // Their flow went out between `fromDays` and `toDays` days ago.
  const sentWithin = (customer: Customer, fromDays: number, toDays: number) =>
    !!customer.sent_at &&
    daysBetween(customer.sent_at, today) >= fromDays &&
    daysBetween(customer.sent_at, today) <= toDays;
  // Never called, or not in the last `days` days.
  const notCalledFor = (customer: Customer, days: number) => {
    const call = lastCall.get(customer.phone);
    return !call || daysBetween(dayOf(call.at), today) >= days;
  };
  return {
    // A call back was promised for today or before.
    due: (customer) => callable(customer) && !!followUp(customer) && followUp(customer) <= today,
    // Messaged in the last 3 weeks and replied or filled a basket, no order yet; not called in the last 3 days, and
    // no call back promised for a later day.
    hot: (customer) =>
      callable(customer) &&
      sentWithin(customer, 0, HOT_LEAD_DAYS) &&
      !!(customer.replied || customer.basket) &&
      !customer.first_order_at &&
      notCalledFor(customer, 3) &&
      !(followUp(customer) > today),
    // Service-bruised, messaged this month and replied, no order yet, and never called.
    unhappy: (customer) =>
      callable(customer) &&
      customer.segment === SERVICE_BRUISED &&
      sentWithin(customer, 0, MONTH_DAYS) &&
      !!customer.replied &&
      !customer.first_order_at &&
      !lastCall.has(customer.phone),
    // A lapsed VIP messaged 3 to 30 days ago, no reply or order yet, and not called in the last week.
    vip: (customer) =>
      callable(customer) &&
      customer.segment === LAPSED_VIPS &&
      sentWithin(customer, 3, MONTH_DAYS) &&
      !customer.replied &&
      !customer.first_order_at &&
      notCalledFor(customer, 7),
  };
}

// The weakest flow with enough sends to judge, if its reply rate trails the overall one by a third or more.
function weakestFlow(messaged: Customer[]) {
  const average = replyRate(messaged);
  const lagging = FLOWS.map((flow) => {
    const sends = messaged.filter((c) => c.flow === flow.key);
    return { ...flow, sent: sends.length, replied: replyRate(sends) };
  }).filter((flow) => flow.sent >= MIN_FLOW_SENDS && flow.replied < average * 0.67);
  const weakest = lagging.sort((a, b) => a.replied - b.replied)[0];
  return weakest && { ...weakest, average };
}

// How many got at least as far as `stage`.
function reached(customers: Customer[], stage: number) {
  return customers.filter((c) => stageOf(c) >= stage).length;
}
function replyRate(customers: Customer[]) {
  return rate(reached(customers, REPLIED_STAGE), customers.length);
}

// The customer table's rows: the chosen call list, flow and search. Call lists first, in LIST_ORDER, then everyone
// else; the highest lifetime value first within each.
function listCustomers(scope: Customer[], rules: Record<string, ListRule>, filters: Filters) {
  const words = filters.q.toLowerCase();
  const digits = filters.q.replace(/\D/g, "");
  const onList = (c: Customer) => filters.list === "all" || rules[filters.list](c);
  const ofFlow = (c: Customer) => !filters.flow || c.flow === filters.flow;
  // By name, or by phone once the search has 3 digits.
  const found = (c: Customer) =>
    !filters.q || c.name.toLowerCase().includes(words) || (digits.length >= 3 && c.phone.includes(digits));
  const rank = (c: Customer) => {
    const i = LIST_ORDER.findIndex((list) => rules[list](c));
    return i < 0 ? LIST_ORDER.length : i;
  };
  return scope
    .filter((c) => onList(c) && ofFlow(c) && found(c))
    .map((customer) => ({ customer, rank: rank(customer) }))
    .sort((a, b) => a.rank - b.rank || b.customer.lifetime_value - a.customer.lifetime_value)
    .map(({ customer }) => customer);
}

// The day the first message went out, "" before any has.
function firstSendDay(customers: Customer[]) {
  let first = "";
  for (const c of customers) {
    if (c.sent_at && (!first || c.sent_at < first)) first = c.sent_at;
  }
  return first;
}

// Percentage points won back above the control group's own rate; undefined while the group is too small to compare.
function liftOverControl(wonRate: number, heldBack: Customer[]) {
  if (heldBack.length < MIN_CONTROL_GROUP) return undefined;
  return (wonRate - rate(heldBack.filter(wonBack).length, heldBack.length)) * 100;
}

function revenueOf(customers: Customer[]) {
  return customers.reduce((total, c) => total + c.revenue, 0);
}

// ≈ Meta + Gupshup: ₹1.10 a marketing template, ₹0.25 a utility one, ₹1.20 for the replies to each who answered.
function messageSpend(messaged: Customer[]) {
  let spend = 0;
  for (const c of messaged) {
    spend += UTILITY_FLOWS.has(c.flow) ? 0.25 : 1.1;
    if (stageOf(c) >= REPLIED_STAGE) spend += 1.2;
  }
  return spend;
}

// The last 12 weeks, oldest first, by the day the message went out. A week is still filling while a second order
// from it can come in.
function weeklySeries(scope: Customer[], today: string) {
  return Array.from({ length: WEEKS }, (_, i) => {
    const start = addDays(today, -7 * (WEEKS - i) + 1);
    const sent = messagedIn(scope, [start, addDays(start, 6)]);
    return {
      start,
      messaged: sent.length,
      won: sent.filter(wonBack).length,
      revenue: revenueOf(sent),
      filling: daysBetween(start, today) < WON_BACK_DAYS,
    };
  });
}

// Calls a day over the last 14 days, oldest first.
function callsPerDay(calls: Call[], today: string) {
  return Array.from({ length: CALL_DAYS }, (_, i) => {
    const date = addDays(today, i - CALL_DAYS + 1);
    return calls.filter((call) => dayOf(call.at) === date).length;
  });
}

// How many ordered on or after the day of their first call, for first calls in the last 30 days.
function orderedAfterCall(scope: Customer[], calls: Call[], today: string) {
  const firstCallDay = new Map<string, string>();
  for (const call of calls) {
    if (!firstCallDay.has(call.phone)) firstCallDay.set(call.phone, dayOf(call.at));
  }
  return scope.filter((c) => {
    const called = firstCallDay.get(c.phone);
    return !!called && daysBetween(called, today) <= MONTH_DAYS && !!c.first_order_at && c.first_order_at >= called;
  }).length;
}

// ── Sample customers: the shape of a real export, with numbers no one can be called on ────────────────────────────
type Random = () => number;
type SampleFunnel = [reply: number, basket: number, firstOrder: number, secondOrder: number, controlFirstOrder: number];
type SampleSegment = [
  perFlow: number,
  funnel: SampleFunnel,
  averageOrder: number,
  optOut: number,
  pastOrders: [fewest: number, most: number],
];

const NAMES = [
  "Aarav",
  "Aditi",
  "Aisha",
  "Ananya",
  "Anjali",
  "Arjun",
  "Dev",
  "Diya",
  "Farhan",
  "Ira",
  "Ishaan",
  "Kabir",
  "Kavya",
  "Kiran",
  "Kunal",
  "Leela",
  "Manav",
  "Meera",
  "Mira",
  "Neha",
  "Nikhil",
  "Nisha",
  "Pooja",
  "Priya",
  "Raghav",
  "Rahul",
  "Riya",
  "Rohan",
  "Sameer",
  "Sanya",
  "Shreya",
  "Siddharth",
  "Tanvi",
  "Tara",
  "Uday",
  "Varun",
  "Vikram",
  "Yash",
  "Zoya",
  "Om",
];
const SURNAMES = [
  "Sharma",
  "Mehta",
  "Rao",
  "Iyer",
  "Kapoor",
  "Khan",
  "Reddy",
  "Nair",
  "Gupta",
  "Bose",
  "Singh",
  "Desai",
  "Menon",
  "Joshi",
  "Malhotra",
  "Banerjee",
  "Pillai",
  "Shah",
  "Verma",
  "Chopra",
];
// Per segment: customers per flow; [reply rate, basket after reply, first order after basket, second after first, the
// control group's own first-order rate]; average order ₹; opt-out rate; and past orders, fewest to most.
const SAMPLE: Record<number, SampleSegment> = {
  1: [60, [0.4, 0.48, 0.6, 0.7, 0.05], 3400, 0.004, [10, 25]],
  2: [220, [0.34, 0.42, 0.55, 0.6, 0.03], 5200, 0.006, [1, 4]],
  3: [130, [0.26, 0.35, 0.4, 0.62, 0.02], 2100, 0.008, [1, 3]],
  4: [140, [0.31, 0.33, 0.45, 0.6, 0.02], 1800, 0.012, [1, 1]],
  5: [90, [0.39, 0.43, 0.6, 0.66, 0.04], 2300, 0.005, [2, 8]],
  6: [150, [0.57, 0.23, 0.5, 0.68, 0.02], 1900, 0.006, [1, 6]],
};
// Each store's share of the sample customers.
const STORE_WEIGHT: Record<string, number> = {
  vasantkunj: 1.3,
  gurugram: 1.1,
  mumbai_bandra: 1,
  mumbai_lokhandwala: 0.9,
  hyderabad: 0.85,
  bengaluru: 0.85,
};
// No answer is twice as likely as each other outcome.
const CALL_OUTCOMES = ["no_answer", "no_answer", "interested", "call_back", "ordering", "not_interested"];
const CALLERS = ["Ritu", "Sameer", "Asha"];
const NOTES: Record<string, string[]> = {
  ordering: ["Placing the order tonight", "Wants the hamper delivered Saturday"],
  interested: ["Asked about Diwali hampers", "Will check the basket after work"],
  call_back: ["Busy, call after 6", "Travelling, back next week"],
  not_interested: ["Shops elsewhere now", "Moved out of the city"],
  no_answer: [""],
};

// Seeded random numbers in [0, 1): an FNV-1a hash of the seed, then xorshift32 steps. The same seed always gives the
// same numbers, so the sample is the same everywhere.
export function seededRandom(seed: string) {
  let state = 2166136261; // FNV-1a's offset basis
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619); // and its prime
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296; // as unsigned 32 bits, over 2^32
  };
}

export function sampleCustomers(today: string): Customer[] {
  const random = seededRandom("customers");
  // Each store's code, repeated by its weight, so a pick follows the weights.
  const stores = STORES.flatMap((store) => Array<string>(Math.round(STORE_WEIGHT[store.code] * 10)).fill(store.code));
  const customers: Customer[] = [];
  for (const flow of flows) {
    const [perFlow] = SAMPLE[flow.n];
    for (let i = 0; i < perFlow; i++) {
      // +91 00000 …: no Indian mobile starts with 0
      const phone = `9100000${String(customers.length + 1).padStart(5, "0")}`;
      customers.push(sampleCustomer(random, flow, phone, stores, today));
    }
  }
  return customers;
}

// A few days of calls to the sample's warm leads, so the call numbers and follow-ups have something to show.
export function sampleCalls(customers: Customer[], today: string): NewCall[] {
  const random = seededRandom("calls");
  const calls: NewCall[] = [];
  for (const customer of customers) {
    const warm = !customer.control && !customer.opted_out && !!(customer.replied || customer.basket);
    if (!warm || random() > 0.3) continue; // 3 in 10 get a call
    const callDay = addDays(today, -between(random, 0, 9)); // in the last 10 days
    if (callDay < customer.sent_at) continue; // not before their message went out
    calls.push(sampleCall(random, customer.phone, callDay));
  }
  return calls.sort((a, b) => a.at.localeCompare(b.at));
}

// One sample customer of a flow: how far the message took them, then who they are. `random` is drawn from in a fixed
// order, some draws only when the step before happened: change that and every customer after it changes.
function sampleCustomer(random: Random, flow: Flow, phone: string, stores: string[], today: string): Customer {
  const [, funnel, averageOrder, optOut, [fewestOrders, mostOrders]] = SAMPLE[flow.n];
  const journey = sampleJourney(random, funnel, today);
  const orders = between(random, fewestOrders, mostOrders);
  const name = `${pick(random, NAMES)} ${pick(random, SURNAMES)}`;
  const store = pick(random, stores);
  const lastOrder = addDays(journey.sentAt || today, -between(random, 31, 150));
  const lifetimeValue = Math.round(orders * averageOrder * (0.7 + 0.6 * random()));
  const firstRevenue = journey.firstOrderAt ? averageOrder * (0.8 + 0.4 * random()) : 0;
  const secondRevenue = journey.secondOrderAt ? averageOrder * (0.8 + 0.4 * random()) : 0;
  const optedOut = !!journey.sentAt && !journey.control && random() < optOut;
  return {
    ...BLANK,
    phone,
    name,
    store,
    segment: flow.n,
    flow: flow.key,
    last_order: lastOrder,
    orders,
    lifetime_value: lifetimeValue,
    sent_at: journey.sentAt,
    read: Number(journey.read),
    replied: Number(journey.replied),
    basket: Number(journey.inBasket),
    first_order_at: journey.firstOrderAt,
    second_order_at: journey.secondOrderAt,
    revenue: Math.round(firstRevenue + secondRevenue),
    opted_out: Number(optedOut),
    control: Number(journey.control),
    sample: 1,
  };
}

// How far a sample customer's message took them. Each step can only follow the one before, and draws only then.
function sampleJourney(random: Random, funnel: SampleFunnel, today: string) {
  const [reply, basket, firstOrder, secondOrder, controlFirstOrder] = funnel;
  const sentAt = random() < 0.15 ? "" : addDays(today, -between(random, 0, 83)); // some still waiting for their flow
  const control = !!sentAt && random() < 0.1;
  const read = !!sentAt && !control && random() < 0.72;
  const replied = read && random() < reply;
  const inBasket = replied && random() < basket;
  // A first order 1 to 14 days after the message: the control group at its own rate, the rest likelier the further
  // they got. A second follows 4 to 40 days after the first.
  let firstOrderChance = 0.01;
  if (control) firstOrderChance = controlFirstOrder;
  else if (inBasket) firstOrderChance = firstOrder;
  else if (replied) firstOrderChance = 0.12;
  else if (read) firstOrderChance = 0.03;
  const firstOrderAt = random() < firstOrderChance ? dayAfter(sentAt, between(random, 1, 14), today) : "";
  const secondOrderAt =
    firstOrderAt && random() < secondOrder ? dayAfter(firstOrderAt, between(random, 4, 40), today) : "";
  return { sentAt, control, read, replied, inBasket, firstOrderAt, secondOrderAt };
}

// One call on `callDay`, between 9:30 and 3:30 in India; a promise to call back, or interest, sets a follow-up.
function sampleCall(random: Random, phone: string, callDay: string): NewCall {
  const outcome = pick(random, CALL_OUTCOMES);
  const hour = between(random, 4, 9); // UTC
  const minute = between(random, 0, 59);
  const caller = pick(random, CALLERS);
  const note = pick(random, NOTES[outcome]);
  const followUp = outcome === "call_back" || outcome === "interested" ? addDays(callDay, between(random, 1, 4)) : "";
  return {
    phone,
    at: `${callDay}T0${hour}:${String(minute).padStart(2, "0")}:00.000Z`,
    caller,
    outcome,
    note,
    follow_up: followUp,
  };
}

// The day `days` after `from`, or "" with no `from` or while that day is still to come.
function dayAfter(from: string, days: number, today: string) {
  if (!from) return "";
  const date = addDays(from, days);
  return date <= today ? date : "";
}

function pick<T>(random: Random, items: T[]) {
  return items[Math.floor(random() * items.length)];
}

// A whole number from `min` to `max`, both included.
function between(random: Random, min: number, max: number) {
  return min + Math.floor(random() * (max - min + 1));
}

// ── Formatting ─────────────────────────────────────────────────────────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LAKH = 100_000;
const CRORE = 10_000_000;

// "2026-10-06" as "6 Oct".
export const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
// Rounded, with Indian digit grouping: 1,23,456.
export const formatCount = (value: number) => Math.round(value).toLocaleString("en-IN");
// Rupees: ₹11,800, then lakhs (₹24.7 L) and crores (₹1.2 Cr).
export const formatRupees = (rupees: number) => {
  if (rupees >= CRORE) return `₹${(rupees / CRORE).toFixed(1)} Cr`;
  if (rupees >= LAKH) return `₹${(rupees / LAKH).toFixed(1)} L`;
  return `₹${formatCount(rupees)}`;
};
// A share as a percentage, with a decimal below 10%.
export const formatPercent = (share: number, digits = share < 0.1 ? 1 : 0) => `${(share * 100).toFixed(digits)}%`;
// +91 98765 43210 for an Indian number, + and the digits for any other.
export const formatPhone = (phone: string) =>
  phone.startsWith("91") && phone.length === 12 ? `+91 ${phone.slice(2, 7)} ${phone.slice(7)}` : `+${phone}`;
// Each store's short name: "Vasant Kunj", not "Vasant Kunj, New Delhi".
export const STORE_SHORT_NAMES = Object.fromEntries(STORES.map((store) => [store.code, store.name.split(",")[0]]));
