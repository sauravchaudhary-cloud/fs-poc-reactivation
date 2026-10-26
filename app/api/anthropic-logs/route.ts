import { NextResponse } from "next/server";
import { getAnthropicLogs, clearAnthropicLogs } from "@/lib/anthropic-logger";

export async function GET() {
  const data = getAnthropicLogs();
  return NextResponse.json(data);
}

export async function DELETE() {
  clearAnthropicLogs();
  return NextResponse.json({ ok: true });
}
