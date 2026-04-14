import { after, NextResponse } from "next/server";
import {
  processDailyReport,
  reconcileDailyReportState,
  startDailyReportRun,
} from "@/lib/daily-reports";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;
    const state = await reconcileDailyReportState(date);
    return NextResponse.json(state);
  } catch (error) {
    console.error("[agent-observer] Daily report GET error:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ date: string }> }
  ) {
  try {
    const { date } = await params;
    const { report, alreadyRunning } = await startDailyReportRun(date);

    if (!alreadyRunning) {
      after(async () => {
        try {
          await processDailyReport(date);
        } catch (error) {
          console.error("[agent-observer] Daily report background error:", error);
        }
      });
    }

    return NextResponse.json(
      {
        reportDate: date,
        report,
        alreadyRunning,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[agent-observer] Daily report POST error:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
