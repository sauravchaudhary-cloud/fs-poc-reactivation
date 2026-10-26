// The import panel posts its CSV here, as a plain form post, so a big file isn't held to a server action's body size
// limit (1 MB by default). Back to the dashboard with what happened.
import { parseCsv, toCustomers } from "@/lib/dashboard/data";
import { database } from "@/lib/dashboard/db";

const MAX_BYTES = 50_000_000; // the import panel says 50 MB

export async function POST(request: Request) {
  const url = new URL(request.url);
  // Only this page's own form: a form on another site arrives with that site's origin.
  if (request.headers.get("origin") !== url.origin) return new Response("Forbidden", { status: 403 });
  const backToDashboard = (query: string) => Response.redirect(new URL(`/dashboard?${query}`, url), 303);
  const file = (await request.formData()).get("file");
  if (!(file instanceof File) || !file.size) return backToDashboard("panel=import&error=empty");
  if (file.size > MAX_BYTES) return backToDashboard("panel=import&error=big");
  const { rows, columns, skipped } = toCustomers(parseCsv(await file.text()));
  if (!rows.length) return backToDashboard(`panel=import&error=nophone&skipped=${skipped}`);
  database().importCustomers(rows, columns);
  return backToDashboard(`imported=${rows.length}&skipped=${skipped}`);
}
