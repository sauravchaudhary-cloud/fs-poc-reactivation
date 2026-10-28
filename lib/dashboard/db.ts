// Customers and the calls logged against them, in one SQLite file on this machine (data/dashboard.db, kept out of git),
// through Node's built-in node:sqlite. A team sharing the dashboard online needs a hosted database instead; the
// functions below are the whole interface to swap. Server-only.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FIELDS, indiaDate, sampleCalls, sampleCustomers, type Call, type Customer } from "./data.ts";

type NewCall = Omit<Call, "id">; // not saved yet, so no id

// The customers table's columns, in order, and which of them hold text; the rest are integers.
const COLUMNS = [...FIELDS, "extra", "sample"];
const TEXT_COLUMNS = new Set([
  "phone",
  "name",
  "store",
  "flow",
  "last_order",
  "sent_at",
  "first_order_at",
  "second_order_at",
  "extra",
]);

// Opens the file, or a throwaway database for ":memory:". A new database starts with the sample customers.
// ponytail: on Vercel only /tmp is writable, and it's per instance and wiped on cold starts, so imports and logged calls
// there don't last; a hosted database (Neon, Turso) behind these same functions if the deployed dashboard must keep data.
export function openDatabase(file = process.env.VERCEL ? "/tmp/dashboard.db" : "data/dashboard.db") {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  createTables(db);
  sampleOfToday(db);

  return {
    sampleOfToday: (today?: string) => sampleOfToday(db, today),
    customers: () => db.prepare("select * from customers").all() as Customer[],
    calls: () => db.prepare("select * from calls order by at, id").all() as Call[],
    has: (phone: string) => !!db.prepare("select 1 from customers where phone = ?").get(phone),
    addCall: (call: NewCall) => insertCall(db, call),
    // The first real import clears the sample customers and their calls; after that, customers are updated by phone
    // and their calls are kept.
    importCustomers: (rows: Customer[], columns: string[]) =>
      inTransaction(db, () => {
        db.exec(
          "delete from calls where phone in (select phone from customers where sample = 1); delete from customers where sample = 1;",
        );
        upsert(db, rows, columns);
      }),
  };
}

let opened: ReturnType<typeof openDatabase> | undefined;
// The app's database, opened on first use, with a sample from an earlier day seeded again.
export const database = () => {
  opened ??= openDatabase();
  opened.sampleOfToday();
  return opened;
};

function createTables(db: DatabaseSync) {
  const columns = COLUMNS.map(
    (column) => `${column} ${TEXT_COLUMNS.has(column) ? "text not null default ''" : "integer not null default 0"}`,
  );
  db.exec(`
    create table if not exists customers (${columns.join(", ")}, primary key (phone));
    create table if not exists calls (
      id integer primary key, phone text not null, at text not null, caller text not null default '',
      outcome text not null, note text not null default '', follow_up text not null default ''
    );
    create index if not exists calls_by_phone on calls (phone);
  `);
}

// The sample customers and a few days of calls to them, until the first real import. The sample is dated from the day
// it's seeded, so a sample from an earlier day is seeded again (the same customers, today's dates): the call lists
// never go stale between demos. user_version holds the day it was seeded, as 20261028.
function sampleOfToday(db: DatabaseSync, today = indiaDate()) {
  const day = Number(today.replaceAll("-", ""));
  const { customers, real } = db
    .prepare("select count(*) as customers, coalesce(sum(sample = 0), 0) as real from customers")
    .get() as { customers: number; real: number };
  const { user_version } = db.prepare("pragma user_version").get() as { user_version: number };
  if (real || (customers && user_version === day)) return;
  const sample = sampleCustomers(today);
  inTransaction(db, () => {
    db.exec(
      "delete from calls where phone in (select phone from customers where sample = 1); delete from customers where sample = 1;",
    );
    upsert(db, sample, COLUMNS);
    for (const call of sampleCalls(sample, today)) insertCall(db, call);
    db.exec(`pragma user_version = ${day}`);
  });
}

// Insert or update by phone, touching only the columns given: a CSV without names doesn't wipe the names already here.
// Column names come from FIELDS (data.ts), never from the file.
function upsert(db: DatabaseSync, rows: Customer[], columns: string[]) {
  const keys = ["phone", ...columns.filter((column) => column !== "phone")];
  // With only the phone given there is nothing to update, but the statement needs something to set.
  const updates =
    keys
      .slice(1)
      .map((column) => `${column} = excluded.${column}`)
      .join(", ") || "phone = excluded.phone";
  const statement = db.prepare(
    `insert into customers (${keys.join(", ")}) values (${keys.map(() => "?").join(", ")}) on conflict (phone) do update set ${updates}`,
  );
  for (const row of rows) statement.run(...keys.map((key) => row[key as keyof Customer]));
}

function insertCall(db: DatabaseSync, call: NewCall) {
  db.prepare("insert into calls (phone, at, caller, outcome, note, follow_up) values (?, ?, ?, ?, ?, ?)").run(
    call.phone,
    call.at,
    call.caller,
    call.outcome,
    call.note,
    call.follow_up,
  );
}

// All of `work` is saved, or none of it.
function inTransaction(db: DatabaseSync, work: () => void) {
  db.exec("begin");
  try {
    work();
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}
