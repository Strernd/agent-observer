import { NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  getLatestDecisionRun,
  getLatestSuccessfulDecisionRun,
} from "@/lib/ai/extract-decisions-batch";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [latestRun, latestSuccessfulRun, latestEvent] = await Promise.all([
      getLatestDecisionRun(id),
      getLatestSuccessfulDecisionRun(id),
      db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.sessionId, id))
        .orderBy(desc(events.id))
        .limit(1),
    ]);
    const latestEventId = latestEvent[0]?.id ?? null;
    const needsRefresh =
      latestSuccessfulRun !== null &&
      latestEventId !== null &&
      (latestSuccessfulRun.lastProcessedEventId ?? 0) < latestEventId;

    return NextResponse.json({
      sessionId: id,
      run: latestRun,
      latestSuccessfulRun,
      latestEventId,
      needsRefresh,
    });
  } catch (err) {
    console.error("[agent-observer] Decision latest run API error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
