import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { decisionRuns, decisions, events, sessions, tickets } from "@/db/schema";
import { visibleSessionsCondition } from "@/lib/session-visibility";

export const REPORT_TIME_RANGES = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "14d", label: "Last 14 days", days: 14 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time", days: null },
  { value: "custom", label: "Custom range", days: null },
] as const;

export const REPORT_SOURCES = ["all", "claude", "codex", "opencode", "unknown"] as const;
export const REPORT_SESSION_TYPES = [
  "all",
  "customer",
  "building",
  "question",
  "other",
  "unknown",
] as const;
export const REPORT_TICKET_STATUS = ["all", "tagged", "untagged"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const TOOL_EVENT_TYPES = new Set(["tool_pre", "tool_post", "tool_error"]);

type TimeRangeValue = (typeof REPORT_TIME_RANGES)[number]["value"];
type SourceValue = (typeof REPORT_SOURCES)[number];
type SessionTypeValue = (typeof REPORT_SESSION_TYPES)[number];
type TicketStatusValue = (typeof REPORT_TICKET_STATUS)[number];

type SearchValue = string | string[] | undefined;
type SearchParamsInput = Record<string, SearchValue>;

type BaseSession = {
  id: string;
  ticketId: string | null;
  ticketTitle: string | null;
  customer: string | null;
  sessionName: string | null;
  sessionGroup: string | null;
  source: string;
  model: string;
  sessionType: string;
  startedAt: Date | null;
  endedAt: Date | null;
  sessionTimestamp: Date | null;
  eventCount: number;
  summary: string | null;
  hasSummary: boolean;
  hasArtifacts: boolean;
  durationMs: number | null;
};

type BaseEvent = {
  id: number;
  sessionId: string;
  normalizedEventType: string;
  source: string;
  model: string;
  toolName: string | null;
  toolInput: string | null;
  skillName: string | null;
  failureOperation: string | null;
  failureType: string | null;
  timestamp: Date;
};

type BaseDecision = {
  sessionId: string;
  category: string;
};

type BaseDecisionRun = {
  sessionId: string;
  status: string;
};

type BaseReportingRows = {
  sessions: BaseSession[];
  events: BaseEvent[];
  decisions: BaseDecision[];
  decisionRuns: BaseDecisionRun[];
};

export type ReportFilters = {
  timeRange: TimeRangeValue;
  start: Date | null;
  endExclusive: Date | null;
  startInput: string;
  endInput: string;
  source: SourceValue;
  models: string[];
  sessionTypes: SessionTypeValue[];
  ticketStatus: TicketStatusValue;
  customers: string[];
  tickets: string[];
  tools: string[];
};

type FilteredDataset = BaseReportingRows;

export type ReportMetricCard = {
  key: string;
  label: string;
  metricId: string;
  value: number;
  previousValue: number | null;
  format: "integer" | "percent" | "decimal" | "duration";
};

export type BarDatum = {
  label: string;
  value: number;
};

export type StackedShareDatum = {
  label: string;
  total: number;
  segments: { key: string; label: string; value: number }[];
};

export type ToolTableRow = {
  name: string;
  starts: number;
  errors: number;
  errorRate: number;
  share: number;
  startsPerSession: number;
  trendVsPrevious: number | null;
};

export type SkillTableRow = {
  name: string;
  uses: number;
  share: number;
  sessions: number;
  tickets: number;
};

export type SourceTableRow = {
  source: string;
  sessions: number;
  events: number;
  sessionShare: number;
  eventShare: number;
  avgEventsPerSession: number;
  avgDurationMs: number | null;
  toolStartsPerSession: number;
  frictionPer100Events: number;
};

export type FailureOperationRow = {
  operation: string;
  failures: number;
  sessions: number;
};

export type FailingToolRow = {
  tool: string;
  starts: number;
  errors: number;
  errorRate: number;
};

export type SessionDrilldownRow = {
  id: string;
  sessionName: string | null;
  source: string;
  model: string;
  sessionType: string;
  customer: string | null;
  ticketId: string | null;
  startedAt: Date | null;
  eventCount: number;
  toolStarts: number;
  toolErrors: number;
  frictionItems: number;
  autonomousDecisions: number;
  hasSummary: boolean;
  hasArtifacts: boolean;
  hasSuccessfulDecisionRun: boolean;
};

export type ReportFilterOptions = {
  models: string[];
  customers: string[];
  tickets: { id: string; customer: string | null; title: string | null }[];
  tools: string[];
};

export type ReportsPageData = {
  filters: ReportFilters;
  options: ReportFilterOptions;
  metricCards: ReportMetricCard[];
  activity: {
    sessionsSeries: BarDatum[];
    eventsSeries: BarDatum[];
    heatmap: { day: string; hour: number; count: number }[];
    heatmapDays: string[];
  };
  agents: {
    sessionShareSeries: StackedShareDatum[];
    eventShareSeries: StackedShareDatum[];
    modelShareSeries: StackedShareDatum[];
    sessionsBySource: BarDatum[];
    sourceTable: SourceTableRow[];
  };
  tools: {
    topTools: ToolTableRow[];
    errorTools: FailingToolRow[];
    toolShareSeries: StackedShareDatum[];
    skillRows: SkillTableRow[];
    toolByAgentRows: Array<Record<string, string | number>>;
  };
  friction: {
    frictionSeriesByEvents: BarDatum[];
    frictionSeriesByToolStarts: BarDatum[];
    failureTypeRows: BarDatum[];
    byToolRows: BarDatum[];
    bySourceRows: BarDatum[];
    failureOperations: FailureOperationRow[];
    highFrictionSessions: Array<{
      sessionId: string;
      sessionName: string | null;
      frictionDensity: number;
      frictionItems: number;
      eventCount: number;
    }>;
  };
  work: {
    taggedVsUntagged: { label: string; value: number }[];
    sessionTypeMixSeries: StackedShareDatum[];
    customerRows: Array<{ customer: string; sessions: number; events: number }>;
    ticketRows: Array<{
      ticketId: string;
      customer: string | null;
      title: string | null;
      sessions: number;
      events: number;
      artifacts: number;
    }>;
    summaryCoverage: number;
    decisionCoverage: number;
    artifactYield: number;
  };
  drilldownRows: SessionDrilldownRow[];
};

function parseDateInput(value: string | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function formatDateInput(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function normalizeSource(value: string | null | undefined): string {
  if (!value) return "unknown";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "unknown";
  const prefix = normalized.split(":", 1)[0];
  if (prefix === "claude" || prefix === "codex" || prefix === "opencode") {
    return prefix;
  }
  return "unknown";
}

function normalizeModel(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : "unknown";
}

function normalizeSessionType(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "customer" ||
    normalized === "building" ||
    normalized === "question" ||
    normalized === "other"
  ) {
    return normalized;
  }
  return "unknown";
}

export function normalizeReportEventType(eventType: string) {
  switch (eventType) {
    case "tool_pre":
    case "PreToolUse":
      return "tool_pre";
    case "tool_post":
    case "PostToolUse":
      return "tool_post";
    case "tool_error":
    case "PostToolUseFailure":
      return "tool_error";
    case "user_prompt":
    case "UserPromptSubmit":
      return "user_prompt";
    case "assistant_message":
    case "Stop":
      return "assistant_message";
    case "subagent_start":
    case "SubagentStart":
      return "subagent_start";
    case "subagent_stop":
    case "SubagentStop":
      return "subagent_stop";
    case "session_start":
    case "SessionStart":
      return "session_start";
    case "session_end":
    case "SessionEnd":
      return "session_end";
    default:
      return eventType;
  }
}

function parseJsonArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSkillName(raw: string | null) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed === "string") {
      const value = parsed.trim();
      return value || null;
    }

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const object = parsed as Record<string, unknown>;
    const candidates = [object.skill, object.skillName, object.name];

    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const value = candidate.trim();
      if (value) return value;
    }

    if (object.skill && typeof object.skill === "object") {
      const nested = object.skill as Record<string, unknown>;
      for (const candidate of [nested.name, nested.path]) {
        if (typeof candidate !== "string") continue;
        const value = candidate.trim();
        if (value) return value;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function formatDayKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isInRange(
  value: Date | null,
  start: Date | null,
  endExclusive: Date | null
) {
  if (!value) return !start && !endExclusive;
  if (start && value < start) return false;
  if (endExclusive && value >= endExclusive) return false;
  return true;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return (numerator / denominator) * 100;
}

function safeDivide(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function getSelectedValues(value: SearchValue) {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      item
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    );
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [];
}

export function parseReportFilters(searchParams: SearchParamsInput): ReportFilters {
  const requestedTimeRange = searchParams.range;
  const timeRange =
    typeof requestedTimeRange === "string" &&
    REPORT_TIME_RANGES.some((option) => option.value === requestedTimeRange)
      ? (requestedTimeRange as TimeRangeValue)
      : "30d";

  const sourceValue =
    typeof searchParams.source === "string" &&
    REPORT_SOURCES.includes(searchParams.source as SourceValue)
      ? (searchParams.source as SourceValue)
      : "all";

  const ticketStatusValue =
    typeof searchParams.ticketStatus === "string" &&
    REPORT_TICKET_STATUS.includes(searchParams.ticketStatus as TicketStatusValue)
      ? (searchParams.ticketStatus as TicketStatusValue)
      : "all";

  const sessionTypes = getSelectedValues(searchParams.sessionType).filter((value) =>
    REPORT_SESSION_TYPES.includes(value as SessionTypeValue)
  ) as SessionTypeValue[];

  const customStart = parseDateInput(
    typeof searchParams.from === "string" ? searchParams.from : undefined
  );
  const customEnd = parseDateInput(
    typeof searchParams.to === "string" ? searchParams.to : undefined
  );

  let start: Date | null = null;
  let endExclusive: Date | null = null;

  const today = startOfToday();

  if (timeRange === "custom" && customStart && customEnd && customStart <= customEnd) {
    start = customStart;
    endExclusive = new Date(customEnd.getTime() + DAY_MS);
  } else {
    const rangeOption = REPORT_TIME_RANGES.find((option) => option.value === timeRange);
    if (rangeOption?.days) {
      start = new Date(today.getTime() - (rangeOption.days - 1) * DAY_MS);
      endExclusive = new Date(today.getTime() + DAY_MS);
    }
  }

  return {
    timeRange,
    start,
    endExclusive,
    startInput: formatDateInput(customStart),
    endInput: formatDateInput(customEnd),
    source: sourceValue,
    models: getSelectedValues(searchParams.model),
    sessionTypes,
    ticketStatus: ticketStatusValue,
    customers: getSelectedValues(searchParams.customer),
    tickets: getSelectedValues(searchParams.ticket),
    tools: getSelectedValues(searchParams.tool),
  };
}

const loadBaseReportingRows = cache(async (): Promise<BaseReportingRows> => {
  const [sessionRows, eventRows, decisionRows, decisionRunRows] = await Promise.all([
    db
      .select({
        id: sessions.id,
        ticketId: sessions.ticketId,
        sessionName: sessions.sessionName,
        sessionGroup: sessions.sessionGroup,
        source: sessions.source,
        model: sessions.model,
        sessionType: sessions.sessionType,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        eventCount: sessions.eventCount,
        summary: sessions.summary,
        outputArtifacts: sessions.outputArtifacts,
        ticketTitle: tickets.title,
        customer: tickets.customer,
      })
      .from(sessions)
      .leftJoin(tickets, eq(tickets.id, sessions.ticketId))
      .where(visibleSessionsCondition()),
    db
      .select({
        id: events.id,
        sessionId: events.sessionId,
        eventType: events.eventType,
        source: events.source,
        model: events.model,
        toolName: events.toolName,
        toolInput: events.toolInput,
        failureOperation: events.failureOperation,
        failureType: events.failureType,
        timestamp: events.timestamp,
      })
      .from(events)
      .innerJoin(sessions, eq(sessions.id, events.sessionId))
      .where(visibleSessionsCondition()),
    db
      .select({
        sessionId: decisions.sessionId,
        category: decisions.category,
      })
      .from(decisions)
      .innerJoin(sessions, eq(sessions.id, decisions.sessionId))
      .where(visibleSessionsCondition()),
    db
      .select({
        sessionId: decisionRuns.sessionId,
        status: decisionRuns.status,
      })
      .from(decisionRuns)
      .innerJoin(sessions, eq(sessions.id, decisionRuns.sessionId))
      .where(visibleSessionsCondition()),
  ]);

  return {
    sessions: sessionRows.map((row) => {
      const sessionTimestamp = row.startedAt ?? row.endedAt;
      return {
        id: row.id,
        ticketId: row.ticketId,
        ticketTitle: row.ticketTitle,
        customer: row.customer,
        sessionName: row.sessionName,
        sessionGroup: row.sessionGroup,
        source: normalizeSource(row.source),
        model: normalizeModel(row.model),
        sessionType: normalizeSessionType(row.sessionType),
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        sessionTimestamp,
        eventCount: row.eventCount,
        summary: row.summary,
        hasSummary: Boolean(row.summary?.trim()),
        hasArtifacts: parseJsonArray(row.outputArtifacts).length > 0,
        durationMs:
          row.startedAt && row.endedAt
            ? row.endedAt.getTime() - row.startedAt.getTime()
            : null,
      };
    }),
    events: eventRows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      normalizedEventType: normalizeReportEventType(row.eventType),
      source: normalizeSource(row.source),
      model: normalizeModel(row.model),
      toolName: row.toolName?.trim() ? row.toolName.trim() : null,
      toolInput: row.toolInput,
      skillName:
        row.toolName?.trim() === "Skill" ? parseSkillName(row.toolInput) : null,
      failureOperation: row.failureOperation,
      failureType: row.failureType,
      timestamp: row.timestamp,
    })),
    decisions: decisionRows.map((row) => ({
      sessionId: row.sessionId,
      category: row.category,
    })),
    decisionRuns: decisionRunRows.map((row) => ({
      sessionId: row.sessionId,
      status: row.status,
    })),
  };
});

