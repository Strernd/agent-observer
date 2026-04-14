import { ActivityGraph } from "@/components/activity-graph";
import { MetricInfoButton } from "@/components/metric-info-button";
import {
  BarSeriesChart,
  ChartCard,
  DrilldownTable,
  FailureOperationsTable,
  HorizontalBarList,
  MetricCardGrid,
  ReportsFilterBar,
  SectionHeader,
  SkillTable,
  SourceTable,
  StackedShareChart,
  ToolByAgentTable,
  ToolErrorTable,
  TopToolsTable,
} from "@/components/reporting";
import { Card, CardContent } from "@/components/ui/card";
import { getMetricDefinition } from "@/lib/report-metric-definitions";
import {
  getReportsPageData,
  parseReportFilters,
  type ReportFilters,
} from "@/lib/reporting";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function StatsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const filters: ReportFilters = parseReportFilters(await searchParams);
  const data = await getReportsPageData(filters);

  const hasAnyData = data.metricCards.some((metric) => metric.value > 0);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-[24px] font-semibold tracking-tight text-gray-1000">
          Stats
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-gray-700">
          Trend-oriented analytics for agent usage, tool reliability, friction,
          and work distribution.
        </p>
      </div>

      <div className="space-y-10">
        <ReportsFilterBar filters={data.filters} options={data.options} />

        {!hasAnyData ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <p className="text-[15px] font-medium text-gray-900">
                No stats data for these filters
              </p>
              <p className="mt-1.5 text-[13px] text-gray-600">
                Broaden the time range or clear a scoped filter to see results.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <MetricCardGrid metrics={data.metricCards} />

            <section>
              <SectionHeader
                title="Activity"
                description="Overall session and event volume over time plus an hourly activity heatmap."
                metricId="events"
              />
              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard
                  title="Sessions Over Time"
                  description="Daily session counts based on session start time."
                  metricId="sessions"
                >
                  <BarSeriesChart data={data.activity.sessionsSeries} />
                </ChartCard>
                <ChartCard
                  title="Events Over Time"
                  description="Daily event counts using normalized visible events."
                  metricId="events"
                >
                  <BarSeriesChart data={data.activity.eventsSeries} />
                </ChartCard>
              </div>
              <div className="mt-4">
                <ChartCard
                  title="Hourly Activity Heatmap"
                  description="Last 14 days of event activity by hour."
                >
                  <ActivityGraph
                    data={data.activity.heatmap}
                    days={data.activity.heatmapDays}
                  />
                </ChartCard>
              </div>
            </section>

            <section>
              <SectionHeader
                title="Agents"
                description="Adoption, workload split, and model mix by source."
                metricId="sessionShareByAgent"
              />
              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard
                  title="Agent Session Share"
                  description="Normalized to 100% by day."
                  metricId="sessionShareByAgent"
                >
                  <StackedShareChart data={data.agents.sessionShareSeries} />
                </ChartCard>
                <ChartCard
                  title="Agent Event Share"
                  description="Normalized to 100% by day."
                  metricId="eventShareByAgent"
                >
                  <StackedShareChart data={data.agents.eventShareSeries} />
                </ChartCard>
                <ChartCard
                  title="Sessions by Agent"
                  description="Raw session counts by normalized source."
                  metricId="sessions"
                >
                  <HorizontalBarList data={data.agents.sessionsBySource} />
                </ChartCard>
                <ChartCard
                  title="Model Share"
                  description="Top models by session count, normalized to 100% by day."
                  metricId="modelShare"
                >
                  <StackedShareChart data={data.agents.modelShareSeries} />
                </ChartCard>
              </div>
              <div className="mt-4">
                <ChartCard
                  title="Agent Workload Table"
                  description="Sessions, events, intensity, and normalized friction by source."
                >
                  <SourceTable rows={data.agents.sourceTable} />
                </ChartCard>
              </div>
            </section>

            <section>
              <SectionHeader
                title="Tools"
                description="Most-used tools, reliability, share changes, and skill usage."
                metricId="toolStarts"
              />
              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard
                  title="Top Tools by Starts"
                  description="Ranked by normalized tool_pre events."
                >
                  <TopToolsTable rows={data.tools.topTools} />
                </ChartCard>
                <ChartCard
                  title="Tool Error Rates"
                  description="Operational error rate by tool."
                  metricId="toolErrorRate"
                >
                  <ToolErrorTable rows={data.tools.errorTools} />
                </ChartCard>
                <ChartCard
                  title="Tool Share Over Time"
                  description="Top five tools, normalized to 100% by day."
                  metricId="toolShare"
                >
                  <StackedShareChart data={data.tools.toolShareSeries} />
                </ChartCard>
                <ChartCard
                  title="Tool Usage by Agent"
                  description="Tool start counts broken down by source."
                >
                  <ToolByAgentTable rows={data.tools.toolByAgentRows} />
                </ChartCard>
              </div>
              <div className="mt-4">
                <ChartCard
                  title="Skill Usage"
                  description="Skill invocations parsed from normalized tool starts."
                >
                  <SkillTable rows={data.tools.skillRows} />
                </ChartCard>
              </div>
            </section>

            <section>
              <SectionHeader
                title="Friction"
                description="Behavioral friction, operational failures, and repeated trouble spots."
                metricId="frictionPer100Events"
              />
              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard
                  title="Friction per 100 Events"
                  description="Daily normalized friction rate."
                  metricId="frictionPer100Events"
                >
                  <BarSeriesChart data={data.friction.frictionSeriesByEvents} />
                </ChartCard>
                <ChartCard
                  title="Friction per 100 Tool Starts"
                  description="Daily normalized friction rate against tool volume."
                  metricId="frictionPer100ToolStarts"
                >
                  <BarSeriesChart data={data.friction.frictionSeriesByToolStarts} />
                </ChartCard>
                <ChartCard
                  title="Failure Type Breakdown"
                  description="Most common operational failure classes."
                >
                  <HorizontalBarList data={data.friction.failureTypeRows} />
                </ChartCard>
                <ChartCard
                  title="Friction by Tool"
                  description="Friction attributed to tools used in those sessions."
                >
                  <HorizontalBarList data={data.friction.byToolRows} />
                </ChartCard>
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <ChartCard
                  title="Friction by Agent"
                  description="Friction item counts by normalized session source."
                >
                  <HorizontalBarList data={data.friction.bySourceRows} />
                </ChartCard>
                <ChartCard
                  title="Top Failing Operations"
                  description="Derived from canonical failureOperation summaries."
                >
                  <FailureOperationsTable rows={data.friction.failureOperations} />
                </ChartCard>
              </div>
            </section>

            <section>
              <SectionHeader
                title="Work Items"
                description="Tagged work mix, session type mix, and the customers or work items driving activity."
                metricId="taggedSessionShare"
              />
              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard
                  title="Assigned vs Unassigned"
                  description="Raw session counts for assigned vs unassigned work."
                  metricId="taggedSessionShare"
                >
                  <HorizontalBarList data={data.work.taggedVsUntagged} />
                </ChartCard>
                <ChartCard
                  title="Session Type Mix"
                  description="Daily session type share normalized to 100%."
                  metricId="sessionTypeShare"
                >
                  <StackedShareChart data={data.work.sessionTypeMixSeries} />
                </ChartCard>
                <ChartCard
                  title="Most Active Customers"
                  description="Customers ranked by event volume."
                  metricId="events"
                >
                  <CustomerList rows={data.work.customerRows} />
                </ChartCard>
                <ChartCard
                  title="Most Active Work Items"
                  description="Work items ranked by event volume."
                  metricId="events"
                >
                  <TicketList rows={data.work.ticketRows} />
                </ChartCard>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <CoverageCard
                  title="Summary Coverage"
                  value={data.work.summaryCoverage}
                  metricId="summaryCoverage"
                />
                <CoverageCard
                  title="Decision Coverage"
                  value={data.work.decisionCoverage}
                  metricId="decisionExtractionCoverage"
                />
                <CoverageCard
                  title="Artifact Yield"
                  value={data.work.artifactYield}
                  metricId="artifactYield"
                />
              </div>
            </section>

            <section>
              <SectionHeader
                title="Drilldown"
                description="Session-level table for following trends back to individual work."
              />
              <Card>
                <CardContent className="p-0">
                  <DrilldownTable rows={data.drilldownRows} />
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function CoverageCard({
  title,
  value,
  metricId,
}: {
  title: string;
  value: number;
  metricId: string;
}) {
  const definition = getMetricDefinition(metricId);
  const rounded = Math.round(value * 10) / 10;
  const barColor =
    rounded >= 80
      ? "bg-green-700"
      : rounded >= 50
        ? "bg-amber-700"
        : "bg-red-700";

  return (
    <Card>
      <CardContent className="!p-5">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-gray-700">{title}</span>
          {definition ? <MetricInfoButton definition={definition} /> : null}
        </div>
        <div className="mt-3 text-[26px] font-semibold tracking-tight tabular-nums text-gray-1000">
          {rounded}%
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-300`}
            style={{ width: `${Math.min(100, rounded)}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerList({
  rows,
}: {
  rows: Array<{ customer: string; sessions: number; events: number }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-gray-400 px-6 py-10">
        <p className="text-[13px] text-gray-600">No rows in the selected range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.customer}
          className="flex items-center justify-between gap-4"
        >
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-gray-1000">
              {row.customer}
            </div>
            <div className="text-[11px] text-gray-600">
              {row.sessions.toLocaleString()} sessions
            </div>
          </div>
          <span className="shrink-0 text-[13px] font-medium tabular-nums text-gray-800">
            {row.events.toLocaleString()} evt
          </span>
        </div>
      ))}
    </div>
  );
}

function TicketList({
  rows,
}: {
  rows: Array<{
    ticketId: string;
    customer: string | null;
    title: string | null;
    events: number;
    sessions: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-gray-400 px-6 py-10">
        <p className="text-[13px] text-gray-600">No rows in the selected range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.ticketId}
          className="flex items-center justify-between gap-4"
        >
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-gray-1000">
              {row.ticketId}
            </div>
            <div className="truncate text-[11px] text-gray-600">
              {row.customer ? `${row.customer} · ` : ""}
              {row.title ?? "Untitled"}
            </div>
          </div>
          <div className="shrink-0 text-right text-[11px] tabular-nums text-gray-600">
            <div className="text-[13px] font-medium text-gray-800">
              {row.events.toLocaleString()} evt
            </div>
            <div>{row.sessions.toLocaleString()} sess</div>
          </div>
        </div>
      ))}
    </div>
  );
}
