type HourlyBucket = {
  day: string;
  hour: number;
  count: number;
};

const LEVEL_COLORS = [
  "var(--ds-gray-200)",
  "#9be9a8",
  "#40c463",
  "#30a14e",
  "#216e39",
];

function getLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekday(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function ActivityGraph({
  data,
  days,
}: {
  data: HourlyBucket[];
  days: string[];
}) {
  const lookup = new Map<string, number>();
  let max = 0;
  for (const { day, hour, count } of data) {
    lookup.set(`${day}-${hour}`, count);
    if (count > max) max = count;
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const totalEvents = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="mb-8">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-[16px] font-semibold">Activity</h2>
        <span className="text-[13px] text-gray-700">
          {totalEvents.toLocaleString()} events in the last 14 days
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-[4px]">
          {/* Hour labels */}
          <div className="flex gap-[4px]">
            <div className="w-[72px] shrink-0" />
            {hours.map((h) => (
              <div
                key={h}
                className="w-[18px] text-[9px] text-gray-600 text-center"
              >
                {h % 3 === 0 ? `${h}` : ""}
              </div>
            ))}
          </div>

          {/* Data rows — most recent day first */}
          {days.map((day) => (
            <div key={day} className="flex items-center gap-[4px]">
              <div className="w-[72px] shrink-0 text-[11px] text-gray-700 truncate">
                {formatWeekday(day)} {formatDayLabel(day)}
              </div>
              {hours.map((h) => {
                const count = lookup.get(`${day}-${h}`) ?? 0;
                const level = getLevel(count, max);
                return (
                  <div
                    key={h}
                    className="w-[18px] h-[18px] rounded-[2px]"
                    style={{ backgroundColor: LEVEL_COLORS[level] }}
                    title={`${formatDayLabel(day)} ${String(h).padStart(2, "0")}:00 — ${count} event${count !== 1 ? "s" : ""}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-3 text-[11px] text-gray-700">
        <span>Less</span>
        {LEVEL_COLORS.map((color, i) => (
          <div
            key={i}
            className="w-[12px] h-[12px] rounded-[2px]"
            style={{ backgroundColor: color }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
