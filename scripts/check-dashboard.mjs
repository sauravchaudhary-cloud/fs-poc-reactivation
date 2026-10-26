// Checks the dashboard's model and storage (part of `npm run check`): reading a CSV export, the call lists, the sample
// data, formatting and query parsing, and the SQLite round trip. Fails if the dashboard misreads an import, miscounts
// the funnel or the call lists, or the database round trip breaks. The sections share fixtures and run in order.
import assert from "node:assert/strict";
import {
  buildBoard,
  dateOf,
  dashboardHref,
  formatRupees,
  parseFilters,
  parseCsv,
  formatPercent,
  phoneOf,
  sampleCalls,
  sampleCustomers,
  stageOf,
  toCustomers,
  wonBack,
} from "../lib/dashboard/data.ts";
import { openDatabase } from "../lib/dashboard/db.ts";

// A fixed day, so the lists and the sample don't move with the clock.
const today = "2026-10-22";

// ── CSV import ────────────────────────────────────────────────────────────────────────────────────────────────────
// Quotes, doubled quotes, a comma and a line break inside quotes, Excel's BOM, CRLF.
assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x, ""y""",2\n"multi\nline",3'), [
  ["a", "b"],
  ['x, "y"', "2"],
  ["multi\nline", "3"],
]);
// An Indian mobile in any common form becomes 91 + 10 digits, a UK number keeps its code, too few digits is no number.
const phones = [
  ["98765 43210", "919876543210"],
  ["+91 98765-43210", "919876543210"],
  ["098765 43210", "919876543210"],
  ["0091 9876543210", "919876543210"],
  ["44 7911 123456", "447911123456"],
  ["12345", ""],
  ["9112345", ""],
];
assert.deepEqual(
  phones.map(([text]) => phoneOf(text)),
  phones.map(([, phone]) => phone),
);
// Year first or day first, time ignored; 31 Feb and a month-first date are no date.
const dates = [
  ["2026-10-21", "2026-10-21"],
  ["21/10/2026", "2026-10-21"],
  ["21-10-26", "2026-10-21"],
  ["2026-10-21T09:30", "2026-10-21"],
  ["31/02/2026", ""],
  ["10/21/2026", ""],
  ["", ""],
];
assert.deepEqual(
  dates.map(([text]) => dateOf(text)),
  dates.map(([, date]) => date),
);

// An export as it comes: other names for the columns, a row without a phone, the same phone twice, a city with two
// stores, and a column the dashboard doesn't know (Email).
const csv = `Mobile,Customer Name,Store,Segment,Flow,Sent On,Replied,Basket,First_Order_At,Second Order At,Revenue,LTV,Email
98765 43210,Anjali Rao,Banjara Hills,,1.1,21/09/2026,yes,1,2026-09-24,2026-10-20,"₹4,200",14200,a@x.in
,No Phone,,,,,,,,,,,
98765 43210,Anjali R,,,,,,,,,,,
91234 56789,Dev,Mumbai,Quiet regulars,,2026-10-01,no,,,,,,`;
const { rows, columns, skipped } = toCustomers(parseCsv(csv));
assert.equal(skipped, 1, "the row without a phone is skipped");
assert.equal(rows.length, 2, "a repeated phone is one customer, the later row winning");
const [anjali, dev] = rows;
assert.equal(anjali.name, "Anjali R");
assert.deepEqual(
  [dev.store, dev.segment, dev.sent_at, dev.replied],
  ["", 5, "2026-10-01", 0],
  "Mumbai is two stores, so left blank",
);
assert.ok(
  columns.includes("phone") &&
    columns.includes("lifetime_value") &&
    columns.includes("extra") &&
    !columns.includes("email"),
);
// Anjali's first row on its own: every known column read, the unknown one kept in `extra`.
const first = toCustomers(parseCsv(csv.split("\n").slice(0, 2).join("\n"))).rows[0];
assert.deepEqual(
  [first.store, first.segment, first.flow, first.revenue, first.lifetime_value, JSON.parse(first.extra).Email],
  ["hyderabad", 1, "vip-kept-aside", 4200, 14200, "a@x.in"],
);
// Won back: a second order within 45 days of the message.
assert.ok(wonBack(first) && stageOf(first) === 5, "a second order 29 days after the message counts");
const late = { ...first, second_order_at: "2026-11-06" };
assert.ok(!wonBack(late) && stageOf(late) === 4, "46 days doesn't");

// ── Call lists ────────────────────────────────────────────────────────────────────────────────────────────────────
// A hot lead leaves the list once called, comes back as due on the follow-up day, and do-not-call ends it.
const lead = {
  ...first,
  phone: "919000000001",
  sent_at: "2026-10-15",
  replied: 1,
  first_order_at: "",
  second_order_at: "",
  sample: 0,
};
const view = (calls, change = {}) => buildBoard([lead], calls, { ...parseFilters({}), ...change }, today);
const call = (outcome, day, follow_up = "") => ({
  id: 1,
  phone: lead.phone,
  at: `${day}T05:00:00.000Z`,
  caller: "",
  outcome,
  note: "",
  follow_up,
});
assert.equal(view([]).counts.hot, 1);
const calledYesterday = view([call("call_back", "2026-10-21", "2026-10-23")]);
assert.deepEqual(
  [calledYesterday.counts.hot, calledYesterday.counts.due],
  [0, 0],
  "called yesterday, follow-up tomorrow",
);
assert.equal(view([call("call_back", "2026-10-20", "2026-10-22")]).counts.due, 1, "follow-up due today");
const doNotCall = view([call("do_not_call", "2026-10-10")]);
assert.deepEqual(doNotCall.counts, { due: 0, hot: 0, unhappy: 0, vip: 0 });
assert.equal(doNotCall.rows[0].stop, "Do not call");
assert.equal(view([], { segment: 2 }).inactive, 0, "the segment filter applies");

// ── Sample data ───────────────────────────────────────────────────────────────────────────────────────────────────
// The sample, with calls only on its warm leads: a funnel that only narrows, numbers nobody can be called on, and a
// board of 12 weeks, 14 days of calls and a page of 25 customers.
const sample = sampleCustomers(today);
const all = buildBoard(sample, sampleCalls(sample, today), parseFilters({ period: "all" }), today);
assert.ok(
  all.funnel.every((stage, i, funnel) => !i || funnel[i - 1].n >= stage.n),
  "the funnel widens somewhere",
);
assert.ok(sample.every((c) => /^9100000\d{5}$/.test(c.phone) && c.sample === 1));
assert.ok(all.weekly.length === 12 && all.callsDaily.length === 14 && all.rows.length === 25);

// ── Formatting and query parsing ──────────────────────────────────────────────────────────────────────────────────
assert.deepEqual(
  [formatRupees(2_470_000), formatRupees(11_800), formatPercent(0.0021, 2), formatPercent(0.71)],
  ["₹24.7 L", "₹11,800", "0.21%", "71%"],
);
// The query string is untrusted: anything unknown falls back to its default, even a name every object has (toString).
assert.deepEqual(
  parseFilters({
    period: "toString",
    store: "<script>",
    segment: "9",
    list: "constructor",
    customer: "abc",
    page: "-2",
  }),
  parseFilters({}),
);
// Defaults stay out of the URL.
assert.equal(
  dashboardHref(parseFilters({ store: "gurugram", list: "hot" }), { page: 2 }),
  "/dashboard?store=gurugram&list=hot&page=2",
);

// ── Database round trip ───────────────────────────────────────────────────────────────────────────────────────────
// Seeds the sample, the first import clears it, later imports touch only their own columns, calls persist.
const db = openDatabase(":memory:");
assert.equal(db.customers().length, sample.length);
db.importCustomers(rows, columns);
assert.equal(db.customers().length, 2);
assert.equal(db.calls().length, 0, "the sample's calls go with it");
db.addCall({
  phone: anjali.phone,
  at: "2026-10-22T05:00:00.000Z",
  caller: "Ritu",
  outcome: "interested",
  note: "",
  follow_up: "",
});
// A narrower import: just Anjali's phone and replied.
const update = toCustomers(parseCsv("phone,replied\n9876543210,no"));
db.importCustomers(update.rows, update.columns);
const after = db.customers().find((customer) => customer.phone === anjali.phone);
assert.deepEqual(
  [after.name, after.replied, db.calls().length],
  ["Anjali R", 0, 1],
  "names and calls survive a narrower import",
);
console.log("dashboard ok:", sample.length, "sample customers");
