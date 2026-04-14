import { after, NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { summarizeSession } from "@/lib/ai/summarize-session";
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

    const visibleIds: string[] = [];
    for (const sessionId of sessionIds) {
      const [session] = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), visibleSessionsCondition()))
        .limit(1);

      if (session) {
        visibleIds.push(session.id);
      }
    }

    after(async () => {
      for (const sessionId of visibleIds) {
        await summarizeSession(sessionId);
      }
    });

    return NextResponse.json(
      {
        queued: visibleIds.length,
        skipped: sessionIds.length - visibleIds.length,
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("[agent-observer] Batch session summarize error:", err);
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
