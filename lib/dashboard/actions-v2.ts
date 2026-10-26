"use server";
import { cookies } from "next/headers";
import { logCall } from "./actions.ts";

// /dashboard-v2's Log form: logCall, and the caller's name remembered there too. logCall's cookie has the path
// /dashboard, which doesn't cover /dashboard-v2.
export async function logCallV2(form: FormData) {
  await logCall(form);
  const caller = String(form.get("caller") ?? "")
    .trim()
    .slice(0, 60);
  if (caller)
    (await cookies()).set("caller", caller, {
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: "lax",
      path: "/dashboard-v2",
    });
}