function applyFilters(base: BaseReportingRows, filters: ReportFilters): FilteredDataset {
  let filteredSessions = base.sessions.filter((session) => {
    if (!isInRange(session.sessionTimestamp, filters.start, filters.endExclusive)) {
      return false;
    }

    if (filters.source !== "all" && session.source !== filters.source) {
      return false;
    }

    if (filters.models.length > 0 && !filters.models.includes(session.model)) {
      return false;
    }

    if (
      filters.sessionTypes.length > 0 &&
      !filters.sessionTypes.includes(session.sessionType as SessionTypeValue)
    ) {
      return false;
    }

    if (filters.ticketStatus === "tagged" && !session.ticketId) {
      return false;
    }

    if (filters.ticketStatus === "untagged" && session.ticketId) {
      return false;
    }

    if (
      filters.customers.length > 0 &&
      !filters.customers.includes(session.customer ?? "")
    ) {
      return false;
    }

    if (filters.tickets.length > 0 && !filters.tickets.includes(session.ticketId ?? "")) {
      return false;
    }

    return true;
  });

  let sessionIds = new Set(filteredSessions.map((session) => session.id));

  let filteredEvents = base.events.filter(
    (event) =>
      sessionIds.has(event.sessionId) &&
      isInRange(event.timestamp, filters.start, filters.endExclusive)
  );

  if (filters.tools.length > 0) {
    const matchingSessionIds = new Set(
      filteredEvents
        .filter((event) => event.toolName && filters.tools.includes(event.toolName))
        .map((event) => event.sessionId)
    );
    filteredSessions = filteredSessions.filter((session) =>
      matchingSessionIds.has(session.id)
    );
    sessionIds = new Set(filteredSessions.map((session) => session.id));
    filteredEvents = filteredEvents.filter((event) => sessionIds.has(event.sessionId));
  }

  return {
    sessions: filteredSessions,
    events: filteredEvents,
    decisions: base.decisions.filter((decision) => sessionIds.has(decision.sessionId)),
    decisionRuns: base.decisionRuns.filter((run) => sessionIds.has(run.sessionId)),
  };
}

