import { NextRequest, NextResponse } from "next/server";
import { summarizeTicketWithPendingSessions } from "@/lib/ai/summarize-ticket";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await summarizeTicketWithPendingSessions(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agent-observer] Ticket summarize error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
