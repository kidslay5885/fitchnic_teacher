"use client";

import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface WeeklyData {
  thisWeek: { dates: string[]; sent: number[]; totalSent: number };
  lastWeek: { dates: string[]; sent: number[]; totalSent: number; fullWeekSent: number };
  daysIntoWeek: number;
}

interface MonthlyData {
  thisMonth: { sent: number[]; weekCount: number; totalSent: number; monthLabel: number };
  lastMonth: { sent: number[]; weekCount: number; totalSent: number; fullMonthSent: number; monthLabel: number };
}

interface Props {
  weekly: WeeklyData;
  monthly: MonthlyData;
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export default function SendTrendChart({ weekly, monthly }: Props) {
  const [mode, setMode] = useState<"week" | "month">("week");

  const chartData =
    mode === "week"
      ? DAY_LABELS.map((label, i) => ({
          label,
          this: i <= weekly.daysIntoWeek ? weekly.thisWeek.sent[i] : null,
          last: weekly.lastWeek.sent[i],
        }))
      : Array.from(
          { length: Math.max(monthly.thisMonth.weekCount, monthly.lastMonth.weekCount) },
          (_, i) => ({
            label: `${i + 1}주차`,
            this: monthly.thisMonth.sent[i] ?? null,
            last: monthly.lastMonth.sent[i] ?? null,
          }),
        );

  const thisTotal = mode === "week" ? weekly.thisWeek.totalSent : monthly.thisMonth.totalSent;
  const lastSamePeriod = mode === "week" ? weekly.lastWeek.totalSent : monthly.lastMonth.totalSent;
  const lastFinalTotal = mode === "week" ? weekly.lastWeek.fullWeekSent : monthly.lastMonth.fullMonthSent;
  const diff = thisTotal - lastSamePeriod;

  return (
    <div className="bg-white border rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold">발송량 추이</h3>
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
            {mode === "week" ? "이번 주" : "이번 달"} {thisTotal}건
          </span>
          {" · "}
          {mode === "week" ? "같은 시점 지난주" : "같은 시점 지난달"} {lastSamePeriod}건
          {diff !== 0 && (
            <span className={`ml-1 ${diff > 0 ? "text-emerald-600" : "text-red-500"}`}>
              ({diff > 0 ? "+" : ""}
              {diff})
            </span>
          )}
        </div>
        <div>
          {mode === "week" ? "지난주" : "지난달"} 마감 {lastFinalTotal}건
        </div>
      </div>

      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              labelStyle={{ fontWeight: 600 }}
              formatter={(v: any, name) => [v ?? "-", name === "this" ? "이번" : "지난"]}
            />
            <Bar dataKey="last" name="last" fill="#bae6fd" radius={[3, 3, 0, 0]} />
            <Bar dataKey="this" name="this" fill="#0369a1" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 범례 */}
      <div className="flex gap-3 justify-center text-[11px] text-muted-foreground mt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-sky-700 rounded-sm" />
          이번 발송
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-sky-200 rounded-sm" />
          지난 발송
        </span>
      </div>
    </div>
  );
}
