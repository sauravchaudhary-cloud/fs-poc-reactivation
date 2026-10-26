import { POST as importCsv } from "@/app/dashboard/import/route";

// /dashboard's import, landing back on /dashboard-v2.
export async function POST(req: Request) {
  const res = await importCsv(req);
  const back = res.headers.get("location");
  return back ? Response.redirect(back.replace("/dashboard?", "/dashboard-v2?"), 303) : res;
}