function getPreviousFilters(filters: ReportFilters): ReportFilters | null {
  if (!filters.start || !filters.endExclusive) {
    return null;
  }

  const length = filters.endExclusive.getTime() - filters.start.getTime();
  if (length <= 0) {
    return null;
  }

  return {
    ...filters,
    start: new Date(filters.start.getTime() - length),
    endExclusive: new Date(filters.start.getTime()),
  };
}

function buildMetrics(dataset: FilteredDataset): {
  sessions: number;
  events: number;
  toolStarts: number;
  toolErrors: number;
  frictionItems: number;
  autonomousDecisions: number;
  avgDurationMs: number;
  avgEventsPerSession: number;
  summaryCoverage: number;
  taggedSessionShare: number;
  frictionPer100Events: number;
  frictionPer100ToolStarts: number;
  autonomousDecisionsPer100Events: number;
  toolErrorRate: number;
  decisionCoverage: number;
  artifactYield: number;
} {
  const sessionsCount = dataset.sessions.length;
  const eventsCount = dataset.events.length;
  const toolStarts = dataset.events.filter(
    (event) => event.normalizedEventType === "tool_pre"
  ).length;
  const toolErrors = dataset.events.filter(
    (event) => event.normalizedEventType === "tool_error"
  ).length;
  const frictionItems = dataset.decisions.filter(
    (decision) => decision.category === "friction"
  ).length;
  const autonomousDecisions = dataset.decisions.filter(
    (decision) => decision.category === "autonomous_decision"
  ).length;
  const durations = dataset.sessions
    .map((session) => session.durationMs)
    .filter((value): value is number => value !== null);
  const successfulRunCount = new Set(
    dataset.decisionRuns
      .filter((run) => run.status === "succeeded")
      .map((run) => run.sessionId)
  ).size;
  const artifactSessions = dataset.sessions.filter((session) => session.hasArtifacts).length;
  const summarySessions = dataset.sessions.filter((session) => session.hasSummary).length;
  const taggedSessions = dataset.sessions.filter((session) => session.ticketId).length;

  return {
    sessions: sessionsCount,
    events: eventsCount,
    toolStarts,
    toolErrors,
    frictionItems,
    autonomousDecisions,
    avgDurationMs:
      durations.length > 0
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : 0,
    avgEventsPerSession: safeDivide(eventsCount, sessionsCount),
    summaryCoverage: percent(summarySessions, sessionsCount),
    taggedSessionShare: percent(taggedSessions, sessionsCount),
    frictionPer100Events: percent(frictionItems, eventsCount),
    frictionPer100ToolStarts: percent(frictionItems, toolStarts),
    autonomousDecisionsPer100Events: percent(autonomousDecisions, eventsCount),
    toolErrorRate: percent(toolErrors, toolStarts),
    decisionCoverage: percent(successfulRunCount, sessionsCount),
    artifactYield: percent(artifactSessions, sessionsCount),
  };
}

