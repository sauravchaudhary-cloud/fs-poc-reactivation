// The clickable WhatsApp demo (components/demo/demo.tsx). It reads the URL (?flow=2.1, ?dev), so it renders per request
// inside Suspense, as the dashboards do.
import { Suspense } from "react";
import { Demo } from "@/components/demo/demo";

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}
