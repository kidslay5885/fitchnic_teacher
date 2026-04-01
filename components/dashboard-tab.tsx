"use client";

import { useMemo } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUSES, STATUS_COLORS } from "@/lib/constants";
import type { InstructorStatus } from "@/lib/types";
import {
  Users, Send, MessageSquare, Calendar, CheckCircle,
  ArrowRight, FileText, Clock, UserCheck,
} from "lucide-react";

export default function DashboardTab() {
  const { state, dispatch } = useOutreach();
  const stats = state.stats;

  const actionItems = useMemo(() => {
    const items: { label: string; count: number; icon: any; color: string; tab: string }[] = [];
    const c = (s: string) => state.instructors.filter((i) => i.status === s).length;

    if (c("미검토") > 0)
      items.push({ label: "미검토", count: c("미검토"), icon: UserCheck, color: "border-l-gray-400 bg-gray-50", tab: "instructors" });
    if (c("발송 예정") > 0)
      items.push({ label: "발송 예정", count: c("발송 예정"), icon: Send, color: "border-l-blue-500 bg-blue-50", tab: "contact" });
    const prog = state.instructors.filter((i) => i.status === "진행 중" && !i.final_status).length;
    if (prog > 0)
      items.push({ label: "응답 대기", count: prog, icon: Clock, color: "border-l-indigo-500 bg-indigo-50", tab: "contact" });
    const meet = state.instructors.filter((i) => i.meeting_date).length;
    if (meet > 0)
      items.push({ label: "미팅 예정", count: meet, icon: Calendar, color: "border-l-purple-500 bg-purple-50", tab: "meeting" });
    if (stats && stats.pendingApplications > 0)
      items.push({ label: "지원서 미확인", count: stats.pendingApplications, icon: FileText, color: "border-l-orange-500 bg-orange-50", tab: "applications" });

    return items;
  }, [state.instructors, stats]);

  if (!stats) {
    return <div className="text-center py-12 text-sm text-muted-foreground">통계 로딩 중...</div>;
  }

  const funnel = [
    { label: "발송", value: stats.funnel.sent, icon: Send, color: "text-blue-600" },
    { label: "응답", value: stats.funnel.responded, icon: MessageSquare, color: "text-amber-600" },
    { label: "미팅", value: stats.funnel.meeting, icon: Calendar, color: "text-purple-600" },
    { label: "계약", value: stats.funnel.contracted, icon: CheckCircle, color: "text-green-600" },
  ];
  const rate = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-");

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">현황판</h2>

      {/* 액션 카드 */}
      {actionItems.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {actionItems.map((a) => (
            <button
              key={a.label}
              onClick={() => dispatch({ type: "SET_TAB", tab: a.tab as any })}
              className={`flex items-center gap-3 p-4 rounded-lg border-l-4 text-left transition-all hover:shadow-sm ${a.color}`}
            >
              <a.icon className="h-5 w-5 flex-shrink-0 opacity-60" />
              <div className="min-w-0">
                <p className="text-2xl font-bold leading-none">{a.count}</p>
                <p className="text-xs text-muted-foreground mt-1">{a.label}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 요약 숫자 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체", value: stats.total, icon: Users },
          { label: "계약 완료", value: stats.byStatus["계약 완료"] || 0, icon: CheckCircle },
          { label: "진행 중", value: stats.byStatus["진행 중"] || 0, icon: Clock },
          { label: "제외", value: stats.byStatus["제외"] || 0, icon: Users },
        ].map((c) => (
          <Card key={c.label} className="py-4">
            <CardContent className="p-0 px-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold mt-0.5">{c.value}</p>
              </div>
              <c.icon className="h-6 w-6 text-muted-foreground/30" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 퍼널 */}
      <Card>
        <CardHeader className="py-4 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">모집 퍼널</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex items-center justify-center gap-2">
            {funnel.map((f, idx) => (
              <div key={f.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center px-6 py-3 rounded-lg border min-w-[90px]">
                  <f.icon className={`h-5 w-5 ${f.color} mb-1`} />
                  <p className="text-2xl font-bold">{f.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.label}</p>
                </div>
                {idx < funnel.length - 1 && (
                  <div className="flex flex-col items-center gap-1">
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground">{rate(funnel[idx + 1].value, f.value)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 섹션별 반응률 */}
      {stats.waveRates && (
        <Card>
          <CardHeader className="py-3 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">섹션별 발송 반응률</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-4 gap-3">
              {(["발송 예정", "진행 중", "제외/보류/거절", "계약 완료"] as const).map((sec) => {
                const sectionColor: Record<string, string> = {
                  "발송 예정": "border-l-blue-400",
                  "진행 중": "border-l-indigo-400",
                  "제외/보류/거절": "border-l-rose-400",
                  "계약 완료": "border-l-green-400",
                };
                const sectionCount: Record<string, number> = {
                  "발송 예정": stats.byStatus["발송 예정"] || 0,
                  "진행 중": stats.byStatus["진행 중"] || 0,
                  "제외/보류/거절": (stats.byStatus["제외"] || 0) + (stats.byStatus["보류"] || 0) + (stats.byStatus["거절"] || 0),
                  "계약 완료": stats.byStatus["계약 완료"] || 0,
                };
                const waves = stats.waveRates![sec];
                return (
                  <div key={sec} className={`border-l-4 ${sectionColor[sec]} bg-muted/30 rounded-r-lg px-3 py-3`}>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-sm font-semibold">{sec}</span>
                      <span className="text-lg font-bold">{sectionCount[sec]}</span>
                    </div>
                    <div className="space-y-1">
                      {waves.map((w, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{idx + 1}차</span>
                          <div className="flex items-center gap-1.5">
                            {w.rate !== null ? (
                              <>
                                <span className={`font-semibold ${w.rate > 0 ? "text-green-700" : "text-gray-400"}`}>{w.rate}%</span>
                                <span className="text-muted-foreground">({w.reacted}/{w.sent})</span>
                              </>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 상태별 분포 */}
      <Card>
        <CardHeader className="py-3 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">상태별 분포</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-4 gap-x-6 gap-y-2">
            {STATUSES.map((s) => (
              <div key={s} className="flex items-center justify-between py-1.5">
                <Badge className={`text-xs px-2 py-0.5 ${STATUS_COLORS[s]}`}>{s}</Badge>
                <span className="text-sm font-semibold tabular-nums">{stats.byStatus[s] || 0}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
