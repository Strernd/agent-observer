import { after, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createDecisionRun,
  findRunningDecisionRun,
  runDecisionExtraction,
} from "@/lib/ai/extract-decisions-batch";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    const running = await findRunningDecisionRun(id);
    if (running) {
      return NextResponse.json({
        sessionId: id,
        run: running,
        alreadyRunning: true,
      });
    }

    const run = await createDecisionRun(id);

    after(() => runDecisionExtraction(run.id, id));

    return NextResponse.json(
      {
        sessionId: id,
        run,
        alreadyRunning: false,
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("[agent-observer] Decision extract API error:", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
