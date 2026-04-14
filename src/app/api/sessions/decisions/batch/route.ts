import { after, NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  createDecisionRun,
  findRunningDecisionRun,
  runDecisionExtraction,
} from "@/lib/ai/extract-decisions-batch";
import { visibleSessionsCondition } from "@/lib/session-visibility";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sessionIds?: unknown;
    };
    const sessionIds = normalizeSessionIds(body.sessionIds);

    if (sessionIds.length === 0) {
      return NextResponse.json({ error: "no_session_ids" }, { status: 400 });
    }

    const queuedRuns: Array<{ runId: number; sessionId: string }> = [];
    let skipped = 0;

    for (const sessionId of sessionIds) {
      const [session] = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), visibleSessionsCondition()))
        .limit(1);

      if (!session) {
        skipped += 1;
        continue;
      }

      const running = await findRunningDecisionRun(sessionId);
      if (running) {
        skipped += 1;
        continue;
      }

      const run = await createDecisionRun(sessionId);
      queuedRuns.push({ runId: run.id, sessionId });
    }

    after(async () => {
      for (const queued of queuedRuns) {
        await runDecisionExtraction(queued.runId, queued.sessionId);
      }
    });

    return NextResponse.json(
      {
        queued: queuedRuns.length,
        skipped,
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("[agent-observer] Batch decisions extract error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

function normalizeSessionIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 200);
}
