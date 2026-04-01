"use client";

import { useMemo, useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { STATUS_COLORS } from "@/lib/constants";
import type { Instructor, InstructorStatus } from "@/lib/types";
import { toast } from "sonner";
import {
  Calendar,
  User,
  MessageSquare,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Save,
} from "lucide-react";

export default function MeetingTab() {
  const { state, dispatch } = useOutreach();
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingMemo, setEditingMemo] = useState<{ id: string; memo: string } | null>(null);

  const meetings = useMemo(() => {
    return state.instructors.filter((i) => i.meeting_date);
  }, [state.instructors]);

  // 이번 주 기준 날짜 계산
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7); // 월요일
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6); // 일요일

  const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} ~ ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

  // 주간 캘린더 데이터
  const weekDays = useMemo(() => {
    const days: { date: Date; label: string; dayLabel: string; meetings: Instructor[] }[] = [];
    const dayNames = ["월", "화", "수", "목", "금", "토", "일"];

    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

      // 미팅 날짜 매칭 (다양한 형식 처리)
      const dayMeetings = meetings.filter((m) => {
        const md = m.meeting_date;
        if (!md) return false;
        // "4/1", "4/1(화)", "04/01", "2026-04-01", "4월 1일" 등 매칭
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return (
          md.includes(`${month}/${day}`) ||
          md.includes(`${month}월 ${day}일`) ||
          md.includes(`${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`) ||
          md.includes(`${date.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`)
        );
      });

      days.push({
        date,
        label: dateStr,
        dayLabel: dayNames[d],
        meetings: dayMeetings,
      });
    }
    return days;
  }, [weekStart, meetings]);

  // 날짜 미매칭 미팅 (캘린더에 안 잡힌 것들)
  const unmatchedMeetings = useMemo(() => {
    const matched = new Set(weekDays.flatMap((d) => d.meetings.map((m) => m.id)));
    return meetings.filter((m) => !matched.has(m.id));
  }, [meetings, weekDays]);

  const isToday = (date: Date) => {
    const t = new Date();
    return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
  };

  const handleSaveMemo = async () => {
    if (!editingMemo) return;
    try {
      const res = await fetch(`/api/instructors/${editingMemo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_memo: editingMemo.memo }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: updated });
      setEditingMemo(null);
      toast.success("미팅 메모 저장 완료");
    } catch {
      toast.error("저장 실패");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">미팅관리</h2>
        <span className="text-sm text-muted-foreground">총 {meetings.length}건</span>
      </div>

      {/* 주간 네비 */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setWeekOffset(weekOffset - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[120px] text-center">{weekLabel}</span>
        <Button size="sm" variant="outline" onClick={() => setWeekOffset(weekOffset + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {weekOffset !== 0 && (
          <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}>
            이번 주
          </Button>
        )}
      </div>

      {/* 주간 캘린더 그리드 */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => (
          <div
            key={day.label}
            className={`rounded-lg border p-2 min-h-[120px] ${
              isToday(day.date) ? "border-primary bg-primary/5" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-medium ${isToday(day.date) ? "text-primary" : "text-muted-foreground"}`}>
                {day.dayLabel}
              </span>
              <span className={`text-sm font-semibold ${isToday(day.date) ? "text-primary" : ""}`}>
                {day.label}
              </span>
            </div>
            <div className="space-y-1">
              {day.meetings.map((m) => (
                <MeetingCard
                  key={m.id}
                  instructor={m}
                  onClickName={() => {
                    dispatch({ type: "SET_TAB", tab: "instructors" });
                    setTimeout(() => {
                      dispatch({ type: "SET_FILTER", filters: { status: "전체", search: "" } });
                      dispatch({ type: "SELECT_INSTRUCTOR", id: m.id });
                    }, 50);
                  }}
                  onEditMemo={() => setEditingMemo({ id: m.id, memo: m.meeting_memo || "" })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 전체 미팅 리스트 */}
      <Separator />
      <h3 className="text-base font-medium">전체 미팅 목록</h3>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {meetings
          .sort((a, b) => (a.meeting_date || "").localeCompare(b.meeting_date || ""))
          .map((i) => (
            <Card key={i.id} className="hover:border-primary/30 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle
                    className="text-sm cursor-pointer hover:underline"
                    onClick={() => {
                      dispatch({ type: "SET_TAB", tab: "instructors" });
                      setTimeout(() => {
                        dispatch({ type: "SET_FILTER", filters: { status: "전체", search: "" } });
                        dispatch({ type: "SELECT_INSTRUCTOR", id: i.id });
                      }, 50);
                    }}
                  >
                    {i.name}
                  </CardTitle>
                  <Badge className={STATUS_COLORS[i.status as InstructorStatus] || ""}>
                    {i.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span className="font-medium text-foreground">{i.meeting_date}</span>
                </div>
                {i.field && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>{i.field}</span>
                  </div>
                )}
                {i.youtube && (
                  <a href={i.youtube} target="_blank" rel="noopener noreferrer" className="text-blue-600 flex items-center gap-1 hover:underline">
                    YT <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {i.instagram && (
                  <a href={i.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-600 flex items-center gap-1 hover:underline">
                    IG <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
                {i.instructor_info && <p className="text-muted-foreground">{i.instructor_info}</p>}
                {i.meeting_memo && (
                  <div className="flex items-start gap-1.5">
                    <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground" />
                    <p>{i.meeting_memo}</p>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={() => setEditingMemo({ id: i.id, memo: i.meeting_memo || "" })}
                >
                  메모 수정
                </Button>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* 메모 편집 */}
      {editingMemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingMemo(null)}>
          <Card className="w-[400px]" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-sm">미팅 메모 수정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={editingMemo.memo}
                onChange={(e) => setEditingMemo({ ...editingMemo, memo: e.target.value })}
                rows={5}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveMemo}>
                  <Save className="h-3.5 w-3.5 mr-1" />
                  저장
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingMemo(null)}>
                  취소
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function MeetingCard({
  instructor,
  onClickName,
  onEditMemo,
}: {
  instructor: Instructor;
  onClickName: () => void;
  onEditMemo: () => void;
}) {
  // 시간 추출 (예: "4/1(화) 17:00" → "17:00")
  const time = instructor.meeting_date?.match(/\d{1,2}:\d{2}/)?.[0] || "";

  return (
    <div className="rounded-md bg-blue-50 border border-blue-200 px-2 py-1.5 text-xs cursor-pointer hover:bg-blue-100" onClick={onEditMemo}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-blue-900 hover:underline" onClick={(e) => { e.stopPropagation(); onClickName(); }}>
          {instructor.name}
        </span>
        {time && <span className="text-blue-600">{time}</span>}
      </div>
      <p className="text-blue-700 truncate">{instructor.field}</p>
    </div>
  );
}
