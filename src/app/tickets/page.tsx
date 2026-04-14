import { db } from "@/db";
import { events, tickets, sessions } from "@/db/schema";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { TicketCard } from "@/components/ticket-card";
import type { TicketArtifactMenuItem } from "@/components/ticket-artifacts-menu";
import type { OutputArtifact } from "@/lib/ai/schemas";
import { SearchInput } from "@/components/search-input";
import { Card } from "@/components/ui/card";
import { Suspense } from "react";
import { visibleSessionsCondition } from "@/lib/session-visibility";
import { getLatestTicketEventIds } from "@/lib/session-ai-state";

export const dynamic = "force-dynamic";

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
  const ticketList = await db
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
  const latestTicketEventIds = await getLatestTicketEventIds(
    ticketList.map((ticket) => ticket.id)
  );
  const sessionArtifactsByTicket = new Map<string, TicketArtifactMenuItem[]>();

  if (ticketList.length > 0) {
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
            ticketList.map((ticket) => ticket.id)
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
        <h1 className="text-[24px] font-semibold tracking-tight">Tickets</h1>
        <span className="text-[13px] text-gray-900">
          <strong className="text-gray-1000">{ticketList.length}</strong> ticket
          {ticketList.length !== 1 ? "s" : ""}
          {q ? ` matching \u201c${q}\u201d` : ""}
        </span>
      </div>

      <div className="mb-6">
        <Suspense>
          <SearchInput placeholder="Search by ticket ID, customer, title..." />
        </Suspense>
      </div>

      {ticketList.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-[15px] text-gray-900">No tickets yet</p>
          <p className="text-[13px] text-gray-700 mt-1">
            Tickets come from configured extraction rules or can be tagged
            manually.
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
                  const latestEventId = latestTicketEventIds.get(t.id) ?? null;
                  const summaryNeedsRefresh =
                    latestEventId !== null &&
                    (t.summaryLastProcessedEventId ?? 0) < latestEventId;

                  return (
                  <TicketCard
                    key={t.id}
                    id={t.id}
                    customer={t.customer}
                    title={t.title}
                    currentState={t.currentState}
                    progress={t.progress}
                    artifacts={sessionArtifactsByTicket.get(t.id) ?? []}
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