function buildMetricCard(
  key: string,
  label: string,
  metricId: string,
  value: number,
  previousValue: number | null,
  format: ReportMetricCard["format"]
): ReportMetricCard {
  return { key, label, metricId, value, previousValue, format };
}

function buildDateDomain(
  dataset: FilteredDataset,
  filters: ReportFilters,
  type: "session" | "event"
) {
  const values =
    type === "session"
      ? dataset.sessions
          .map((session) => session.sessionTimestamp)
          .filter((value): value is Date => value !== null)
      : dataset.events.map((event) => event.timestamp);

  if (filters.start && filters.endExclusive) {
    const labels: string[] = [];
    for (
      let cursor = new Date(filters.start);
      cursor < filters.endExclusive;
      cursor = new Date(cursor.getTime() + DAY_MS)
    ) {
      labels.push(formatDayKey(cursor));
    }
    return labels;
  }

  if (values.length === 0) return [];

  const min = new Date(Math.min(...values.map((value) => value.getTime())));
  const max = new Date(Math.max(...values.map((value) => value.getTime())));
  const start = new Date(min.getFullYear(), min.getMonth(), min.getDate());
  const end = new Date(max.getFullYear(), max.getMonth(), max.getDate() + 1);
  const labels: string[] = [];

  for (let cursor = start; cursor < end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    labels.push(formatDayKey(cursor));
  }

  return labels;
}

function buildSeriesMap(labels: string[], counts: Map<string, number>) {
  return labels.map((label) => ({ label, value: counts.get(label) ?? 0 }));
}

function buildActivitySeries(dataset: FilteredDataset, filters: ReportFilters) {
  const sessionLabels = buildDateDomain(dataset, filters, "session");
  const eventLabels = buildDateDomain(dataset, filters, "event");
  const sessionCounts = new Map<string, number>();
  const eventCounts = new Map<string, number>();

  for (const session of dataset.sessions) {
    if (!session.sessionTimestamp) continue;
    const key = formatDayKey(session.sessionTimestamp);
    sessionCounts.set(key, (sessionCounts.get(key) ?? 0) + 1);
  }

  for (const event of dataset.events) {
    const key = formatDayKey(event.timestamp);
    eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1);
  }

  return {
    sessionsSeries: buildSeriesMap(sessionLabels, sessionCounts),
    eventsSeries: buildSeriesMap(eventLabels, eventCounts),
  };
}

function buildHeatmap(dataset: FilteredDataset, filters: ReportFilters) {
  const end =
    filters.endExclusive ?? new Date(startOfToday().getTime() + DAY_MS);
  const daysToShow = 14;
  const start = new Date(end.getTime() - daysToShow * DAY_MS);
  const heatmapEvents = dataset.events.filter((event) => event.timestamp >= start && event.timestamp < end);

  const days: string[] = [];
  for (
    let cursor = new Date(end.getTime() - DAY_MS);
    cursor >= start;
    cursor = new Date(cursor.getTime() - DAY_MS)
  ) {
    days.push(formatDayKey(cursor));
  }

  return {
    heatmap: heatmapEvents.reduce<Array<{ day: string; hour: number; count: number }>>(
      (rows, event) => {
        const day = formatDayKey(event.timestamp);
        const hour = event.timestamp.getHours();
        const existing = rows.find((row) => row.day === day && row.hour === hour);
        if (existing) {
          existing.count += 1;
        } else {
          rows.push({ day, hour, count: 1 });
        }
        return rows;
      },
      []
    ),
    heatmapDays: days,
  };
}

function buildStackedSeries<T extends string>(
  labels: string[],
  categories: T[],
  valuesByLabel: Map<string, Map<T, number>>
): StackedShareDatum[] {
  return labels.map((label) => {
    const categoryValues = valuesByLabel.get(label) ?? new Map<T, number>();
    const segments = categories.map((category) => ({
      key: category,
      label: category,
      value: categoryValues.get(category) ?? 0,
    }));
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    return { label, total, segments };
  });
}

