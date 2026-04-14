import { z } from "zod";

// ── Insight extraction (v1) ──────────────────────────────────────────

export const frictionAttemptSchema = z.object({
  event_id: z.number().int().positive(),
  tool: z.string().min(1),
  input: z.string().min(1),
  error: z.string().min(1),
});

const frictionSchema = z.object({
  type: z.literal("friction"),
  summary: z.string().min(1),
  why_notable: z.string().min(1),
  attempts: z.array(frictionAttemptSchema).min(1),
  resolution: z
    .object({
      event_id: z.number().int().positive(),
      input: z.string().min(1),
    })
    .nullable(),
  repeated_later: z.boolean(),
  repeat_event_ids: z.array(z.number().int().positive()),
  files_involved: z.array(z.string()),
  evidence_event_ids: z.array(z.number().int().positive()).min(1),
});

const autonomousDecisionSchema = z.object({
  type: z.literal("autonomous_decision"),
  summary: z.string().min(1),
  why_notable: z.string().min(1),
  was_corrected_by_user: z.boolean(),
  correction_event_id: z.number().int().positive().nullable(),
  user_correction_text: z.string().nullable(),
  evidence_event_ids: z.array(z.number().int().positive()).min(1),
});

export const insightSchema = z.union([frictionSchema, autonomousDecisionSchema]);

export const insightBatchSchema = z.object({
  insights: z.array(insightSchema),
});

export type InsightBatchExtraction = z.infer<typeof insightBatchSchema>;
export type Insight = z.infer<typeof insightSchema>;
export type FrictionInsight = z.infer<typeof frictionSchema>;
export type AutonomousDecisionInsight = z.infer<typeof autonomousDecisionSchema>;

// ── Session summary ──────────────────────────────────────────────────

export const summarySchema = z.object({
  summary: z
    .string()
    .describe("2-3 sentence summary of what was accomplished in this session"),
  toolsUsed: z.array(
    z.object({
      name: z.string().describe("Tool, skill, or CLI name"),
      count: z.number().describe("How many times it was used"),
    })
  ),
  frictionPoints: z.array(
    z.object({
      description: z
        .string()
        .describe("What went wrong or had to be re-done"),
      severity: z.enum(["high", "medium", "low"]),
    })
  ),
  sessionType: z.enum(["customer", "building", "question", "other"]),
});

export const outputArtifactSchema = z.object({
  path: z.string().min(1),
  sourceEventId: z.number().int().positive(),
  sourceTool: z.string().min(1),
});

export const toolStatSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const ticketSummarySchema = z.object({
  currentState: z
    .string()
    .describe("One sentence describing the ticket's current state"),
  progressSoFar: z
    .array(z.string())
    .describe("3-5 short bullet points (max ~10 words each) of confirmed progress"),
  openQuestions: z
    .array(z.string())
    .describe("Open questions, risks, or missing evidence"),
  blockersOrFriction: z
    .array(z.string())
    .describe("Ticket-level blockers, churn, or repeated friction"),
  nextBestAction: z
    .string()
    .describe("The single most useful next step"),
  confidence: z.enum(["low", "medium", "high"]),
});

const dailyReportFrictionHighlightSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  severity: z.enum(["high", "medium", "low"]),
  toolName: z.string().nullable().default(null),
  skillName: z.string().nullable().default(null),
});

const dailyReportSuggestionSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  category: z.enum(["environment", "setup", "skill"]),
  toolName: z.string().nullable().default(null),
  skillName: z.string().nullable().default(null),
});

export const dailyReportSchema = z.object({
  summary: z
    .string()
    .describe("2-4 sentence overview of what happened across the day"),
  highLevelDone: z
    .array(z.string().min(1))
    .max(6)
    .describe("3-6 short bullets covering the main work completed"),
  frictionHighlights: z
    .array(dailyReportFrictionHighlightSchema)
    .max(6)
    .describe("Most important friction points from the day"),
  topSuggestions: z
    .array(dailyReportSuggestionSchema)
    .max(3)
    .describe(
      "0-3 concrete suggestions to reduce future friction. Return an empty array if there is not enough evidence."
    ),
});

export type SessionSummary = z.infer<typeof summarySchema>;
export type ToolStat = z.infer<typeof toolStatSchema>;
export type TicketSummary = z.infer<typeof ticketSummarySchema>;
export type OutputArtifact = z.infer<typeof outputArtifactSchema>;
export type DailyReport = z.infer<typeof dailyReportSchema>;
