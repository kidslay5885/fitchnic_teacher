"use client";

import { useMemo } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { STATUSES, STATUS_COLORS } from "@/lib/constants";
import type { InstructorStatus } from "@/lib/types";
import {
  Users, Send, MessageSquare, Calendar, CheckCircle,
  ArrowRight, FileText, Clock, UserCheck,
} from "lucide-react";

const SECTION_TITLE = "text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3";
const CARD = "bg-white border rounded-xl";

export default function DashboardTab() {
  const { state, dispatch } = useOutreach();
  const stats = state.stats;

  const actionItems = useMemo(() => {
    const items: { label: string; count: number; icon: any; iconColor: string; iconBg: string; tab: string }[] = [];
    const c = (s: string) => state.instructors.filter((i) => i.status === s).length;

    if (c("미검토") > 0)
      items.push({ label: "미검토", count: c("미검토"), icon: UserCheck, iconColor: "text-gray-500", iconBg: "bg-gray-100", tab: "instructors" });
    if (c("발송 예정") > 0)
      items.push({ label: "발송 예정", count: c("발송 예정"), icon: Send, iconColor: "text-blue-500", iconBg: "bg-blue-100", tab: "contact" });
    const prog = state.instructors.filter((i) => i.status === "진행 중" && !i.final_status).length;
    if (prog > 0)
      items.push({ label: "응답 대기", count: prog, icon: Clock, iconColor: "text-indigo-500", iconBg: "bg-indigo-100", tab: "contact" });
    const meet = state.instructors.filter((i) => i.meeting_date).length;
    if (meet > 0)
      items.push({ label: "미팅 예정", count: meet, icon: Calendar, iconColor: "text-purple-500", iconBg: "bg-purple-100", tab: "meeting" });
    if (stats && stats.pendingApplications > 0)
      items.push({ label: "지원서 미검토", count: stats.pendingApplications, icon: FileText, iconColor: "text-orange-500", iconBg: "bg-orange-100", tab: "applications" });

    return items;
  }, [state.instructors, stats]);

  if (!stats) {
    return <div className="text-center py-12 text-sm text-muted-foreground">통계 로딩 중...</div>;
  }

  const total = stats.total || 1;

  const funnel = [
    { label: "발송", value: stats.funnel.sent, icon: Send, color: "text-blue-500", bar: "bg-blue-500" },
    { label: "응답", value: stats.funnel.responded, icon: MessageSquare, color: "text-amber-500", bar: "bg-amber-500" },
    { label: "미팅", value: stats.funnel.meeting, icon: Calendar, color: "text-purple-500", bar: "bg-purple-500" },
    { label: "계약", value: stats.funnel.contracted, icon: CheckCircle, color: "text-green-500", bar: "bg-green-500" },
  ];
  const rate = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-");

  const summaryCards = [
    { label: "전체 강사", value: stats.total, icon: Users, color: "text-gray-500", accent: "border-t-gray-300" },
    { label: "진행 중", value: stats.byStatus["진행 중"] || 0, icon: Clock, color: "text-indigo-500", accent: "border-t-indigo-400" },
    { label: "계약 완료", value: stats.byStatus["계약 완료"] || 0, icon: CheckCircle, color: "text-green-500", accent: "border-t-green-400" },
    { label: "제외", value: stats.byStatus["제외"] || 0, icon: Users, color: "text-red-400", accent: "border-t-red-400" },
  ];

  const sectionWaveConfig = [
    { key: "발송 예정" as const, dot: "bg-blue-400", count: stats.byStatus["발송 예정"] || 0 },
    { key: "진행 중" as const, dot: "bg-indigo-400", count: stats.byStatus["진행 중"] || 0 },
    { key: "제외/보류/거절" as const, dot: "bg-rose-400", count: (stats.byStatus["제외"] || 0) + (stats.byStatus["보류"] || 0) + (stats.byStatus["거절"] || 0) },
    { key: "계약 완료" as const, dot: "bg-green-400", count: stats.byStatus["계약 완료"] || 0 },
  ];

  return (
    <div className="space-y-6 max-w-5xl">

      {/* 액션 필요 */}
      {actionItems.length > 0 && (
        <section>
          <h3 className={SECTION_TITLE}>액션 필요</h3>
          <div className="grid grid-cols-4 gap-3">
            {actionItems.map((a) => (
              <button
                key={a.label}
                onClick={() => dispatch({ type: "SET_TAB", tab: a.tab as any })}
                className={`${CARD} p-4 flex items-center gap-3 text-left hover:shadow-md transition-all hover:-translate-y-0.5`}
              >
                <div className={`${a.iconBg} p-2.5 rounded-lg shrink-0`}>
                  <a.icon className={`h-4 w-4 ${a.iconColor}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{a.count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{a.label}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 전체 요약 */}
      <section>
        <h3 className={SECTION_TITLE}>전체 요약</h3>
        <div className="grid grid-cols-4 gap-3">
          {summaryCards.map((c) => (
            <div key={c.label} className={`${CARD} border-t-4 ${c.accent} p-5`}>
              <div className="flex items-start justify-between">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <c.icon className={`h-4 w-4 ${c.color} opacity-40`} />
              </div>
              <p className="text-3xl font-bold mt-3">{c.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 모집 퍼널 */}
      <section>
        <h3 className={SECTION_TITLE}>모집 퍼널</h3>
        <div className={`${CARD} p-5`}>
          <div className="grid grid-cols-4 gap-4">
            {funnel.map((f, idx) => {
              const pct = total > 0 ? Math.round((f.value / total) * 100) : 0;
              return (
                <div key={f.label} className="flex gap-3 items-stretch">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <f.icon className={`h-3.5 w-3.5 ${f.color}`} />
                        <span className="text-xs text-muted-foreground">{f.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${f.bar} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-3xl font-bold">{f.value}</p>
                    <p className="text-xs text-muted-foreground h-4">
                      {idx > 0 ? `전환율 ${rate(f.value, funnel[idx - 1].value)}` : ""}
                    </p>
                  </div>
                  {idx < funnel.length - 1 && (
                    <div className="flex items-center pt-6">
                      <ArrowRight className="h-4 w-4 text-gray-200 shrink-0" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 하단: 상태별 분포 + 섹션별 반응률 */}
      <section className="grid grid-cols-2 gap-3 items-stretch">
        {/* 상태별 분포 */}
        <div className="flex flex-col">
          <h3 className={SECTION_TITLE}>상태별 분포</h3>
          <div className={`${CARD} p-5 space-y-3 flex-1`}>
            {STATUSES.map((s) => {
              const count = stats.byStatus[s] || 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <Badge className={`text-xs px-2 py-0.5 w-[80px] justify-center shrink-0 ${STATUS_COLORS[s]}`}>{s}</Badge>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-semibold tabular-nums w-10 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 섹션별 발송 반응률 */}
        {stats.waveRates && (
          <div className="flex flex-col">
            <h3 className={SECTION_TITLE}>섹션별 발송 반응률</h3>
            <div className={`${CARD} p-5 flex flex-col justify-between flex-1`}>
              {sectionWaveConfig.map(({ key, dot, count }) => {
                const waves = stats.waveRates![key];
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                        <span className="text-sm font-medium">{key}</span>
                      </div>
                      <span className="text-sm font-bold">{count}명</span>
                    </div>
                    <div className="flex gap-4 pl-4">
                      {waves.map((w, idx) => (
                        <div key={idx} className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{idx + 1}차</span>
                          {w.rate !== null ? (
                            <span className={`font-semibold ${w.rate > 0 ? "text-green-600" : "text-gray-400"}`}>
                              {w.rate}%
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