function buildAgentSection(dataset: FilteredDataset, filters: ReportFilters) {
  const sessionLabels = buildDateDomain(dataset, filters, "session");
  const eventLabels = buildDateDomain(dataset, filters, "event");
  const sources = ["claude", "codex", "opencode", "unknown"] as const;
  const sessionMap = new Map<string, Map<(typeof sources)[number], number>>();
  const eventMap = new Map<string, Map<(typeof sources)[number], number>>();
  const modelMap = new Map<string, Map<string, number>>();
  const sessionsBySource = new Map<string, number>();
  const eventsBySource = new Map<string, number>();
  const toolStartsBySource = new Map<string, number>();
  const frictionBySource = new Map<string, number>();
  const durationsBySource = new Map<string, number[]>();
  const frictionCountsBySession = new Map<string, number>();

  for (const decision of dataset.decisions) {
    if (decision.category !== "friction") continue;
    frictionCountsBySession.set(
      decision.sessionId,
      (frictionCountsBySession.get(decision.sessionId) ?? 0) + 1
    );
  }

  for (const session of dataset.sessions) {
    if (!session.sessionTimestamp) continue;
    const key = formatDayKey(session.sessionTimestamp);
    const sourceBucket = sessionMap.get(key) ?? new Map();
    sourceBucket.set(session.source as (typeof sources)[number], (sourceBucket.get(session.source as (typeof sources)[number]) ?? 0) + 1);
    sessionMap.set(key, sourceBucket);

    const modelBucket = modelMap.get(key) ?? new Map<string, number>();
    modelBucket.set(session.model, (modelBucket.get(session.model) ?? 0) + 1);
    modelMap.set(key, modelBucket);

    sessionsBySource.set(session.source, (sessionsBySource.get(session.source) ?? 0) + 1);

    if (session.durationMs !== null) {
      const durations = durationsBySource.get(session.source) ?? [];
      durations.push(session.durationMs);
      durationsBySource.set(session.source, durations);
    }

    frictionBySource.set(
      session.source,
      (frictionBySource.get(session.source) ?? 0) +
        (frictionCountsBySession.get(session.id) ?? 0)
    );
  }

  for (const event of dataset.events) {
    const key = formatDayKey(event.timestamp);
    const sourceBucket = eventMap.get(key) ?? new Map();
    sourceBucket.set(event.source as (typeof sources)[number], (sourceBucket.get(event.source as (typeof sources)[number]) ?? 0) + 1);
    eventMap.set(key, sourceBucket);

    eventsBySource.set(event.source, (eventsBySource.get(event.source) ?? 0) + 1);

    if (event.normalizedEventType === "tool_pre") {
      toolStartsBySource.set(
        event.source,
        (toolStartsBySource.get(event.source) ?? 0) + 1
      );
    }
  }

  const topModels = Array.from(
    dataset.sessions.reduce((map, session) => {
      map.set(session.model, (map.get(session.model) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([model]) => model);

  const totalSessions = dataset.sessions.length;
  const totalEvents = dataset.events.length;

  const sourceTable = sources
    .map((source) => {
      const sourceSessions = sessionsBySource.get(source) ?? 0;
      const sourceEvents = eventsBySource.get(source) ?? 0;
      const durations = durationsBySource.get(source) ?? [];
      return {
        source,
        sessions: sourceSessions,
        events: sourceEvents,
        sessionShare: percent(sourceSessions, totalSessions),
        eventShare: percent(sourceEvents, totalEvents),
        avgEventsPerSession: safeDivide(sourceEvents, sourceSessions),
        avgDurationMs:
          durations.length > 0
            ? durations.reduce((sum, value) => sum + value, 0) / durations.length
            : null,
        toolStartsPerSession: safeDivide(toolStartsBySource.get(source) ?? 0, sourceSessions),
        frictionPer100Events: percent(frictionBySource.get(source) ?? 0, sourceEvents),
      };
    })
    .filter((row) => row.sessions > 0 || row.events > 0);

  return {
    sessionShareSeries: buildStackedSeries(sessionLabels, [...sources], sessionMap),
    eventShareSeries: buildStackedSeries(eventLabels, [...sources], eventMap),
    modelShareSeries: buildStackedSeries(sessionLabels, topModels, modelMap),
    sessionsBySource: sourceTable.map((row) => ({
      label: row.source,
      value: row.sessions,
    })),
    sourceTable,
  };
}

function buildToolSection(
  dataset: FilteredDataset,
  previousDataset: FilteredDataset | null,
  filters: ReportFilters
) {
  const toolStarts = dataset.events.filter((event) => event.normalizedEventType === "tool_pre");
  const toolErrors = dataset.events.filter((event) => event.normalizedEventType === "tool_error");
  const totalSessions = dataset.sessions.length;
  const topToolMap = new Map<string, { starts: number; errors: number; sessions: Set<string> }>();
  const skillMap = new Map<string, { uses: number; sessions: Set<string>; tickets: Set<string> }>();
  const toolShareLabels = buildDateDomain(dataset, filters, "event");
  const previousStarts = new Map<string, number>();
  const topToolByAgent = new Map<string, Map<string, number>>();

  if (previousDataset) {
    for (const event of previousDataset.events) {
      if (event.normalizedEventType !== "tool_pre" || !event.toolName) continue;
      previousStarts.set(event.toolName, (previousStarts.get(event.toolName) ?? 0) + 1);
    }
  }

  for (const event of toolStarts) {
    if (!event.toolName) continue;
    const current = topToolMap.get(event.toolName) ?? {
      starts: 0,
      errors: 0,
      sessions: new Set<string>(),
    };
    current.starts += 1;
    current.sessions.add(event.sessionId);
    topToolMap.set(event.toolName, current);

    const byAgent = topToolByAgent.get(event.toolName) ?? new Map<string, number>();
    byAgent.set(event.source, (byAgent.get(event.source) ?? 0) + 1);
    topToolByAgent.set(event.toolName, byAgent);

    if (event.skillName) {
      const session = dataset.sessions.find((row) => row.id === event.sessionId) ?? null;
      const currentSkill = skillMap.get(event.skillName) ?? {
        uses: 0,
        sessions: new Set<string>(),
        tickets: new Set<string>(),
      };
      currentSkill.uses += 1;
      currentSkill.sessions.add(event.sessionId);
      if (session?.ticketId) {
        currentSkill.tickets.add(session.ticketId);
      }
      skillMap.set(event.skillName, currentSkill);
    }
  }

  for (const event of toolErrors) {
    if (!event.toolName) continue;
    const current = topToolMap.get(event.toolName) ?? {
      starts: 0,
      errors: 0,
      sessions: new Set<string>(),
    };
    current.errors += 1;
    topToolMap.set(event.toolName, current);
  }

  const topTools = Array.from(topToolMap.entries())
    .map(([name, stats]) => ({
      name,
      starts: stats.starts,
      errors: stats.errors,
      errorRate: percent(stats.errors, stats.starts),
      share: percent(stats.starts, toolStarts.length),
      startsPerSession: safeDivide(stats.starts, totalSessions),
      trendVsPrevious:
        previousDataset !== null ? stats.starts - (previousStarts.get(name) ?? 0) : null,
    }))
    .sort((a, b) => b.starts - a.starts)
    .slice(0, 12);

  const shareTools = topTools.slice(0, 5).map((tool) => tool.name);
  const toolShareMap = new Map<string, Map<string, number>>();

  for (const event of toolStarts) {
    if (!event.toolName || !shareTools.includes(event.toolName)) continue;
    const key = formatDayKey(event.timestamp);
    const bucket = toolShareMap.get(key) ?? new Map<string, number>();
    bucket.set(event.toolName, (bucket.get(event.toolName) ?? 0) + 1);
    toolShareMap.set(key, bucket);
  }

  const skillRows = Array.from(skillMap.entries())
    .map(([name, stats]) => ({
      name,
      uses: stats.uses,
      share: percent(stats.uses, toolStarts.filter((event) => event.skillName).length),
      sessions: stats.sessions.size,
      tickets: stats.tickets.size,
    }))
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 8);

  const errorTools = topTools
    .filter((tool) => tool.errors > 0)
    .map((tool) => ({
      tool: tool.name,
      starts: tool.starts,
      errors: tool.errors,
      errorRate: tool.errorRate,
    }))
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 10);

  const toolByAgentRows = topTools.slice(0, 8).map((tool) => {
    const counts = topToolByAgent.get(tool.name) ?? new Map<string, number>();
    return {
      tool: tool.name,
      claude: counts.get("claude") ?? 0,
      codex: counts.get("codex") ?? 0,
      opencode: counts.get("opencode") ?? 0,
      unknown: counts.get("unknown") ?? 0,
      total: tool.starts,
    };
  });

  return {
    topTools,
    errorTools,
    toolShareSeries: buildStackedSeries(toolShareLabels, shareTools, toolShareMap),
    skillRows,
    toolByAgentRows,
  };
}

function buildFrictionSection(dataset: FilteredDataset, filters: ReportFilters) {
  const sessionLookup = new Map(dataset.sessions.map((session) => [session.id, session]));
  const eventLabels = buildDateDomain(dataset, filters, "event");
  const frictionByDay = new Map<string, number>();
  const toolStartsByDay = new Map<string, number>();
  const eventsByDay = new Map<string, number>();
  const eventsBySession = new Map<string, number>();
  const failureTypeMap = new Map<string, number>();
  const frictionByTool = new Map<string, number>();
  const frictionBySource = new Map<string, number>();
  const operationMap = new Map<string, { failures: number; sessions: Set<string> }>();
  const sessionFrictionCounts = new Map<string, number>();
  const toolBySession = new Map<string, Set<string>>();

  for (const event of dataset.events) {
    const day = formatDayKey(event.timestamp);
    eventsByDay.set(day, (eventsByDay.get(day) ?? 0) + 1);
    eventsBySession.set(event.sessionId, (eventsBySession.get(event.sessionId) ?? 0) + 1);

    if (event.normalizedEventType === "tool_pre") {
      toolStartsByDay.set(day, (toolStartsByDay.get(day) ?? 0) + 1);
      if (event.toolName) {
        const tools = toolBySession.get(event.sessionId) ?? new Set<string>();
        tools.add(event.toolName);
        toolBySession.set(event.sessionId, tools);
      }
    }

    if (event.normalizedEventType === "tool_error") {
      const failureType = event.failureType ?? "unknown";
      failureTypeMap.set(failureType, (failureTypeMap.get(failureType) ?? 0) + 1);

      const operation = event.failureOperation;
      if (!operation) continue;
      const current = operationMap.get(operation) ?? {
        failures: 0,
        sessions: new Set<string>(),
      };
      current.failures += 1;
      current.sessions.add(event.sessionId);
      operationMap.set(operation, current);
    }
  }

  for (const decision of dataset.decisions) {
    if (decision.category !== "friction") continue;
    const session = sessionLookup.get(decision.sessionId);
    if (!session?.sessionTimestamp) continue;
    const day = formatDayKey(session.sessionTimestamp);

    frictionByDay.set(day, (frictionByDay.get(day) ?? 0) + 1);
    frictionBySource.set(session.source, (frictionBySource.get(session.source) ?? 0) + 1);
    sessionFrictionCounts.set(
      decision.sessionId,
      (sessionFrictionCounts.get(decision.sessionId) ?? 0) + 1
    );

    for (const tool of toolBySession.get(decision.sessionId) ?? []) {
      frictionByTool.set(tool, (frictionByTool.get(tool) ?? 0) + 1);
    }
  }

  const frictionSeriesByEvents = eventLabels.map((label) => ({
    label,
    value: round(percent(frictionByDay.get(label) ?? 0, eventsByDay.get(label) ?? 0)),
  }));

  const frictionSeriesByToolStarts = eventLabels.map((label) => ({
    label,
    value: round(
      percent(frictionByDay.get(label) ?? 0, toolStartsByDay.get(label) ?? 0)
    ),
  }));

  return {
    frictionSeriesByEvents,
    frictionSeriesByToolStarts,
    failureTypeRows: Array.from(failureTypeMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    byToolRows: Array.from(frictionByTool.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    bySourceRows: Array.from(frictionBySource.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    failureOperations: Array.from(operationMap.entries())
      .map(([operation, stats]) => ({
        operation,
        failures: stats.failures,
        sessions: stats.sessions.size,
      }))
      .sort((a, b) => b.failures - a.failures)
      .slice(0, 10),
    highFrictionSessions: dataset.sessions
      .map((session) => {
        const frictionItems = sessionFrictionCounts.get(session.id) ?? 0;
        return {
          sessionId: session.id,
          sessionName: session.sessionName,
          frictionItems,
          eventCount: eventsBySession.get(session.id) ?? 0,
          frictionDensity: percent(frictionItems, eventsBySession.get(session.id) ?? 0),
        };
      })
      .filter((row) => row.frictionItems > 0)
      .sort((a, b) => b.frictionDensity - a.frictionDensity)
      .slice(0, 8),
  };
}

function buildWorkSection(dataset: FilteredDataset, filters: ReportFilters) {
  const sessionLabels = buildDateDomain(dataset, filters, "session");
  const typeMap = new Map<string, Map<string, number>>();
  const customerMap = new Map<string, { sessions: number; events: number }>();
  const ticketMap = new Map<
    string,
    { customer: string | null; title: string | null; sessions: number; events: number; artifacts: number }
  >();
  const sessionLookup = new Map(dataset.sessions.map((session) => [session.id, session]));
  const successfulRunIds = new Set(
    dataset.decisionRuns
      .filter((run) => run.status === "succeeded")
      .map((run) => run.sessionId)
  );

  for (const session of dataset.sessions) {
    if (session.sessionTimestamp) {
      const day = formatDayKey(session.sessionTimestamp);
      const bucket = typeMap.get(day) ?? new Map<string, number>();
      bucket.set(session.sessionType, (bucket.get(session.sessionType) ?? 0) + 1);
      typeMap.set(day, bucket);
    }

    if (session.customer) {
      const customer = customerMap.get(session.customer) ?? { sessions: 0, events: 0 };
      customer.sessions += 1;
      customerMap.set(session.customer, customer);
    }

    if (session.ticketId) {
      const ticket = ticketMap.get(session.ticketId) ?? {
        customer: session.customer,
        title: session.ticketTitle,
        sessions: 0,
        events: 0,
        artifacts: 0,
      };
      ticket.sessions += 1;
      ticket.artifacts += session.hasArtifacts ? 1 : 0;
      ticketMap.set(session.ticketId, ticket);
    }
  }

  for (const event of dataset.events) {
    const session = sessionLookup.get(event.sessionId);
    if (!session) continue;
    if (session.customer) {
      const customer = customerMap.get(session.customer) ?? { sessions: 0, events: 0 };
      customer.events += 1;
      customerMap.set(session.customer, customer);
    }

    if (session.ticketId) {
      const ticket = ticketMap.get(session.ticketId) ?? {
        customer: session.customer,
        title: session.ticketTitle,
        sessions: 0,
        events: 0,
        artifacts: 0,
      };
      ticket.events += 1;
      ticketMap.set(session.ticketId, ticket);
    }
  }

  return {
    taggedVsUntagged: [
      {
        label: "Tagged",
        value: dataset.sessions.filter((session) => session.ticketId).length,
      },
      {
        label: "Untagged",
        value: dataset.sessions.filter((session) => !session.ticketId).length,
      },
    ],
    sessionTypeMixSeries: buildStackedSeries(
      sessionLabels,
      ["customer", "building", "question", "other", "unknown"],
      typeMap
    ),
    customerRows: Array.from(customerMap.entries())
      .map(([customer, stats]) => ({
        customer,
        sessions: stats.sessions,
        events: stats.events,
      }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 10),
    ticketRows: Array.from(ticketMap.entries())
      .map(([ticketId, stats]) => ({
        ticketId,
        customer: stats.customer,
        title: stats.title,
        sessions: stats.sessions,
        events: stats.events,
        artifacts: stats.artifacts,
      }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 10),
    summaryCoverage: percent(
      dataset.sessions.filter((session) => session.hasSummary).length,
      dataset.sessions.length
    ),
    decisionCoverage: percent(successfulRunIds.size, dataset.sessions.length),
    artifactYield: percent(
      dataset.sessions.filter((session) => session.hasArtifacts).length,
      dataset.sessions.length
    ),
  };
}

function buildDrilldown(dataset: FilteredDataset) {
  const eventCountsBySession = new Map<string, number>();
  const toolStartsBySession = new Map<string, number>();
  const toolErrorsBySession = new Map<string, number>();
  const frictionBySession = new Map<string, number>();
  const autonomousBySession = new Map<string, number>();
  const successfulRunIds = new Set(
    dataset.decisionRuns
      .filter((run) => run.status === "succeeded")
      .map((run) => run.sessionId)
  );

  for (const event of dataset.events) {
    eventCountsBySession.set(
      event.sessionId,
      (eventCountsBySession.get(event.sessionId) ?? 0) + 1
    );
    if (event.normalizedEventType === "tool_pre") {
      toolStartsBySession.set(
        event.sessionId,
        (toolStartsBySession.get(event.sessionId) ?? 0) + 1
      );
    }
    if (event.normalizedEventType === "tool_error") {
      toolErrorsBySession.set(
        event.sessionId,
        (toolErrorsBySession.get(event.sessionId) ?? 0) + 1
      );
    }
  }

  for (const decision of dataset.decisions) {
    if (decision.category === "friction") {
      frictionBySession.set(
        decision.sessionId,
        (frictionBySession.get(decision.sessionId) ?? 0) + 1
      );
    }
    if (decision.category === "autonomous_decision") {
      autonomousBySession.set(
        decision.sessionId,
        (autonomousBySession.get(decision.sessionId) ?? 0) + 1
      );
    }
  }

  return dataset.sessions
    .map((session) => ({
      id: session.id,
      sessionName: session.sessionName,
      source: session.source,
      model: session.model,
      sessionType: session.sessionType,
      customer: session.customer,
      ticketId: session.ticketId,
      startedAt: session.startedAt,
      eventCount: eventCountsBySession.get(session.id) ?? 0,
      toolStarts: toolStartsBySession.get(session.id) ?? 0,
      toolErrors: toolErrorsBySession.get(session.id) ?? 0,
      frictionItems: frictionBySession.get(session.id) ?? 0,
      autonomousDecisions: autonomousBySession.get(session.id) ?? 0,
      hasSummary: session.hasSummary,
      hasArtifacts: session.hasArtifacts,
      hasSuccessfulDecisionRun: successfulRunIds.has(session.id),
    }))
    .sort(
      (a, b) =>
        (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0)
    )
    .slice(0, 50);
}

export async function getReportFilterOptions(): Promise<ReportFilterOptions> {
  const base = await loadBaseReportingRows();

  return {
    models: Array.from(new Set(base.sessions.map((session) => session.model))).sort(),
    customers: Array.from(
      new Set(
        base.sessions
          .map((session) => session.customer)
          .filter((value): value is string => Boolean(value))
      )
    ).sort(),
    tickets: Array.from(
      new Map(
        base.sessions
          .filter((session) => session.ticketId)
          .map((session) => [
            session.ticketId!,
            {
              id: session.ticketId!,
              customer: session.customer,
              title: session.ticketTitle,
            },
          ])
      ).values()
    ).sort((a, b) => a.id.localeCompare(b.id)),
    tools: Array.from(
      new Set(
        base.events
          .filter(
            (event) =>
              TOOL_EVENT_TYPES.has(event.normalizedEventType) && Boolean(event.toolName)
          )
          .map((event) => event.toolName!)
      )
    ).sort(),
  };
}

export async function getReportsPageData(filters: ReportFilters): Promise<ReportsPageData> {
  const [base, options] = await Promise.all([
    loadBaseReportingRows(),
    getReportFilterOptions(),
  ]);
  const currentDataset = applyFilters(base, filters);
  const previousFilters = getPreviousFilters(filters);
  const previousDataset = previousFilters ? applyFilters(base, previousFilters) : null;

  const currentMetrics = buildMetrics(currentDataset);
  const previousMetrics = previousDataset ? buildMetrics(previousDataset) : null;

  return {
    filters,
    options,
    metricCards: [
      buildMetricCard(
        "sessions",
        "Sessions",
        "sessions",
        currentMetrics.sessions,
        previousMetrics?.sessions ?? null,
        "integer"
      ),
      buildMetricCard(
        "events",
        "Events",
        "events",
        currentMetrics.events,
        previousMetrics?.events ?? null,
        "integer"
      ),
      buildMetricCard(
        "toolStarts",
        "Tool starts",
        "toolStarts",
        currentMetrics.toolStarts,
        previousMetrics?.toolStarts ?? null,
        "integer"
      ),
      buildMetricCard(
        "toolErrors",
        "Tool errors",
        "toolErrors",
        currentMetrics.toolErrors,
        previousMetrics?.toolErrors ?? null,
        "integer"
      ),
      buildMetricCard(
        "frictionItems",
        "Friction items",
        "frictionItems",
        currentMetrics.frictionItems,
        previousMetrics?.frictionItems ?? null,
        "integer"
      ),
      buildMetricCard(
        "frictionPer100Events",
        "Friction / 100 events",
        "frictionPer100Events",
        round(currentMetrics.frictionPer100Events),
        previousMetrics ? round(previousMetrics.frictionPer100Events) : null,
        "decimal"
      ),
      buildMetricCard(
        "frictionPer100ToolStarts",
        "Friction / 100 tool starts",
        "frictionPer100ToolStarts",
        round(currentMetrics.frictionPer100ToolStarts),
        previousMetrics ? round(previousMetrics.frictionPer100ToolStarts) : null,
        "decimal"
      ),
      buildMetricCard(
        "autonomousDecisionsPer100Events",
        "Autonomous decisions / 100 events",
        "autonomousDecisionsPer100Events",
        round(currentMetrics.autonomousDecisionsPer100Events),
        previousMetrics
          ? round(previousMetrics.autonomousDecisionsPer100Events)
          : null,
        "decimal"
      ),
      buildMetricCard(
        "avgSessionDuration",
        "Avg session duration",
        "avgSessionDuration",
        currentMetrics.avgDurationMs,
        previousMetrics?.avgDurationMs ?? null,
        "duration"
      ),
      buildMetricCard(
        "avgEventsPerSession",
        "Avg events / session",
        "avgEventsPerSession",
        round(currentMetrics.avgEventsPerSession),
        previousMetrics ? round(previousMetrics.avgEventsPerSession) : null,
        "decimal"
      ),
      buildMetricCard(
        "summaryCoverage",
        "Summary coverage",
        "summaryCoverage",
        round(currentMetrics.summaryCoverage),
        previousMetrics ? round(previousMetrics.summaryCoverage) : null,
        "percent"
      ),
      buildMetricCard(
        "taggedSessionShare",
        "Tagged session share",
        "taggedSessionShare",
        round(currentMetrics.taggedSessionShare),
        previousMetrics ? round(previousMetrics.taggedSessionShare) : null,
        "percent"
      ),
    ],
    activity: {
      ...buildActivitySeries(currentDataset, filters),
      ...buildHeatmap(currentDataset, filters),
    },
    agents: buildAgentSection(currentDataset, filters),
    tools: buildToolSection(currentDataset, previousDataset, filters),
    friction: buildFrictionSection(currentDataset, filters),
    work: buildWorkSection(currentDataset, filters),
    drilldownRows: buildDrilldown(currentDataset),
  };
}
