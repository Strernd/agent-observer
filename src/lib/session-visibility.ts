import { gt, or, sql } from "drizzle-orm";
import { sessions } from "@/db/schema";

export function visibleSessionsCondition() {
  return or(
    gt(sessions.eventCount, 1),
    sql`${sessions.startedAt} is not null`,
    sql`${sessions.endedAt} is null`
  )!;
}

export function isVisibleSessionRow(session: {
  eventCount: number;
  startedAt: Date | null;
  endedAt: Date | null;
}) {
  return (
    session.eventCount > 1 ||
    session.startedAt !== null ||
    session.endedAt === null
  );
}
