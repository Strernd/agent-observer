import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { decisionRuns, decisions } from "@/db/schema";
import { and, asc, desc, eq, gt } from "drizzle-orm";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseCursor(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const cursor = parseCursor(request.nextUrl.searchParams.get("cursor"));
    const status = request.nextUrl.searchParams.get("status");

    const [latestSuccessfulRun] = await db
      .select({
        id: decisionRuns.id,
        startedAt: decisionRuns.startedAt,
      })
      .from(decisionRuns)
      .where(and(eq(decisionRuns.sessionId, id), eq(decisionRuns.status, "succeeded")))
      .orderBy(desc(decisionRuns.startedAt), desc(decisionRuns.id))
      .limit(1);

    if (!latestSuccessfulRun) {
      return NextResponse.json({
        sessionId: id,
        status,
        limit,
        cursor,
        count: 0,
        hasMore: false,
        nextCursor: null,
        decisions: [],
      });
    }

    const filters = [
      eq(decisions.sessionId, id),
      eq(decisions.runId, latestSuccessfulRun.id),
    ];

    if (cursor !== null) {
      filters.push(gt(decisions.id, cursor));
    }

    const rows = await db
      .select({
        id: decisions.id,
        sessionId: decisions.sessionId,
        runId: decisions.runId,
        ordinal: decisions.ordinal,
        decision: decisions.decision,
        whyPivotal: decisions.whyPivotal,
        confidence: decisions.confidence,
        category: decisions.category,
        evidenceEventIds: decisions.evidenceEventIds,
        whatFailed: decisions.whatFailed,
        createdAt: decisions.createdAt,
      })
      .from(decisions)
      .where(and(...filters))
      .orderBy(asc(decisions.ordinal), asc(decisions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && pageRows.length > 0
        ? String(pageRows[pageRows.length - 1].id)
        : null;

    return NextResponse.json({
      sessionId: id,
      status,
      runId: latestSuccessfulRun.id,
      limit,
      cursor,
      count: pageRows.length,
      hasMore,
      nextCursor,
      decisions: pageRows,
    });
  } catch (err) {
    console.error("[agent-observer] Decisions API error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
