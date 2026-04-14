import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";

export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(), // e.g. "dse-1234"
    customer: text("customer").notNull(),
    title: text("title"),
    summaryCurrentState: text("summary_current_state"),
    summaryProgress: text("summary_progress"), // JSON array
    summaryOpenQuestions: text("summary_open_questions"), // JSON array
    summaryBlockers: text("summary_blockers"), // JSON array
    summaryNextAction: text("summary_next_action"),
    summaryConfidence: text("summary_confidence"), // high|medium|low
    toolStats: text("tool_stats"), // JSON array
    skillStats: text("skill_stats"), // JSON array
    summaryUpdatedAt: integer("summary_updated_at", { mode: "timestamp" }),
    summaryLastProcessedEventId: integer("summary_last_processed_event_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("tickets_customer_idx").on(table.customer)]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // session_id from hooks
    ticketId: text("ticket_id").references(() => tickets.id),
    cwd: text("cwd"),
    sessionName: text("session_name"),
    sessionGroup: text("session_group"),
    extractedData: text("extracted_data"), // JSON object from configured extractors
    source: text("source"),
    model: text("model"),
    startedAt: integer("started_at", { mode: "timestamp" }),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    eventCount: integer("event_count").notNull().default(0),
    summary: text("summary"),
    summaryLastProcessedEventId: integer("summary_last_processed_event_id"),
    toolsUsed: text("tools_used"), // JSON array
    frictionPoints: text("friction_points"), // JSON array
    outputArtifacts: text("output_artifacts"), // JSON array
    sessionType: text("session_type"), // customer|building|question|other
  },
  (table) => [
    index("sessions_ticket_id_idx").on(table.ticketId),
    index("sessions_started_at_idx").on(table.startedAt),
    index("sessions_session_group_idx").on(table.sessionGroup),
    index("sessions_session_type_idx").on(table.sessionType),
  ]
);

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    eventType: text("event_type").notNull(),
    source: text("source"),
    model: text("model"),
    toolName: text("tool_name"),
    toolInput: text("tool_input"), // JSON string
    toolResponse: text("tool_response"), // JSON string
    failureOperation: text("failure_operation"), // canonical operation/command summary for failed tool events
    failureType: text("failure_type"), // canonical failure class (exit_code, timeout, validation_error, etc.)
    failureExitCode: integer("failure_exit_code"), // parsed exit code when available
    failureErrorLine: text("failure_error_line"), // first actionable error line
    prompt: text("prompt"),
    response: text("response"),
    payload: text("payload").notNull(), // full JSON
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("events_session_id_idx").on(table.sessionId),
    index("events_event_type_idx").on(table.eventType),
    index("events_tool_name_idx").on(table.toolName),
    index("events_timestamp_idx").on(table.timestamp),
  ]
);

export const decisionRuns = sqliteTable(
  "decision_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    status: text("status").notNull(), // running|succeeded|failed
    triggeredBy: text("triggered_by").notNull().default("ui"), // ui
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    errorMessage: text("error_message"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    decisionCount: integer("decision_count"),
    lastProcessedEventId: integer("last_processed_event_id"),
  },
  (table) => [
    index("decision_runs_session_id_idx").on(table.sessionId),
    index("decision_runs_status_idx").on(table.status),
    index("decision_runs_started_at_idx").on(table.startedAt),
  ]
);

export const decisions = sqliteTable(
  "decisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    runId: integer("run_id")
      .notNull()
      .references(() => decisionRuns.id),
    ordinal: integer("ordinal").notNull(),
    decision: text("decision").notNull(),
    whyPivotal: text("why_pivotal").notNull(),
    category: text("category").notNull(), // architecture|tool_choice|approach|scope|assumption
    confidence: text("confidence").notNull(), // high|medium|low
    evidenceEventIds: text("evidence_event_ids").notNull(), // JSON array of event IDs
    whatFailed: text("what_failed"), // nullable structured JSON object
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("decisions_session_id_idx").on(table.sessionId),
    index("decisions_run_id_idx").on(table.runId),
    index("decisions_ordinal_idx").on(table.ordinal),
    index("decisions_category_idx").on(table.category),
  ]
);

export const dailyReports = sqliteTable(
  "daily_reports",
  {
    reportDate: text("report_date").primaryKey(), // YYYY-MM-DD in local time
    status: text("status").notNull().default("idle"), // idle|running|succeeded|failed
    autoTriggeredAt: integer("auto_triggered_at", { mode: "timestamp" }),
    summary: text("summary"),
    highLevelDone: text("high_level_done"), // JSON array
    frictionHighlights: text("friction_highlights"), // JSON array
    topSuggestions: text("top_suggestions"), // JSON array
    sessionCount: integer("session_count").notNull().default(0),
    eventCount: integer("event_count").notNull().default(0),
    processedSessionIds: text("processed_session_ids"), // JSON array
    lastProcessedEventId: integer("last_processed_event_id"),
    errorMessage: text("error_message"),
    generatedAt: integer("generated_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("daily_reports_status_idx").on(table.status),
    index("daily_reports_generated_at_idx").on(table.generatedAt),
  ]
);
