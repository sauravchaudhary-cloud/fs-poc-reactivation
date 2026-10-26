"use server";
// The dashboard's server action: a call logged from the customer drawer's form.
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { OUTCOMES } from "./data.ts";
import { database } from "./db.ts";

// Everything in the form is untrusted: the outcome must be a known one, the customer must exist, the free text is
// capped, and a follow-up must be a YYYY-MM-DD date.
export async function logCall(form: FormData) {
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const phone = field("phone");
  const outcome = field("outcome");
  const db = database();
  if (!Object.hasOwn(OUTCOMES, outcome) || !db.has(phone)) return;
  const caller = field("caller").slice(0, 60);
  const followUp = field("follow_up");
  db.addCall({
    phone,
    outcome,
    caller,
    note: field("note").slice(0, 1000),
    follow_up: /^\d{4}-\d{2}-\d{2}$/.test(followUp) ? followUp : "",
    at: new Date().toISOString(),
  });
  // Remember who called, to prefill the form next time.
  if (caller) {
    (await cookies()).set("caller", caller, {
      maxAge: 60 * 60 * 24 * 365, // a year
      httpOnly: true,
      sameSite: "lax",
      path: "/dashboard",
    });
  }
  refresh();
}
