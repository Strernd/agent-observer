export type MetricDefinition = {
  id: string;
  label: string;
  definition: string;
  formula: string;
  numerator: string;
  denominator?: string;
  bucketing?: string;
  caveats?: string[];
};

const DECISION_CAVEAT =
  "Depends on decision extraction having been run successfully for the included sessions.";
const ARTIFACT_CAVEAT =
  "Artifact yield depends on heuristic artifact detection rather than explicit user confirmation.";
const SOURCE_CAVEAT =
  "Historical session-level source coverage is incomplete, so unknown values may include legacy rows.";
const MODEL_CAVEAT =
  "Historical model coverage is incomplete, so unknown values may include legacy rows.";

export const metricDefinitions: Record<string, MetricDefinition> = {
  sessions: {
    id: "sessions",
    label: "Sessions",
    definition: "Count of visible sessions in the filtered range.",
    formula: "count(distinct sessions.id)",
    numerator: "Visible sessions whose session timestamp falls in the selected range.",
    bucketing: "Bucketed by the session timestamp (startedAt, falling back to endedAt) in local time.",
  },
  events: {
    id: "events",
    label: "Events",
    definition: "Count of visible events attached to visible sessions in the filtered range.",
    formula: "count(events.id)",
    numerator: "Visible normalized events whose event timestamp falls in the selected range.",
    bucketing: "Bucketed by event.timestamp in local time.",
  },
  toolStarts: {
    id: "toolStarts",
    label: "Tool Starts",
    definition: "Count of normalized tool start events.",
    formula: "count(events where normalized_event_type = tool_pre)",
    numerator: "Visible events normalized to tool_pre.",
    bucketing: "Bucketed by event.timestamp in local time.",
  },
  toolErrors: {
    id: "toolErrors",
    label: "Tool Errors",
    definition: "Count of normalized tool error events.",
    formula: "count(events where normalized_event_type = tool_error)",
    numerator: "Visible events normalized to tool_error.",
    bucketing: "Bucketed by event.timestamp in local time.",
  },
  toolErrorRate: {
    id: "toolErrorRate",
    label: "Tool Error Rate",
    definition: "Share of tool starts that ended in an error event.",
    formula: "(tool_errors / tool_starts) * 100",
    numerator: "Count of normalized tool_error events.",
    denominator: "Count of normalized tool_pre events.",
    bucketing: "Daily when shown over time, based on event.timestamp in local time.",
    caveats: [
      "This is an ingest-level operational metric, not a behavioral friction metric.",
    ],
  },
  frictionItems: {
    id: "frictionItems",
    label: "Friction Items",
    definition: "Count of extracted insights with category = friction.",
    formula: "count(decisions where category = friction)",
    numerator: "Decision rows from the current extracted session state where category = friction.",
    caveats: [DECISION_CAVEAT],
  },
  frictionPer100Events: {
    id: "frictionPer100Events",
    label: "Friction per 100 Events",
    definition: "Number of extracted friction insights normalized by total event volume.",
    formula: "(friction_items / total_events) * 100",
    numerator: "Count of decisions.category = friction.",
    denominator: "Count of normalized visible events in the selected range.",
    bucketing: "Daily when shown over time, using session-day friction counts over same-day event totals.",
    caveats: [DECISION_CAVEAT],
  },
  frictionPer100ToolStarts: {
    id: "frictionPer100ToolStarts",
    label: "Friction per 100 Tool Starts",
    definition: "Number of extracted friction insights normalized by tool execution volume.",
    formula: "(friction_items / tool_starts) * 100",
    numerator: "Count of decisions.category = friction.",
    denominator: "Count of normalized tool_pre events in the selected range.",
    bucketing: "Daily when shown over time, using session-day friction counts over same-day tool starts.",
    caveats: [DECISION_CAVEAT],
  },
  autonomousDecisionsPer100Events: {
    id: "autonomousDecisionsPer100Events",
    label: "Autonomous Decisions per 100 Events",
    definition: "Count of extracted autonomous decisions normalized by event volume.",
    formula: "(autonomous_decisions / total_events) * 100",
    numerator:
      "Count of decisions where category = autonomous_decision.",
    denominator: "Count of normalized visible events in the selected range.",
    caveats: [DECISION_CAVEAT],
  },
  avgEventsPerSession: {
    id: "avgEventsPerSession",
    label: "Avg Events per Session",
    definition: "Average number of events recorded per session.",
    formula: "avg(session_event_count)",
    numerator: "Total visible events in range.",
    denominator: "Count of visible sessions in range.",
  },
  avgSessionDuration: {
    id: "avgSessionDuration",
    label: "Avg Session Duration",
    definition: "Average runtime for sessions with both start and end timestamps.",
    formula: "avg(endedAt - startedAt)",
    numerator: "Total duration across sessions with both timestamps.",
    denominator: "Count of sessions with both startedAt and endedAt.",
    caveats: [
      "Sessions missing either timestamp are excluded from the duration average.",
    ],
  },
  summaryCoverage: {
    id: "summaryCoverage",
    label: "Summary Coverage",
    definition: "Share of sessions with a non-empty session summary.",
    formula: "(sessions_with_summary / total_sessions) * 100",
    numerator: "Visible sessions with a non-empty summary field.",
    denominator: "Count of visible sessions in range.",
  },
  taggedSessionShare: {
    id: "taggedSessionShare",
    label: "Tagged Session Share",
    definition: "Share of sessions with a non-null work item id.",
    formula: "(tagged_sessions / total_sessions) * 100",
    numerator: "Visible sessions with a stored work item id present.",
    denominator: "Count of visible sessions in range.",
  },
  decisionExtractionCoverage: {
    id: "decisionExtractionCoverage",
    label: "Decision Extraction Coverage",
    definition:
      "Share of sessions with at least one successful decision extraction run.",
    formula: "(sessions_with_successful_decision_run / total_sessions) * 100",
    numerator: "Visible sessions with a succeeded decision run.",
    denominator: "Count of visible sessions in range.",
  },
  artifactYield: {
    id: "artifactYield",
    label: "Artifact Yield",
    definition: "Share of sessions with at least one detected output artifact.",
    formula: "(sessions_with_output_artifacts / total_sessions) * 100",
    numerator: "Visible sessions with at least one parsed output artifact.",
    denominator: "Count of visible sessions in range.",
    caveats: [ARTIFACT_CAVEAT],
  },
  sessionShareByAgent: {
    id: "sessionShareByAgent",
    label: "Session Share by Agent",
    definition: "Share of sessions attributed to each source in a time bucket.",
    formula: "(sessions_for_source / total_sessions_in_bucket) * 100",
    numerator: "Visible sessions attributed to a source in the bucket.",
    denominator: "All visible sessions in the same bucket.",
    bucketing: "Bucketed by session timestamp in local time.",
    caveats: [SOURCE_CAVEAT],
  },
  eventShareByAgent: {
    id: "eventShareByAgent",
    label: "Event Share by Agent",
    definition: "Share of events attributed to each source in a time bucket.",
    formula: "(events_for_source / total_events_in_bucket) * 100",
    numerator: "Visible events attributed to a source in the bucket.",
    denominator: "All visible events in the same bucket.",
    bucketing: "Bucketed by event.timestamp in local time.",
    caveats: [SOURCE_CAVEAT],
  },
  modelShare: {
    id: "modelShare",
    label: "Model Share",
    definition: "Share of sessions attributed to each model in a time bucket.",
    formula: "(sessions_for_model / total_sessions_in_bucket) * 100",
    numerator: "Visible sessions attributed to a model in the bucket.",
    denominator: "All visible sessions in the same bucket.",
    bucketing: "Bucketed by session timestamp in local time.",
    caveats: [MODEL_CAVEAT],
  },
  toolShare: {
    id: "toolShare",
    label: "Tool Share",
    definition: "Share of normalized tool starts attributable to a tool.",
    formula: "(tool_starts_for_tool / total_tool_starts) * 100",
    numerator: "Count of normalized tool_pre events for the tool.",
    denominator: "Count of all normalized tool_pre events in range.",
  },
  toolStartsPerSession: {
    id: "toolStartsPerSession",
    label: "Tool Starts per Session",
    definition: "Average number of normalized tool starts per visible session.",
    formula: "tool_starts / total_sessions",
    numerator: "Count of normalized tool_pre events.",
    denominator: "Count of visible sessions in range.",
  },
  sessionTypeShare: {
    id: "sessionTypeShare",
    label: "Session Type Share",
    definition: "Share of sessions attributed to each session type.",
    formula: "(sessions_for_type / total_sessions) * 100",
    numerator: "Visible sessions with the given session type.",
    denominator: "Count of visible sessions in range.",
  },
  toolTrendVsPrevious: {
    id: "toolTrendVsPrevious",
    label: "Trend vs Previous Period",
    definition: "Change in tool starts compared with the immediately preceding period of equal length.",
    formula: "current_tool_starts - previous_period_tool_starts",
    numerator: "Current-period normalized tool_pre count for the tool.",
    denominator: "Previous-period normalized tool_pre count for the same tool.",
    caveats: [
      "No delta is shown when the selected range does not have a comparable previous period.",
    ],
  },
};

export function getMetricDefinition(id: string) {
  return metricDefinitions[id];
}
