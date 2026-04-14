import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MultiSelect } from "@/components/multi-select";
import { MetricInfoButton } from "@/components/metric-info-button";
import { getMetricDefinition } from "@/lib/report-metric-definitions";
import type {
  BarDatum,
  ReportFilterOptions,
  ReportFilters,
  ReportMetricCard,
  SessionDrilldownRow,
  SkillTableRow,
  SourceTableRow,
  StackedShareDatum,
  ToolTableRow,
  FailureOperationRow,
  FailingToolRow,
} from "@/lib/reporting";

const STACK_COLORS = [
  "bg-blue-700",
  "bg-cyan-700",
  "bg-green-700",
  "bg-amber-700",
  "bg-violet-700",
  "bg-red-700",
] as const;

const STACK_DOT_COLORS = [
  "bg-blue-700",
  "bg-cyan-700",
  "bg-green-700",
  "bg-amber-700",
  "bg-violet-700",
  "bg-red-700",
] as const;

/* -------------------------------------------------------------------------- */
/*  Filter Bar                                                                 */
/* -------------------------------------------------------------------------- */

export function ReportsFilterBar({
  filters,
  options,
}: {
  filters: ReportFilters;
  options: ReportFilterOptions;
}) {
  return (
    <Card>
      <CardContent className="!p-5">
        <form className="space-y-4" action="/stats" method="get">
          {/* Primary filters */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Time Range">
              <NativeSelect name="range" defaultValue={filters.timeRange}>
                <option value="7d">Last 7 days</option>
                <option value="14d">Last 14 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="all">All time</option>
                <option value="custom">Custom range</option>
              </NativeSelect>
            </Field>
            <Field label="Agent Source">
              <NativeSelect name="source" defaultValue={filters.source}>
                <option value="all">All agents</option>
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
                <option value="opencode">OpenCode</option>
                <option value="unknown">Unknown</option>
              </NativeSelect>
            </Field>
            <Field label="Ticket Status">
              <NativeSelect
                name="ticketStatus"
                defaultValue={filters.ticketStatus}
              >
                <option value="all">All</option>
                <option value="tagged">Tagged</option>
                <option value="untagged">Untagged</option>
              </NativeSelect>
            </Field>
            <Field label="Custom Dates">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  name="from"
                  defaultValue={filters.startInput}
                  className="h-8 rounded-md border border-gray-400 bg-background-100 px-2.5 text-[13px] text-gray-1000 outline-none transition-colors focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
                />
                <input
                  type="date"
                  name="to"
                  defaultValue={filters.endInput}
                  className="h-8 rounded-md border border-gray-400 bg-background-100 px-2.5 text-[13px] text-gray-1000 outline-none transition-colors focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
                />
              </div>
            </Field>
          </div>

          {/* Scoped filters */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Model">
              <MultiSelect
                name="model"
                placeholder="All models"
                defaultSelected={filters.models}
                options={options.models.map((model) => ({
                  value: model,
                  label: model,
                }))}
              />
            </Field>
            <Field label="Session Type">
              <MultiSelect
                name="sessionType"
                placeholder="All types"
                defaultSelected={filters.sessionTypes}
                options={[
                  { value: "customer", label: "Customer" },
                  { value: "building", label: "Building" },
                  { value: "question", label: "Question" },
                  { value: "other", label: "Other" },
                  { value: "unknown", label: "Unknown" },
                ]}
              />
            </Field>
            <Field label="Customer">
              <MultiSelect
                name="customer"
                placeholder="All customers"
                defaultSelected={filters.customers}
                options={options.customers.map((customer) => ({
                  value: customer,
                  label: customer,
                }))}
              />
            </Field>
            <Field label="Ticket">
              <MultiSelect
                name="ticket"
                placeholder="All tickets"
                defaultSelected={filters.tickets}
                options={options.tickets.map((ticket) => ({
                  value: ticket.id,
                  label: ticket.customer
                    ? `${ticket.id} \u00b7 ${ticket.customer}`
                    : ticket.id,
                }))}
              />
            </Field>
          </div>

          {/* Tool filter + actions */}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <div className="flex-1">
              <Field label="Tool">
                <MultiSelect
                  name="tool"
                  placeholder="All tools"
                  defaultSelected={filters.tools}
                  options={options.tools.map((tool) => ({
                    value: tool,
                    label: tool,
                  }))}
                />
              </Field>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-8 items-center justify-center rounded-md bg-gray-1000 px-4 text-[13px] font-medium text-background-100 transition-opacity hover:opacity-90"
              >
                Apply
              </button>
              <Link
                href="/stats"
                className="inline-flex h-8 items-center justify-center rounded-md border border-gray-400 px-4 text-[13px] font-medium text-gray-900 transition-colors hover:bg-gray-100"
              >
                Reset
              </Link>
            </div>
          </div>

        </form>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Metric Cards                                                               */
/* -------------------------------------------------------------------------- */

export function MetricCardGrid({ metrics }: { metrics: ReportMetricCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const delta =
          metric.previousValue !== null
            ? metric.value - metric.previousValue
            : null;

        return (
          <Card key={metric.key}>
            <CardContent className="!p-5">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-gray-700">
                  {metric.label}
                </span>
                <MetricInfo id={metric.metricId} />
              </div>
              <div className="mt-3 text-[26px] font-semibold tracking-tight text-gray-1000 tabular-nums">
                {formatMetricValue(metric.value, metric.format)}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                {delta !== null && Math.abs(delta) >= 0.05 ? (
                  <DeltaBadge
                    delta={delta}
                    format={metric.format}
                  />
                ) : (
                  <span className="text-[12px] text-gray-600">
                    {delta === null
                      ? "No comparison"
                      : "Flat vs prev period"}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DeltaBadge({
  delta,
  format,
}: {
  delta: number;
  format: ReportMetricCard["format"];
}) {
  const isPositive = delta > 0;
  const prefix = isPositive ? "+" : "";
  let text: string;

  switch (format) {
    case "percent":
      text = `${prefix}${round(delta)} pp`;
      break;
    case "duration":
      text = `${prefix}${formatDuration(Math.abs(delta))}`;
      break;
    case "decimal":
      text = `${prefix}${round(delta)}`;
      break;
    case "integer":
    default:
      text = `${prefix}${Math.round(delta).toLocaleString()}`;
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums ${
        isPositive ? "text-green-700" : "text-red-700"
      }`}
    >
      <span>{isPositive ? "\u2191" : "\u2193"}</span>
      <span>{text}</span>
      <span className="font-normal text-gray-600">vs prev</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section Header                                                             */
/* -------------------------------------------------------------------------- */

export function SectionHeader({
  title,
  description,
  metricId,
}: {
  title: string;
  description: string;
  metricId?: string;
}) {
  return (
    <div className="mb-5 border-b border-gray-300 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-gray-1000">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-gray-700">
            {description}
          </p>
        </div>
        {metricId ? <MetricInfo id={metricId} /> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chart Card                                                                 */
/* -------------------------------------------------------------------------- */

export function ChartCard({
  title,
  description,
  metricId,
  children,
}: {
  title: string;
  description?: string;
  metricId?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-[14px] font-medium">{title}</CardTitle>
          {metricId ? <MetricInfo id={metricId} /> : null}
        </div>
        {description ? (
          <p className="text-[12px] leading-relaxed text-gray-600">
            {description}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Bar Series Chart                                                           */
/* -------------------------------------------------------------------------- */

export function BarSeriesChart({
  data,
  valueFormatter,
}: {
  data: BarDatum[];
  valueFormatter?: (value: number) => string;
}) {
  if (data.length === 0) {
    return <EmptyState message="No data in the selected range." />;
  }

  const max = Math.max(...data.map((item) => item.value), 0);
  const every = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="overflow-x-auto">
      <div
        className="flex min-w-full items-end gap-[3px]"
        style={{ height: 180 }}
      >
        {data.map((item, index) => {
          const pct = max === 0 ? 2 : Math.max(2, (item.value / max) * 100);
          return (
            <div
              key={item.label}
              className="group relative flex min-w-[6px] flex-1 flex-col justify-end"
              style={{ height: "100%" }}
            >
              <div
                className="w-full rounded-t bg-blue-700 transition-opacity group-hover:opacity-80"
                style={{ height: `${pct}%` }}
              />
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-md bg-gray-1000 px-2.5 py-1.5 text-[11px] text-background-100 shadow-lg group-hover:block">
                <div className="font-medium">{item.label}</div>
                <div className="tabular-nums">
                  {valueFormatter?.(item.value) ??
                    item.value.toLocaleString()}
                </div>
              </div>
              {/* X-axis label */}
              {index % every === 0 ? (
                <div className="mt-2 text-center text-[10px] text-gray-600">
                  {shortLabel(item.label)}
                </div>
              ) : (
                <div className="mt-2 h-[14px]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Horizontal Bar List                                                        */
/* -------------------------------------------------------------------------- */

export function HorizontalBarList({
  data,
  valueFormatter,
}: {
  data: BarDatum[];
  valueFormatter?: (value: number) => string;
}) {
  if (data.length === 0) {
    return <EmptyState message="No rows for the current filters." />;
  }

  const max = Math.max(...data.map((item) => item.value), 0);

  return (
    <div className="space-y-2.5">
      {data.map((item) => {
        const width = max === 0 ? 0 : (item.value / max) * 100;
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-gray-900">
                {item.label}
              </span>
              <span className="shrink-0 text-[13px] font-medium tabular-nums text-gray-1000">
                {valueFormatter?.(item.value) ?? item.value.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-700 transition-all duration-300"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stacked Share Chart                                                        */
/* -------------------------------------------------------------------------- */

export function StackedShareChart({
  data,
}: {
  data: StackedShareDatum[];
}) {
  if (data.length === 0) {
    return <EmptyState message="No buckets in the selected range." />;
  }

  const legend = uniqueLegend(data);
  const every = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {legend.map((entry, index) => (
          <div
            key={entry}
            className="flex items-center gap-1.5 text-[11px] text-gray-700"
          >
            <span
              className={`size-2 rounded-full ${STACK_DOT_COLORS[index % STACK_DOT_COLORS.length]}`}
            />
            <span>{entry}</span>
          </div>
        ))}
      </div>

      {/* Bars */}
      <div className="overflow-x-auto">
        <div
          className="flex min-w-full items-end gap-[3px]"
          style={{ height: 160 }}
        >
          {data.map((bucket, index) => (
            <div
              key={bucket.label}
              className="group relative flex min-w-[6px] flex-1 flex-col justify-end"
              style={{ height: "100%" }}
            >
              <div className="flex h-full flex-col-reverse overflow-hidden rounded-sm bg-gray-200">
                {bucket.total === 0 ? (
                  <div className="h-full" />
                ) : (
                  bucket.segments.map((segment, segIdx) => {
                    if (segment.value === 0) return null;
                    return (
                      <div
                        key={segment.key}
                        className={`${STACK_COLORS[segIdx % STACK_COLORS.length]} transition-opacity group-hover:opacity-80`}
                        style={{
                          height: `${(segment.value / bucket.total) * 100}%`,
                        }}
                      />
                    );
                  })
                )}
              </div>
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-md bg-gray-1000 px-2.5 py-1.5 text-[11px] text-background-100 shadow-lg group-hover:block">
                <div className="mb-1 font-medium">{bucket.label}</div>
                {bucket.segments
                  .filter((s) => s.value > 0)
                  .map((s) => (
                    <div key={s.key} className="tabular-nums">
                      {s.label}:{" "}
                      {round((s.value / bucket.total) * 100)}%
                    </div>
                  ))}
              </div>
              {index % every === 0 ? (
                <div className="mt-2 text-center text-[10px] text-gray-600">
                  {shortLabel(bucket.label)}
                </div>
              ) : (
                <div className="mt-2 h-[14px]" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Data Tables                                                                */
/* -------------------------------------------------------------------------- */

export function TopToolsTable({ rows }: { rows: ToolTableRow[] }) {
  return (
    <DataTable
      emptyMessage="No tool usage in the selected range."
      headers={[
        { label: "Tool" },
        { label: "Starts", align: "right" },
        { label: "Errors", align: "right" },
        { label: "Error %", metricId: "toolErrorRate", align: "right" },
        { label: "Share", metricId: "toolShare", align: "right" },
        { label: "/ Session", metricId: "toolStartsPerSession", align: "right" },
        { label: "Trend", metricId: "toolTrendVsPrevious", align: "right" },
      ]}
      rows={rows.map((row) => [
        row.name,
        row.starts.toLocaleString(),
        row.errors.toLocaleString(),
        `${round(row.errorRate)}%`,
        `${round(row.share)}%`,
        round(row.startsPerSession).toString(),
        row.trendVsPrevious === null
          ? "\u2014"
          : `${row.trendVsPrevious > 0 ? "+" : ""}${row.trendVsPrevious}`,
      ])}
    />
  );
}

export function ToolErrorTable({ rows }: { rows: FailingToolRow[] }) {
  return (
    <DataTable
      emptyMessage="No tool errors in the selected range."
      headers={[
        { label: "Tool" },
        { label: "Starts", align: "right" },
        { label: "Errors", align: "right" },
        { label: "Error %", metricId: "toolErrorRate", align: "right" },
      ]}
      rows={rows.map((row) => [
        row.tool,
        row.starts.toLocaleString(),
        row.errors.toLocaleString(),
        `${round(row.errorRate)}%`,
      ])}
    />
  );
}

export function SourceTable({ rows }: { rows: SourceTableRow[] }) {
  return (
    <DataTable
      emptyMessage="No agent rows in the selected range."
      headers={[
        { label: "Source" },
        { label: "Sessions", align: "right" },
        { label: "Events", align: "right" },
        {
          label: "Sess %",
          metricId: "sessionShareByAgent",
          align: "right",
        },
        {
          label: "Evt %",
          metricId: "eventShareByAgent",
          align: "right",
        },
        {
          label: "Avg Evt",
          metricId: "avgEventsPerSession",
          align: "right",
        },
        { label: "Avg Dur", metricId: "avgSessionDuration", align: "right" },
        {
          label: "Tools/Sess",
          metricId: "toolStartsPerSession",
          align: "right",
        },
        {
          label: "Fric/100",
          metricId: "frictionPer100Events",
          align: "right",
        },
      ]}
      rows={rows.map((row) => [
        titleCase(row.source),
        row.sessions.toLocaleString(),
        row.events.toLocaleString(),
        `${round(row.sessionShare)}%`,
        `${round(row.eventShare)}%`,
        round(row.avgEventsPerSession).toString(),
        row.avgDurationMs === null ? "\u2014" : formatDuration(row.avgDurationMs),
        round(row.toolStartsPerSession).toString(),
        round(row.frictionPer100Events).toString(),
      ])}
    />
  );
}

export function SkillTable({ rows }: { rows: SkillTableRow[] }) {
  return (
    <DataTable
      emptyMessage="No skill invocations in the selected range."
      headers={[
        { label: "Skill" },
        { label: "Uses", align: "right" },
        { label: "Share", metricId: "toolShare", align: "right" },
        { label: "Sessions", align: "right" },
        { label: "Tickets", align: "right" },
      ]}
      rows={rows.map((row) => [
        row.name,
        row.uses.toLocaleString(),
        `${round(row.share)}%`,
        row.sessions.toLocaleString(),
        row.tickets.toLocaleString(),
      ])}
    />
  );
}

export function ToolByAgentTable({
  rows,
}: {
  rows: Array<Record<string, string | number>>;
}) {
  return (
    <DataTable
      emptyMessage="No tool starts in the selected range."
      headers={[
        { label: "Tool" },
        { label: "Claude", align: "right" },
        { label: "Codex", align: "right" },
        { label: "OpenCode", align: "right" },
        { label: "Unknown", align: "right" },
        { label: "Total", align: "right" },
      ]}
      rows={rows.map((row) => [
        String(row.tool),
        Number(row.claude).toLocaleString(),
        Number(row.codex).toLocaleString(),
        Number(row.opencode).toLocaleString(),
        Number(row.unknown).toLocaleString(),
        Number(row.total).toLocaleString(),
      ])}
    />
  );
}

export function FailureOperationsTable({
  rows,
}: {
  rows: FailureOperationRow[];
}) {
  return (
    <DataTable
      emptyMessage="No failure operations in the selected range."
      headers={[
        { label: "Operation" },
        { label: "Failures", align: "right" },
        { label: "Sessions", align: "right" },
      ]}
      rows={rows.map((row) => [
        row.operation,
        row.failures.toLocaleString(),
        row.sessions.toLocaleString(),
      ])}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Drilldown Table                                                            */
/* -------------------------------------------------------------------------- */

export function DrilldownTable({ rows }: { rows: SessionDrilldownRow[] }) {
  if (rows.length === 0) {
    return <EmptyState message="No sessions match the current filters." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="min-w-[200px]">Session</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Ticket</TableHead>
          <TableHead className="text-right">Events</TableHead>
          <TableHead className="text-right">Tools</TableHead>
          <TableHead className="text-right">Errors</TableHead>
          <TableHead className="text-right">Friction</TableHead>
          <TableHead>Summary</TableHead>
          <TableHead className="text-right">Decisions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <div className="max-w-[220px]">
                <Link
                  href={`/sessions/${row.id}`}
                  className="text-[13px] font-medium text-gray-1000 hover:underline"
                >
                  {row.sessionName || row.id.slice(0, 12)}
                </Link>
                <div className="truncate text-[11px] text-gray-600">
                  {row.startedAt ? formatDateTime(row.startedAt) : row.id}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-[11px]">
                {titleCase(row.source)}
              </Badge>
            </TableCell>
            <TableCell className="text-[12px] text-gray-800">
              {row.model}
            </TableCell>
            <TableCell className="text-[12px] text-gray-800">
              {titleCase(row.sessionType)}
            </TableCell>
            <TableCell>
              <div className="text-[12px]">
                {row.ticketId ? (
                  <span className="font-medium text-gray-1000">
                    {row.ticketId}
                  </span>
                ) : (
                  <span className="text-gray-600">Untagged</span>
                )}
              </div>
              {row.customer ? (
                <div className="text-[11px] text-gray-600">
                  {row.customer}
                </div>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[12px]">
              {row.eventCount.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[12px]">
              {row.toolStarts.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[12px]">
              {row.toolErrors > 0 ? (
                <span className="text-red-700">
                  {row.toolErrors.toLocaleString()}
                </span>
              ) : (
                <span className="text-gray-600">0</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[12px]">
              {row.frictionItems > 0 ? (
                <span className="text-amber-700">
                  {row.frictionItems.toLocaleString()}
                </span>
              ) : (
                <span className="text-gray-600">0</span>
              )}
            </TableCell>
            <TableCell className="text-[12px]">
              {row.hasSummary ? (
                <span className="text-green-700">Yes</span>
              ) : (
                <span className="text-gray-600">No</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[12px]">
              {row.hasSuccessfulDecisionRun ? (
                row.autonomousDecisions.toLocaleString()
              ) : (
                <span className="text-gray-600">{"\u2014"}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared Internals                                                           */
/* -------------------------------------------------------------------------- */

function DataTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: Array<{ label: string; metricId?: string; align?: "right" }>;
  rows: string[][];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {headers.map((header) => (
            <TableHead
              key={header.label}
              className={header.align === "right" ? "text-right" : undefined}
            >
              <span className="inline-flex items-center gap-1">
                <span>{header.label}</span>
                {header.metricId ? (
                  <MetricInfo id={header.metricId} />
                ) : null}
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, rowIndex) => (
          <TableRow key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <TableCell
                key={`${rowIndex}-${cellIndex}`}
                className={`text-[12px] ${
                  cellIndex === 0
                    ? "font-medium text-gray-1000"
                    : "tabular-nums text-gray-800"
                } ${headers[cellIndex]?.align === "right" ? "text-right" : ""}`}
              >
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-md border border-dashed border-gray-400 px-6 py-10">
      <p className="text-[13px] text-gray-600">{message}</p>
    </div>
  );
}

function NativeSelect({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-8 w-full appearance-none rounded-md border border-gray-400 bg-background-100 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8 pl-2.5 text-[13px] text-gray-1000 outline-none transition-colors focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20"
    >
      {children}
    </select>
  );
}


function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[12px] font-medium text-gray-800">
        {label}
      </div>
      {children}
    </label>
  );
}

function MetricInfo({ id }: { id: string }) {
  const definition = getMetricDefinition(id);
  return definition ? <MetricInfoButton definition={definition} /> : null;
}

/* -------------------------------------------------------------------------- */
/*  Formatting Utilities                                                       */
/* -------------------------------------------------------------------------- */

function uniqueLegend(data: StackedShareDatum[]) {
  return Array.from(
    new Set(
      data.flatMap((item) =>
        item.segments
          .filter((segment) => segment.value > 0)
          .map((segment) => segment.label)
      )
    )
  );
}

function shortLabel(label: string) {
  const [year, month, day] = label.split("-");
  if (year && month && day) {
    return `${month}/${day}`;
  }
  return label;
}

function formatMetricValue(value: number, format: ReportMetricCard["format"]) {
  switch (format) {
    case "percent":
      return `${round(value)}%`;
    case "decimal":
      return round(value).toString();
    case "duration":
      return formatDuration(value);
    case "integer":
    default:
      return Math.round(value).toLocaleString();
  }
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
