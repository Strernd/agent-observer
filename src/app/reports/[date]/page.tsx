import Link from "next/link";
import { DailyReportTrigger } from "@/components/daily-report-trigger";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getDailyReportState } from "@/lib/daily-reports";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DailyReportPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const state = await getDailyReportState(date);
  const report = state.report;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-[13px] text-gray-700 transition-colors hover:text-gray-1000"
        >
          &larr; Reports
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-gray-1000">
              {formatReportDate(date)}
            </h1>
            <p className="mt-1 text-[13px] tabular-nums text-gray-700">
              {state.sessionCount} sessions &middot; {state.eventCount} events
            </p>
          </div>
          <DailyReportTrigger
            reportDate={date}
            initialStatus={report?.status ?? "idle"}
            needsProcessing={state.needsProcessing}
            summaryTargetCount={state.summaryTargetCount}
            decisionTargetCount={state.decisionTargetCount}
            runningDecisionCount={state.runningDecisionCount}
          />
        </div>
      </div>

      {/* Stat row */}
      <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-400 bg-gray-400 md:grid-cols-4">
        <StatCell label="Status" value={report?.status ?? "idle"} />
        <StatCell label="Summary Refreshes" value={String(state.summaryTargetCount)} />
        <StatCell label="Decision Refreshes" value={String(state.decisionTargetCount)} />
        <StatCell
          label="Generated"
          value={report?.generatedAt ? formatDate(report.generatedAt) : "\u2014"}
        />
      </div>

      {/* Error banner */}
      {report?.errorMessage ? (
        <div className="mb-8 rounded-lg border border-red-700/20 bg-red-100 px-5 py-4">
          <p className="text-[13px] font-medium text-red-700">
            {report.errorMessage}
          </p>
        </div>
      ) : null}

      {/* Empty state */}
      {!report?.summary ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-400 py-20 text-center">
          <div className="mb-1.5 text-[15px] font-medium text-gray-900">
            No AI report for this day yet
          </div>
          <p className="max-w-sm text-[13px] leading-relaxed text-gray-600">
            Run the day report to process sessions and generate a summary.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Day Summary */}
          <section>
            <SectionHeading>Day Summary</SectionHeading>
            <p className="text-[14px] leading-7 text-gray-800">
              {report.summary}
            </p>
          </section>

          <Separator />

          {/* Two-column: Done + Suggestions */}
          <div className="grid gap-10 lg:grid-cols-2">
            {/* What Was Done */}
            <section>
              <SectionHeading>What Was Done</SectionHeading>
              {report.highLevelDone.length === 0 ? (
                <p className="text-[13px] text-gray-600">
                  No high-level items were extracted.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {report.highLevelDone.map((item) => (
                    <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-gray-800">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-700" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Top Suggestions */}
            <section>
              <SectionHeading>Top Suggestions</SectionHeading>
              {report.topSuggestions.length === 0 ? (
                <p className="text-[13px] text-gray-600">
                  No durable setup, environment, or skill improvements were strongly
                  supported by the evidence.
                </p>
              ) : (
                <div className="space-y-5">
                  {report.topSuggestions.map((suggestion) => (
                    <div key={`${suggestion.category}-${suggestion.title}`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[14px] font-medium text-gray-1000">
                          {suggestion.title}
                        </span>
                        <Badge variant="secondary">
                          {suggestion.category}
                        </Badge>
                        {suggestion.toolName ? (
                          <Badge variant="outline" className="border-blue-700/30 text-blue-700">
                            {suggestion.toolName}
                          </Badge>
                        ) : null}
                        {suggestion.skillName ? (
                          <Badge variant="outline" className="border-green-700/30 text-green-700">
                            {suggestion.skillName}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-gray-700">
                        {suggestion.detail}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <Separator />

          {/* Friction Highlights */}
          <section>
            <SectionHeading>Friction Highlights</SectionHeading>
            {report.frictionHighlights.length === 0 ? (
              <p className="text-[13px] text-gray-600">
                No major friction was extracted for this day.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {report.frictionHighlights.map((item) => (
                  <div
                    key={`${item.severity}-${item.title}`}
                    className="rounded-lg border border-gray-400 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[14px] font-medium text-gray-1000">
                        {item.title}
                      </span>
                      <SeverityBadge severity={item.severity} />
                      {item.toolName ? (
                        <Badge variant="outline" className="border-blue-700/30 text-blue-700">
                          {item.toolName}
                        </Badge>
                      ) : null}
                      {item.skillName ? (
                        <Badge variant="outline" className="border-green-700/30 text-green-700">
                          {item.skillName}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-gray-700">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-[14px] font-semibold uppercase tracking-wider text-gray-600">
      {children}
    </h2>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 bg-background-100 px-5 py-4">
      <span className="text-[12px] font-medium text-gray-600">{label}</span>
      <span className="text-[16px] font-semibold tabular-nums text-gray-1000">
        {value}
      </span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const classes =
    severity === "high"
      ? "border-red-700/30 text-red-700"
      : severity === "medium"
        ? "border-amber-700/30 text-amber-700"
        : "border-gray-500 text-gray-700";

  return (
    <Badge variant="outline" className={classes}>
      {severity}
    </Badge>
  );
}

function formatReportDate(reportDate: string) {
  const [year, month, day] = reportDate.split("-").map(Number);
  return formatDate(new Date(year, month - 1, day));
}
