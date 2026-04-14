import { db } from "@/db";
import { events, tickets, sessions } from "@/db/schema";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { TicketCard } from "@/components/ticket-card";
import type { TicketArtifactMenuItem } from "@/components/ticket-artifacts-menu";
import type { OutputArtifact } from "@/lib/ai/schemas";
import { SearchInput } from "@/components/search-input";
import { Card } from "@/components/ui/card";
import { Suspense } from "react";
import { visibleSessionsCondition } from "@/lib/session-visibility";
import {
  getLatestSessionGroupEventIds,
  getLatestTicketEventIds,
} from "@/lib/session-ai-state";
import {
  buildGroupWorkItemId,
  deriveSessionGroupCustomer,
  deriveSessionGroupTitle,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";

type WorkItemListRow = {
  routeId: string;
  id: string;
  customer: string;
  title: string | null;
  currentState: string | null;
  progress: string | null;
  summaryLastProcessedEventId: number | null;
  sessionCount: number;
  latestActivity: number | null;
};

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const conditions = [];
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        sql`${tickets.id} LIKE ${pattern}`,
        sql`${tickets.customer} LIKE ${pattern}`,
        sql`${tickets.title} LIKE ${pattern}`,
        sql`${tickets.summaryCurrentState} LIKE ${pattern}`
      )
    );
  }

  const latestActivityExpr = sql<number>`max(coalesce(${events.timestamp}, coalesce(${sessions.endedAt}, ${sessions.startedAt}))) * 1000`;
  const realTicketRows = await db
    .select({
      id: tickets.id,
      customer: tickets.customer,
      title: tickets.title,
      currentState: tickets.summaryCurrentState,
      progress: tickets.summaryProgress,
      summaryLastProcessedEventId: tickets.summaryLastProcessedEventId,
      sessionCount: sql<number>`count(distinct ${sessions.id})`,
      latestActivity: latestActivityExpr,
    })
    .from(tickets)
    .innerJoin(
      sessions,
      and(eq(sessions.ticketId, tickets.id), visibleSessionsCondition())
    )
    .leftJoin(events, eq(events.sessionId, sessions.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(tickets.id)
    .orderBy(desc(latestActivityExpr));
  const sessionGroupConditions = [isNull(sessions.ticketId), isNotNull(sessions.sessionGroup), visibleSessionsCondition()];
  if (q) {
    const pattern = `%${q}%`;
    sessionGroupConditions.push(
      or(
        sql`${sessions.sessionGroup} LIKE ${pattern}`,
        sql`coalesce(${sessions.sessionName}, '') LIKE ${pattern}`,
        sql`coalesce(${sessions.summary}, '') LIKE ${pattern}`,
        sql`coalesce(${sessions.cwd}, '') LIKE ${pattern}`
      )!
    );
  }
  const sessionGroupRows = await db
    .select({
      sessionGroup: sessions.sessionGroup,
      sessionCount: sql<number>`count(distinct ${sessions.id})`,
      latestActivity: latestActivityExpr,
    })
    .from(sessions)
    .leftJoin(events, eq(events.sessionId, sessions.id))
    .where(and(...sessionGroupConditions))
    .groupBy(sessions.sessionGroup)
    .orderBy(desc(latestActivityExpr));
  const groupSummaryIds = sessionGroupRows
    .map((row) => row.sessionGroup)
    .filter((value): value is string => typeof value === "string")
    .map((sessionGroup) => buildGroupWorkItemId(sessionGroup));
  const groupSummaryRows =
    groupSummaryIds.length > 0
      ? await db
          .select({
            id: tickets.id,
            customer: tickets.customer,
            title: tickets.title,
            currentState: tickets.summaryCurrentState,
            progress: tickets.summaryProgress,
            summaryLastProcessedEventId: tickets.summaryLastProcessedEventId,
          })
          .from(tickets)
          .where(inArray(tickets.id, groupSummaryIds))
      : [];
  const groupSummaryById = new Map(groupSummaryRows.map((row) => [row.id, row]));
  const realTicketIds = realTicketRows
    .map((ticket) => ticket.id)
    .filter((value): value is string => typeof value === "string");
  const realWorkItems: WorkItemListRow[] = realTicketRows
    .filter(
      (ticket): ticket is typeof ticket & { id: string; customer: string } =>
        typeof ticket.id === "string" && typeof ticket.customer === "string"
    )
    .map((ticket) => ({
      routeId: ticket.id,
      id: ticket.id,
      customer: ticket.customer,
      title: ticket.title,
      currentState: ticket.currentState,
      progress: ticket.progress,
      summaryLastProcessedEventId: ticket.summaryLastProcessedEventId,
      sessionCount: ticket.sessionCount,
      latestActivity: ticket.latestActivity,
    }));
  const ticketList: WorkItemListRow[] = [
    ...realWorkItems,
    ...sessionGroupRows.flatMap((row) => {
      if (typeof row.sessionGroup !== "string") {
        return [];
      }

      const sessionGroup = row.sessionGroup;
      const routeId = buildGroupWorkItemId(sessionGroup);
      const summaryRow = groupSummaryById.get(routeId);
      return [
        {
          routeId,
          id: sessionGroup,
          customer:
            summaryRow?.customer ?? deriveSessionGroupCustomer(sessionGroup),
          title: summaryRow?.title ?? deriveSessionGroupTitle(sessionGroup),
          currentState: summaryRow?.currentState ?? null,
          progress: summaryRow?.progress ?? null,
          summaryLastProcessedEventId:
            summaryRow?.summaryLastProcessedEventId ?? null,
          sessionCount: row.sessionCount,
          latestActivity: row.latestActivity,
        },
      ];
    }),
  ].sort((a, b) => (b.latestActivity ?? 0) - (a.latestActivity ?? 0));
  const latestTicketEventIds = await getLatestTicketEventIds(
    realTicketIds
  );
  const latestSessionGroupEventIds = await getLatestSessionGroupEventIds(
    sessionGroupRows
      .map((row) => row.sessionGroup)
      .filter((value): value is string => typeof value === "string")
  );
  const sessionArtifactsByTicket = new Map<string, TicketArtifactMenuItem[]>();

  if (realTicketIds.length > 0) {
    const sessionArtifactRows = await db
      .select({
        ticketId: sessions.ticketId,
        sessionId: sessions.id,
        outputArtifacts: sessions.outputArtifacts,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .where(
        and(
          inArray(
            sessions.ticketId,
            realTicketIds
          ),
          visibleSessionsCondition()
        )
      )
      .orderBy(desc(sessions.startedAt));

    for (const row of sessionArtifactRows) {
      if (!row.ticketId) continue;
      const existing = sessionArtifactsByTicket.get(row.ticketId) ?? [];
      const seenPaths = new Set(existing.map((artifact) => artifact.path));

      for (const artifact of parseJsonArray<OutputArtifact>(row.outputArtifacts)) {
        if (seenPaths.has(artifact.path)) continue;
        seenPaths.add(artifact.path);
        existing.push({
          path: artifact.path,
          sessionId: row.sessionId,
        });
      }

      sessionArtifactsByTicket.set(row.ticketId, existing);
    }
  }

  const sessionGroups = sessionGroupRows
    .map((row) => row.sessionGroup)
    .filter((value): value is string => typeof value === "string");
  if (sessionGroups.length > 0) {
    const sessionArtifactRows = await db
      .select({
        sessionGroup: sessions.sessionGroup,
        sessionId: sessions.id,
        outputArtifacts: sessions.outputArtifacts,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .where(
        and(
          inArray(sessions.sessionGroup, sessionGroups),
          isNull(sessions.ticketId),
          visibleSessionsCondition()
        )
      )
      .orderBy(desc(sessions.startedAt));

    for (const row of sessionArtifactRows) {
      if (!row.sessionGroup) continue;
      const routeId = buildGroupWorkItemId(row.sessionGroup);
      const existing = sessionArtifactsByTicket.get(routeId) ?? [];
      const seenPaths = new Set(existing.map((artifact) => artifact.path));

      for (const artifact of parseJsonArray<OutputArtifact>(row.outputArtifacts)) {
        if (seenPaths.has(artifact.path)) continue;
        seenPaths.add(artifact.path);
        existing.push({
          path: artifact.path,
          sessionId: row.sessionId,
        });
      }

      sessionArtifactsByTicket.set(routeId, existing);
    }
  }

  // Group by customer
  const grouped = new Map<string, typeof ticketList>();
  for (const t of ticketList) {
    const existing = grouped.get(t.customer) ?? [];
    existing.push(t);
    grouped.set(t.customer, existing);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center gap-8 mb-6">
        <h1 className="text-[24px] font-semibold tracking-tight">Work Items</h1>
        <span className="text-[13px] text-gray-900">
          <strong className="text-gray-1000">{ticketList.length}</strong> work item
          {ticketList.length !== 1 ? "s" : ""}
          {q ? ` matching \u201c${q}\u201d` : ""}
        </span>
      </div>

      <div className="mb-6">
        <Suspense>
          <SearchInput placeholder="Search by work item, folder group, customer, title..." />
        </Suspense>
      </div>

      {ticketList.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-[15px] text-gray-900">No work items yet</p>
          <p className="text-[13px] text-gray-700 mt-1">
            Work items come from configured extraction rules or manual tagging.
            Folder-based session groups also appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([customer, tix]) => (
            <div key={customer}>
              <h2 className="text-[14px] font-medium text-gray-900 mb-3 capitalize">
                {customer}
              </h2>
              <div className="flex flex-col gap-2">
                {tix.map((t) => {
                  const latestEventId = t.routeId.startsWith("group:")
                    ? latestSessionGroupEventIds.get(t.id) ?? null
                    : latestTicketEventIds.get(t.id) ?? null;
                  const summaryNeedsRefresh =
                    latestEventId !== null &&
                    (t.summaryLastProcessedEventId ?? 0) < latestEventId;

                  return (
                  <TicketCard
                    key={t.routeId}
                    routeId={t.routeId}
                    id={t.id}
                    customer={t.customer}
                    title={t.title}
                    currentState={t.currentState}
                    progress={t.progress}
                    artifacts={sessionArtifactsByTicket.get(t.routeId) ?? []}
                    summaryNeedsRefresh={summaryNeedsRefresh}
                    sessionCount={t.sessionCount}
                    latestActivity={t.latestActivity}
                  />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
