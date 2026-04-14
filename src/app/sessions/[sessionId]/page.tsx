import { db } from "@/db";
import { sessions, events, tickets } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SessionTabs } from "@/components/session-tabs";
import { SessionNameEditor } from "@/components/session-name-editor";
import { SessionTicketButton } from "@/components/session-ticket-button";
import { SummaryTriggerButton } from "@/components/summary-trigger-button";
import { DecisionsPanel } from "@/components/decisions-panel";
import { EventRow } from "@/components/event-row";
import { buildLinearIssueUrl } from "@/lib/observer-config";
import {
  resolveSessionExtraction,
} from "@/lib/session-extraction";
import {
  SessionTypeBadge,
  SourceBadge,
  ToolBadge,
  SeverityBadge,
} from "@/components/badge";
import { Card } from "@/components/ui/card";
import { duration, formatDate, formatTime, relativeTimestamp } from "@/lib/format";
import { isVisibleSessionRow } from "@/lib/session-visibility";
import type { OutputArtifact } from "@/lib/ai/schemas";
import { ArtifactActions } from "@/components/artifact-actions";
import Link from "next/link";
import {
  buildGroupWorkItemId,
  buildWorkItemPath,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";

interface ToolUsed {
  name: string;
  count: number;
}

interface FrictionPoint {
  description: string;
  severity: string;
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { sessionId } = await params;
  const { tab = "summary" } = await searchParams;

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (!session || !isVisibleSessionRow(session)) return notFound();

  // Get ticket info if tagged
  let ticket = null;
  if (session.ticketId) {
    const [t] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, session.ticketId));
    ticket = t ?? null;
  }
  const derived = resolveSessionExtraction(session);
  const ticketId = ticket?.id ?? derived.ticketId;
  const ticketCustomer = ticket?.customer ?? derived.customer;
  const linearIssueUrl = buildLinearIssueUrl(ticketId);
  const displayName = derived.sessionName ?? "Session";
  const [latestEvent] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.sessionId, session.id))
    .orderBy(desc(events.id))
    .limit(1);
  const latestEventId = latestEvent?.id ?? null;
  const summaryNeedsRefresh =
    latestEventId !== null &&
    (session.summaryLastProcessedEventId ?? 0) < latestEventId;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <h1 className="text-[20px] font-semibold tracking-tight">
                {displayName}
              </h1>
              <SessionNameEditor
                sessionId={session.id}
                currentName={session.sessionName ?? displayName}
              />
            </div>
            <SourceBadge source={session.source} />
            <SessionTypeBadge type={session.sessionType} />
            {derived.sessionGroup && (
              <Link
                href={buildWorkItemPath(buildGroupWorkItemId(derived.sessionGroup))}
                className="text-[12px] text-gray-700 hover:text-gray-1000 hover:underline"
              >
                {derived.sessionGroup}
              </Link>
            )}
          </div>
          {ticketId ? (
            linearIssueUrl ? (
              <a
                href={linearIssueUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-mono text-blue-700 hover:underline"
              >
                {ticketId}
              </a>
            ) : (
              <span className="text-[13px] font-mono text-blue-700">
                {ticketId}
              </span>
            )
          ) : (
            <SessionTicketButton
              sessionId={session.id}
              currentTicketId={ticketId}
              fallbackCustomer={ticketCustomer ?? derived.sessionGroup ?? null}
            />
          )}
        </div>
        {session.cwd && (
          <p className="mb-2 break-all font-mono text-[12px] text-gray-700">
            {session.cwd}
          </p>
        )}
        <div className="flex items-center gap-4 text-[12px] text-gray-700">
          {session.startedAt && (
            <>
              <span>{formatDate(session.startedAt)}</span>
              <span>{formatTime(session.startedAt)}</span>
              <span>{duration(session.startedAt, session.endedAt)}</span>
            </>
          )}
          <span>{session.eventCount} events</span>
          {session.model && (
            <span className="font-mono">{session.model}</span>
          )}
          <span className="font-mono text-gray-600">
            {session.id.slice(0, 12)}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <SessionTabs />

      {/* Tab content */}
      <div className="mt-6">
        {tab === "summary" && (
          <SummaryTab
            sessionId={session.id}
            session={{
              summary: session.summary,
              toolsUsed: session.toolsUsed,
              frictionPoints: session.frictionPoints,
              outputArtifacts: session.outputArtifacts,
              extractedData: derived.data,
              summaryNeedsRefresh,
            }}
          />
        )}
        {tab === "decisions" && (
          <DecisionsTab sessionId={session.id} category="autonomous_decision" />
        )}
        {tab === "friction" && (
          <DecisionsTab sessionId={session.id} category="friction" />
        )}
        {tab === "events" && (
          <EventsTab
            sessionId={session.id}
            sessionStart={session.startedAt}
          />
        )}
      </div>
    </div>
  );
}

