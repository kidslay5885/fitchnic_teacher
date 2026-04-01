"use client";

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
} from "lucide-react";

export default function DashboardTab() {
  const { state } = useOutreach();
  const stats = state.stats;

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

      {/* 총원 + 지원서 미확인 */}
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
                <p className="text-sm text-muted-foreground">지원서 미확인</p>
                <p className="text-2xl font-bold text-orange-600">{stats.pendingApplications}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground/50" />
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
                      {conversionRate(
                        funnelItems[idx + 1].value,
                        item.value
                      )}
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
              <div
                key={s}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <Badge className={STATUS_COLORS[s]}>{s}</Badge>
                <span className="text-lg font-semibold">
                  {stats.byStatus[s] || 0}
                </span>
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
                  <div
                    key={name}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-lg font-semibold">{count}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 출처별 */}
      {Object.keys(stats.bySource).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">출처별</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              {Object.entries(stats.bySource)
                .sort(([, a], [, b]) => b - a)
                .map(([src, count]) => (
                  <div
                    key={src}
                    className="flex items-center gap-2 p-3 rounded-lg border"
                  >
                    <span className="text-sm">{src}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
