import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";

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
    const includePayload =
      request.nextUrl.searchParams.get("includePayload") === "1";

    const filters = [eq(events.sessionId, id)];
    if (cursor !== null) {
      filters.push(gt(events.id, cursor));
    }

    const rows = await db
      .select({
        id: events.id,
        sessionId: events.sessionId,
        eventType: events.eventType,
        source: events.source,
        model: events.model,
        toolName: events.toolName,
        toolInput: events.toolInput,
        toolResponse: events.toolResponse,
        failureOperation: events.failureOperation,
        failureType: events.failureType,
        failureExitCode: events.failureExitCode,
        failureErrorLine: events.failureErrorLine,
        prompt: events.prompt,
        response: events.response,
        payload: events.payload,
        timestamp: events.timestamp,
      })
      .from(events)
      .where(and(...filters))
      .orderBy(asc(events.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const responseRows = includePayload
      ? pageRows
      : pageRows.map((row) => {
          const { payload, ...rest } = row;
          void payload;
          return rest;
        });
    const nextCursor =
      hasMore && pageRows.length > 0
        ? String(pageRows[pageRows.length - 1].id)
        : null;

    return NextResponse.json({
      sessionId: id,
      limit,
      cursor,
      count: pageRows.length,
      hasMore,
      nextCursor,
      events: responseRows,
    });
  } catch (err) {
    console.error("[agent-observer] Events API error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