function SummaryTab({
  sessionId,
  session,
}: {
  sessionId: string;
  session: {
    summary: string | null;
    toolsUsed: string | null;
    frictionPoints: string | null;
    outputArtifacts: string | null;
    extractedData: Record<string, string>;
    summaryNeedsRefresh: boolean;
  };
}) {
  const tools: ToolUsed[] = session.toolsUsed
    ? JSON.parse(session.toolsUsed)
    : [];
  const friction: FrictionPoint[] = session.frictionPoints
    ? JSON.parse(session.frictionPoints)
    : [];
  const outputArtifacts: OutputArtifact[] = parseJsonArray<OutputArtifact>(
    session.outputArtifacts
  );
  const extractedEntries = Object.entries(session.extractedData);

  if (
    !session.summary &&
    tools.length === 0 &&
    friction.length === 0 &&
    outputArtifacts.length === 0 &&
    extractedEntries.length === 0
  ) {
    return (
      <Card className="p-8 text-center">
        <p className="text-[14px] text-gray-900">No summary yet</p>
        <p className="text-[13px] text-gray-700 mt-1">
          Summaries are generated automatically when a session ends.
        </p>
        <div className="mt-4 flex justify-center">
          <SummaryTriggerButton sessionId={sessionId} hasSummary={false} />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <SummaryTriggerButton
          sessionId={sessionId}
          hasSummary={Boolean(session.summary)}
          needsRefresh={session.summaryNeedsRefresh}
        />
      </div>

      {session.summary && (
        <div>
          <h3 className="text-[14px] font-semibold mb-2">Summary</h3>
          <p className="text-[14px] text-gray-900 leading-relaxed">
            {session.summary}
          </p>
        </div>
      )}

      {tools.length > 0 && (
        <div>
          <h3 className="text-[14px] font-semibold mb-2">Tools & Skills</h3>
          <div className="flex flex-wrap gap-2">
            {tools
              .sort((a, b) => b.count - a.count)
              .map((t) => (
                <div key={t.name} className="flex items-center gap-1">
                  <ToolBadge name={t.name} />
                  <span className="text-[11px] text-gray-700">x{t.count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {friction.length > 0 && (
        <div>
          <h3 className="text-[14px] font-semibold mb-2">Friction Points</h3>
          <div className="space-y-2">
            {friction.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <SeverityBadge severity={f.severity} />
                <span className="text-[13px] text-gray-900">
                  {f.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {outputArtifacts.length > 0 && (
        <div>
          <h3 className="text-[14px] font-semibold mb-2">Outputs</h3>
          <div className="space-y-2">
            {outputArtifacts.map((artifact) => (
              <div key={artifact.path} className="text-[13px] text-gray-900">
                <ArtifactActions
                  artifactPath={artifact.path}
                  sessionId={sessionId}
                  className="max-w-md"
                />
                <div className="text-[11px] text-gray-700">
                  {artifact.sourceTool} event #{artifact.sourceEventId}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {extractedEntries.length > 0 && (
        <div>
          <h3 className="text-[14px] font-semibold mb-2">
            Extracted Metadata
          </h3>
          <div className="space-y-1">
            {extractedEntries
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, value]) => (
                <div key={key} className="text-[13px] text-gray-900">
                  <span className="mr-2 font-mono text-[12px] text-gray-700">
                    {key}
                  </span>
                  {isHttpUrl(value) ? (
                    <a
                      href={value}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 hover:underline"
                    >
                      {value}
                    </a>
                  ) : (
                    <span>{value}</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DecisionsTab({ sessionId, category }: { sessionId: string; category?: string }) {
  return <DecisionsPanel sessionId={sessionId} category={category} />;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function EventsTab({
  sessionId,
  sessionStart,
}: {
  sessionId: string;
  sessionStart: Date | null;
}) {
  const eventList = await db
    .select()
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .orderBy(asc(events.timestamp));

  if (eventList.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-[14px] text-gray-900">No events recorded</p>
      </Card>
    );
  }

  const baseTime = sessionStart ?? eventList[0].timestamp;

  return (
    <Card className="overflow-hidden">
      {eventList.map((e) => (
        <EventRow
          key={e.id}
          eventType={e.eventType}
          source={e.source}
          model={e.model}
          toolName={e.toolName}
          toolInput={e.toolInput}
          toolResponse={e.toolResponse}
          prompt={e.prompt}
          response={e.response}
          payload={e.payload}
          relativeTime={relativeTimestamp(baseTime, e.timestamp)}
        />
      ))}
    </Card>
  );
}
