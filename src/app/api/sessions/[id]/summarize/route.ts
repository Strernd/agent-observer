import { NextRequest, NextResponse } from "next/server";
import { summarizeSession } from "@/lib/ai/summarize-session";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await summarizeSession(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agent-observer] Summarize error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
