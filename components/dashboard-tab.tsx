"use client";

import { useMemo } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUSES, STATUS_COLORS } from "@/lib/constants";
import type { InstructorStatus } from "@/lib/types";
import {
  Users,
  Send,
  MessageSquare,
  Calendar,
  CheckCircle,
  ArrowRight,
  FileText,
  AlertCircle,
  Clock,
  UserCheck,
} from "lucide-react";

export default function DashboardTab() {
  const { state, dispatch } = useOutreach();
  const stats = state.stats;

  // 액션 카드용 데이터
  const actionItems = useMemo(() => {
    const items: { label: string; count: number; icon: any; color: string; tab: string; description: string }[] = [];

    const unreviewed = state.instructors.filter((i) => i.status === "미검토").length;
    if (unreviewed > 0) {
      items.push({
        label: "미검토 강사",
        count: unreviewed,
        icon: UserCheck,
        color: "text-gray-600 bg-gray-50 border-gray-200",
        tab: "instructors",
        description: "검토가 필요한 새 강사",
      });
    }

    const readyToSend = state.instructors.filter((i) => i.status === "발송 예정").length;
    if (readyToSend > 0) {
      items.push({
        label: "발송 예정",
        count: readyToSend,
        icon: Send,
        color: "text-blue-600 bg-blue-50 border-blue-200",
        tab: "contact",
        description: "발송 대기 중인 강사",
      });
    }

    // 후속 발송 필요 (진행 중인데 최종상태 없는 강사)
    const inProgress = state.instructors.filter(
      (i) => i.status === "진행 중" && !i.final_status
    ).length;
    if (inProgress > 0) {
      items.push({
        label: "진행 중 (응답 대기)",
        count: inProgress,
        icon: Clock,
        color: "text-indigo-600 bg-indigo-50 border-indigo-200",
        tab: "contact",
        description: "응답을 기다리는 강사",
      });
    }

    const meetingCount = state.instructors.filter((i) => i.meeting_date).length;
    if (meetingCount > 0) {
      items.push({
        label: "미팅 예정",
        count: meetingCount,
        icon: Calendar,
        color: "text-purple-600 bg-purple-50 border-purple-200",
        tab: "meeting",
        description: "미팅이 잡힌 강사",
      });
    }

    if (stats && stats.pendingApplications > 0) {
      items.push({
        label: "지원서 미확인",
        count: stats.pendingApplications,
        icon: FileText,
        color: "text-orange-600 bg-orange-50 border-orange-200",
        tab: "applications",
        description: "확인이 필요한 지원서",
      });
    }

    return items;
  }, [state.instructors, stats]);

  if (!stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        통계 데이터를 불러오는 중...
      </div>
    );
  }

  const funnelItems = [
    { label: "발송", value: stats.funnel.sent, icon: Send, color: "text-blue-600" },
    { label: "응답", value: stats.funnel.responded, icon: MessageSquare, color: "text-yellow-600" },
    { label: "미팅", value: stats.funnel.meeting, icon: Calendar, color: "text-purple-600" },
    { label: "계약", value: stats.funnel.contracted, icon: CheckCircle, color: "text-green-600" },
  ];

  const conversionRate = (a: number, b: number) =>
    b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "0%";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">현황판</h2>

      {/* 액션 카드 — 할 일 */}
      {actionItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {actionItems.map((item) => (
            <button
              key={item.label}
              onClick={() => dispatch({ type: "SET_TAB", tab: item.tab as any })}
              className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-all hover:shadow-md ${item.color}`}
            >
              <div className="p-2 rounded-full bg-white/80">
                <item.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xl font-bold">{item.count}</span>
                </div>
                <p className="text-xs opacity-70">{item.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 총원 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">전체 강사</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">계약 완료</p>
                <p className="text-2xl font-bold text-green-600">{stats.byStatus["계약 완료"] || 0}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">진행 중</p>
                <p className="text-2xl font-bold text-indigo-600">{stats.byStatus["진행 중"] || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-indigo-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">지원서 미확인</p>
                <p className="text-2xl font-bold text-orange-600">{stats.pendingApplications}</p>
              </div>
              <FileText className="h-8 w-8 text-orange-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 퍼널 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">모집 퍼널</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {funnelItems.map((item, idx) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="flex flex-col items-center p-4 rounded-lg border min-w-[100px]">
                  <item.icon className={`h-6 w-6 ${item.color} mb-1`} />
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
                {idx < funnelItems.length - 1 && (
                  <div className="flex flex-col items-center">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {conversionRate(funnelItems[idx + 1].value, item.value)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 상태별 분포 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">상태별 분포</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATUSES.map((s) => (
              <div key={s} className="flex items-center justify-between p-3 rounded-lg border">
                <Badge className={STATUS_COLORS[s]}>{s}</Badge>
                <span className="text-lg font-semibold">{stats.byStatus[s] || 0}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 담당자별 현황 */}
      {Object.keys(stats.byAssignee).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">담당자별 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(stats.byAssignee)
                .sort(([, a], [, b]) => b - a)
                .map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-lg font-semibold">{count}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
