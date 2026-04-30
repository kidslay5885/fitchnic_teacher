"use client";

import { useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface WeeklyData {
  thisWeek: { rate: (number | null)[]; totalRate: number | null };
  lastWeek: { rate: (number | null)[]; totalRate: number | null };
  daysIntoWeek: number;
}

interface MonthlyData {
  thisMonth: { rate: (number | null)[]; weekCount: number; totalRate: number | null };
  lastMonth: { rate: (number | null)[]; weekCount: number; totalRate: number | null };
}

interface Props {
  weekly: WeeklyData;
  monthly: MonthlyData;
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const fmt = (v: number | null | undefined) => (v == null ? "-" : `${v.toFixed(1)}%`);

export default function ResponseRateChart({ weekly, monthly }: Props) {
  const [mode, setMode] = useState<"week" | "month">("week");

  const chartData =
    mode === "week"
      ? DAY_LABELS.map((label, i) => ({
          label,
          this: i <= weekly.daysIntoWeek ? weekly.thisWeek.rate[i] : null,
          last: weekly.lastWeek.rate[i],
        }))
      : Array.from(
          { length: Math.max(monthly.thisMonth.weekCount, monthly.lastMonth.weekCount) },
          (_, i) => ({
            label: `${i + 1}주차`,
            this: monthly.thisMonth.rate[i] ?? null,
            last: monthly.lastMonth.rate[i] ?? null,
          }),
        );

  const thisRate = mode === "week" ? weekly.thisWeek.totalRate : monthly.thisMonth.totalRate;
  const lastRate = mode === "week" ? weekly.lastWeek.totalRate : monthly.lastMonth.totalRate;
  const diff = thisRate != null && lastRate != null ? thisRate - lastRate : null;

  return (
    <div className="bg-white border rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold">응답률 추이</h3>
        <div className="flex bg-gray-100 rounded-md p-0.5 text-xs">
          <button
            onClick={() => setMode("week")}
            className={`px-2.5 py-1 rounded ${
              mode === "week" ? "bg-white shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            이번 주
          </button>
          <button
            onClick={() => setMode("month")}
            className={`px-2.5 py-1 rounded ${
              mode === "month" ? "bg-white shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            이번 달
          </button>
        </div>
      </div>

      {/* 헤더 */}
      <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
        <div>
          <span className="text-foreground font-medium">
            {mode === "week" ? "이번 주" : "이번 달"} 응답률 {fmt(thisRate)}
          </span>
          {" · "}
          {mode === "week" ? "지난주" : "지난달"} {fmt(lastRate)}
          {diff != null && diff !== 0 && (
            <span className={`ml-1 ${diff > 0 ? "text-emerald-600" : "text-red-500"}`}>
              ({diff > 0 ? "+" : ""}
              {diff.toFixed(1)}%p)
            </span>
          )}
        </div>
        <div className="text-[11px]">응답 = 응답 + 거절</div>
      </div>

      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="#94a3b8"
              tickFormatter={(v) => `${v}%`}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              labelStyle={{ fontWeight: 600 }}
              formatter={(v: any, name) => [v == null ? "-" : `${(+v).toFixed(1)}%`, name === "this" ? "이번" : "지난"]}
            />
            <Line
              type="monotone"
              dataKey="last"
              name="last"
              stroke="#bae6fd"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: "#bae6fd" }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="this"
              name="this"
              stroke="#0369a1"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#0369a1" }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-3 justify-center text-[11px] text-muted-foreground mt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-sky-700" />
          이번 응답률
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-sky-200 border-dashed" style={{ borderTopWidth: 1, borderColor: "#bae6fd" }} />
          지난 응답률
        </span>
      </div>
    </div>
  );
}
