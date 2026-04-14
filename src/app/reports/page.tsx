import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listDailyReports } from "@/lib/daily-reports";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportsIndexPage() {
  const rows = await listDailyReports(45);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-10 flex items-end justify-between gap-6">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-gray-1000">
            Reports
          </h1>
          <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-gray-700">
            AI day reports with work summaries, friction highlights, and
            follow-up suggestions.
          </p>
        </div>
        <Link
          href="/stats"
          className="shrink-0 text-[13px] font-medium text-gray-900 transition-colors hover:text-gray-1000"
        >
          Open Stats &rarr;
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-400 py-20 text-center">
          <div className="mb-1.5 text-[15px] font-medium text-gray-900">
            No daily reports yet
          </div>
          <p className="max-w-sm text-[13px] leading-relaxed text-gray-600">
            Generate a day report from the{" "}
            <Link href="/" className="text-gray-1000 underline underline-offset-2">
              overview
            </Link>{" "}
            to start building history.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-400 rounded-lg border border-gray-400">
          {rows.map((row) => (
            <Link
              key={row.reportDate}
              href={`/reports/${row.reportDate}`}
              className="group flex flex-col gap-4 px-5 py-4 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-gray-100 md:flex-row md:items-start md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[14px] font-medium text-gray-1000">
                    {formatReportDate(row.reportDate)}
                  </h2>
                  <StatusBadge status={row.status} />
                  {row.needsRefresh ? (
                    <Badge variant="outline" className="border-amber-700/30 text-amber-700">
                      Needs refresh
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1.5 line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-gray-700">
                  {row.summary ?? "No stored AI summary yet."}
                </p>
              </div>
              <div className="flex shrink-0 gap-6 text-[12px] tabular-nums md:gap-8">
                <MetaColumn label="Sessions" value={row.sessionCount ?? "—"} />
                <MetaColumn
                  label="Events"
                  value={row.storedEventCount ?? row.activityEventCount ?? "—"}
                />
                <MetaColumn
                  label="Generated"
                  value={row.generatedAt ? formatDate(row.generatedAt) : "—"}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MetaColumn({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-1000">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "succeeded"
      ? "border-green-700/30 text-green-700"
      : status === "running"
        ? "border-blue-700/30 text-blue-700"
        : status === "failed"
          ? "border-red-700/30 text-red-700"
          : "border-gray-500 text-gray-700";

  return (
    <Badge variant="outline" className={variant}>
      {status}
    </Badge>
  );
}

function formatReportDate(reportDate: string) {
  const [year, month, day] = reportDate.split("-").map(Number);
  return formatDate(new Date(year, month - 1, day));
}
