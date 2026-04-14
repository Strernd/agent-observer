import { generateText, Output } from "ai";
import { db } from "@/db";
import { events, sessions } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { summarySchema } from "./schemas";
import { isVisibleSessionRow } from "@/lib/session-visibility";
import { extractOutputArtifacts } from "./extract-output-artifacts";
import { getModelConfig } from "@/lib/observer-config";

const SYSTEM_PROMPT = `You summarize coding agent sessions to help the user understand what happened.

Focus on:
1. What was accomplished (2-3 sentences)
2. Which tools, skills, CLIs, and MCP tools were used (with counts)
3. Friction points: things that went wrong, had to be re-done, or where the agent made mistakes
4. Concrete outputs produced during the session when they are clearly identifiable

For friction points, look for:
- The user correcting the agent ("no", "not that", "I said...", "stop")
- The agent retrying failed operations
- Errors that required backtracking
- Misunderstandings of requirements
- The user having to repeat or clarify instructions

Classify the session type:
- "customer" if it involves investigating/fixing a customer issue
- "building" if it involves creating or modifying code/features
- "question" if it's mostly Q&A or research
- "other" for anything else`;

export async function summarizeSession(sessionId: string) {
  try {
    const [session] = await db
      .select({
        id: sessions.id,
        cwd: sessions.cwd,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        eventCount: sessions.eventCount,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session || !isVisibleSessionRow(session)) return;

    const allEvents = await db
      .select({
        id: events.id,
        eventType: events.eventType,
        source: events.source,
        model: events.model,
        toolName: events.toolName,
        toolInput: events.toolInput,
        prompt: events.prompt,
        response: events.response,
      })
      .from(events)
      .where(eq(events.sessionId, sessionId))
      .orderBy(asc(events.timestamp));

    if (allEvents.length === 0) return;

    const lastProcessedEventId = allEvents[allEvents.length - 1]?.id ?? null;
    const outputArtifacts = extractOutputArtifacts(allEvents, session.cwd);

    const formatted = allEvents
      .map((e) => {
        const parts = [`[${e.eventType}]`];
        if (e.source) parts.push(`Source: ${e.source}`);
        if (e.model) parts.push(`Model: ${e.model}`);
        if (e.toolName) parts.push(`Tool: ${e.toolName}`);
        if (e.toolInput) parts.push(`Input: ${truncate(e.toolInput, 200)}`);
        if (e.prompt) parts.push(`Prompt: ${truncate(e.prompt, 300)}`);
        if (e.response) parts.push(`Response: ${truncate(e.response, 300)}`);
        return parts.join(" | ");
      })
      .join("\n");

    const { output } = await generateText({
      model: getModelConfig().summary,
      output: Output.object({ schema: summarySchema }),
      system: SYSTEM_PROMPT,
      prompt: [
        `Session with ${allEvents.length} events.`,
        outputArtifacts.length > 0
          ? `Detected output artifacts:\n${outputArtifacts.map((item) => `- ${item.path}`).join("\n")}`
          : "Detected output artifacts: none",
        "",
        truncate(formatted, 8000),
      ].join("\n"),
    });

    if (!output) return;

    await db
      .update(sessions)
      .set({
        summary: output.summary,
        summaryLastProcessedEventId: lastProcessedEventId,
        toolsUsed: JSON.stringify(output.toolsUsed),
        frictionPoints: JSON.stringify(output.frictionPoints),
        outputArtifacts: JSON.stringify(outputArtifacts),
        sessionType: output.sessionType,
      })
      .where(eq(sessions.id, sessionId));
  } catch (err) {
    console.error("[agent-observer] Session summary error:", err);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
