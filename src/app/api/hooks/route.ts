import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, events, tickets } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { buildCanonicalFailureSummary } from "@/lib/ai/decision-pipeline/failure";
import { maybeAutoProcessPreviousDayReportOnFirstEvent } from "@/lib/daily-reports";
import { summarizeSession } from "@/lib/ai/summarize-session";
import { adaptHookPayload } from "@/lib/hooks/adapters";
import { extractSessionData } from "@/lib/session-extraction";
import {
  isAssistantMessageEventType,
  isSessionEndEventType,
  isSessionStartEventType,
  isToolErrorEventType,
  shouldSummarizeAfterEventType,
} from "@/lib/hooks/events";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date();
    const event = adaptHookPayload(body);

    if (!event) {
      return NextResponse.json({});
    }

    const [existingSession] = await db
      .select({
        id: sessions.id,
      })
      .from(sessions)
      .where(eq(sessions.id, event.sessionId));

    if (isSessionEndEventType(event.eventType) && !existingSession) {
      return NextResponse.json({});
    }

    const extracted = extractSessionData({
      cwd: event.cwd,
      source: event.sourceDescriptor,
      model: event.model,
    });
    const ticketId = extracted.ticketId;
    const extractedData =
      Object.keys(extracted.data).length > 0
        ? JSON.stringify(extracted.data)
        : null;

    if (ticketId && extracted.customer) {
      db.insert(tickets)
        .values({
          id: ticketId,
          customer: extracted.customer,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tickets.id,
          set: {
            customer: extracted.customer,
            updatedAt: now,
          },
        })
        .run();
    }

    // Upsert session
    if (isSessionStartEventType(event.eventType)) {
      db.insert(sessions)
        .values({
          id: event.sessionId,
          cwd: event.cwd,
          ...(ticketId ? { ticketId } : {}),
          ...(extracted.sessionName ? { sessionName: extracted.sessionName } : {}),
          ...(extracted.sessionGroup ? { sessionGroup: extracted.sessionGroup } : {}),
          ...(extractedData ? { extractedData } : {}),
          source: event.sourceDescriptor,
          model: event.model,
          startedAt: now,
          eventCount: 0,
        })
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            cwd: sql`COALESCE(${event.cwd}, ${sessions.cwd})`,
            source: sql`COALESCE(${event.sourceDescriptor}, ${sessions.source})`,
            model: sql`COALESCE(${event.model}, ${sessions.model})`,
            startedAt: now,
            ...(ticketId ? { ticketId } : {}),
            ...(extracted.sessionName ? { sessionName: extracted.sessionName } : {}),
            ...(extracted.sessionGroup ? { sessionGroup: extracted.sessionGroup } : {}),
            ...(extractedData ? { extractedData } : {}),
          },
        })
        .run();
    } else if (isSessionEndEventType(event.eventType)) {
      db.insert(sessions)
        .values({
          id: event.sessionId,
          cwd: event.cwd,
          ...(ticketId ? { ticketId } : {}),
          ...(extracted.sessionName ? { sessionName: extracted.sessionName } : {}),
          ...(extracted.sessionGroup ? { sessionGroup: extracted.sessionGroup } : {}),
          ...(extractedData ? { extractedData } : {}),
          source: event.sourceDescriptor,
          model: event.model,
          endedAt: now,
          eventCount: 0,
        })
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            endedAt: now,
            cwd: sql`COALESCE(${event.cwd}, ${sessions.cwd})`,
            source: sql`COALESCE(${event.sourceDescriptor}, ${sessions.source})`,
            model: sql`COALESCE(${event.model}, ${sessions.model})`,
            ...(ticketId ? { ticketId } : {}),
            ...(extracted.sessionName ? { sessionName: extracted.sessionName } : {}),
            ...(extracted.sessionGroup ? { sessionGroup: extracted.sessionGroup } : {}),
            ...(extractedData ? { extractedData } : {}),
          },
        })
        .run();
    } else {
      // Ensure session exists, tag with extractor outputs if detected
      db.insert(sessions)
        .values({
          id: event.sessionId,
          cwd: event.cwd,
          ...(ticketId ? { ticketId } : {}),
          ...(extracted.sessionName ? { sessionName: extracted.sessionName } : {}),
          ...(extracted.sessionGroup ? { sessionGroup: extracted.sessionGroup } : {}),
          ...(extractedData ? { extractedData } : {}),
          source: event.sourceDescriptor,
          model: event.model,
          startedAt: now,
          eventCount: 0,
        })
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            ...(ticketId ? { ticketId } : {}),
            ...(extracted.sessionName ? { sessionName: extracted.sessionName } : {}),
            ...(extracted.sessionGroup ? { sessionGroup: extracted.sessionGroup } : {}),
            ...(extractedData ? { extractedData } : {}),
            cwd: sql`COALESCE(${event.cwd}, ${sessions.cwd})`,
            source: sql`COALESCE(${event.sourceDescriptor}, ${sessions.source})`,
            model: sql`COALESCE(${event.model}, ${sessions.model})`,
          },
        })
        .run();
    }

    const serializedToolResponse =
      event.toolResponse !== undefined && event.toolResponse !== null
        ? JSON.stringify(event.toolResponse)
        : body.error !== undefined
          ? JSON.stringify({ error: body.error })
          : null;
    const failureSummary =
      isToolErrorEventType(event.eventType)
        ? buildCanonicalFailureSummary({
            toolName: event.toolName,
            toolInput: event.toolInput,
            toolResponse: event.toolResponse,
            error: body.error,
          })
        : null;

    // Insert the event
    const [insertedEvent] = await db
      .insert(events)
      .values({
        sessionId: event.sessionId,
        eventType: event.eventType,
        source: event.sourceDescriptor,
        model: event.model,
        toolName: event.toolName,
        toolInput:
          event.toolInput !== undefined && event.toolInput !== null
            ? JSON.stringify(event.toolInput)
            : null,
        toolResponse: serializedToolResponse,
        failureOperation: failureSummary?.operation ?? null,
        failureType: failureSummary?.failureType ?? null,
        failureExitCode: failureSummary?.exitCode ?? null,
        failureErrorLine: failureSummary?.firstActionableErrorLine ?? null,
        prompt: event.prompt,
        response: event.response,
        payload: JSON.stringify(body),
        timestamp: now,
      })
      .returning({ id: events.id });

    // Increment event count
    db.update(sessions)
      .set({ eventCount: sql`${sessions.eventCount} + 1` })
      .where(eq(sessions.id, event.sessionId))
      .run();

    if (
      shouldSummarizeAfterEventType(event.eventType) ||
      isAssistantMessageEventType(event.eventType)
    ) {
      after(() => summarizeSession(event.sessionId));
    }

    after(async () => {
      try {
        if (insertedEvent?.id) {
          await maybeAutoProcessPreviousDayReportOnFirstEvent(now, insertedEvent.id);
        }
      } catch (error) {
        console.error("[agent-observer] Auto day report error:", error);
      }
    });

    return NextResponse.json({});
  } catch (err) {
    console.error("[agent-observer] Hook error:", err);
    return NextResponse.json({});
  }
}
