"use client";

import { useMemo, useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { STATUS_COLORS } from "@/lib/constants";
import type { Instructor, InstructorStatus } from "@/lib/types";
import { toast } from "sonner";
import { Calendar, ChevronLeft, ChevronRight, Save, ExternalLink, MessageSquare } from "lucide-react";

export default function MeetingTab() {
  const { state, dispatch } = useOutreach();
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingMemo, setEditingMemo] = useState<{ id: string; memo: string } | null>(null);

  const meetings = useMemo(() => state.instructors.filter((i) => i.meeting_date), [state.instructors]);

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);

  const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} ~ ${new Date(weekStart.getTime() + 6 * 86400000).getMonth() + 1}/${new Date(weekStart.getTime() + 6 * 86400000).getDate()}`;
  const dayNames = ["월", "화", "수", "목", "금", "토", "일"];

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, d) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d);
      const m = date.getMonth() + 1, dy = date.getDate();
      const dayMeetings = meetings.filter((mt) => {
        const md = mt.meeting_date || "";
        return md.includes(`${m}/${dy}`) || md.includes(`${m}월 ${dy}일`) ||
          md.includes(`${String(m).padStart(2, "0")}/${String(dy).padStart(2, "0")}`) ||
          md.includes(`${date.getFullYear()}-${String(m).padStart(2, "0")}-${String(dy).padStart(2, "0")}`);
      });
      return { date, label: `${m}/${dy}`, dayLabel: dayNames[d], meetings: dayMeetings };
    });
  }, [weekStart, meetings]);

  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();

  const handleSaveMemo = async () => {
    if (!editingMemo) return;
    try {
      const res = await fetch(`/api/instructors/${editingMemo.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_memo: editingMemo.memo }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      setEditingMemo(null);
      toast.success("메모 저장 완료");
    } catch { toast.error("저장 실패"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">미팅관리</h2>
        <span className="text-xs text-muted-foreground">{meetings.length}건</span>
      </div>

      {/* 주간 네비 */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setWeekOffset(weekOffset - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium min-w-[100px] text-center">{weekLabel}</span>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setWeekOffset(weekOffset + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        {weekOffset !== 0 && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setWeekOffset(0)}>이번 주</Button>
        )}
      </div>

      {/* 주간 캘린더 */}
      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((day) => (
          <div
            key={day.label}
            className={`rounded-lg border p-1.5 min-h-[90px] ${isToday(day.date) ? "border-primary bg-primary/5" : "bg-card"}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-[10px] ${isToday(day.date) ? "text-primary font-bold" : "text-muted-foreground"}`}>{day.dayLabel}</span>
              <span className={`text-xs font-medium ${isToday(day.date) ? "text-primary" : ""}`}>{day.label}</span>
            </div>
            <div className="space-y-0.5">
              {day.meetings.map((m) => {
                const time = m.meeting_date?.match(/\d{1,2}:\d{2}/)?.[0];
                return (
                  <button
                    key={m.id}
                    onClick={() => setEditingMemo({ id: m.id, memo: m.meeting_memo || "" })}
                    className="w-full text-left rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] hover:bg-blue-100 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-blue-900 truncate">{m.name}</span>
                      {time && <span className="text-blue-500 ml-1">{time}</span>}
                    </div>
                    {m.field && <p className="text-blue-600 truncate">{m.field}</p>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Separator />

      {/* 전체 리스트 */}
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">전체 미팅 목록</h3>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {meetings
          .sort((a, b) => (a.meeting_date || "").localeCompare(b.meeting_date || ""))
          .map((i) => (
            <Card key={i.id} className="py-0 hover:border-primary/30 transition-colors">
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-medium cursor-pointer hover:underline"
                    onClick={() => {
                      dispatch({ type: "SET_TAB", tab: "instructors" });
                      setTimeout(() => {
                        dispatch({ type: "SET_FILTER", filters: { status: "전체", search: "" } });
                        dispatch({ type: "SELECT_INSTRUCTOR", id: i.id });
                      }, 50);
                    }}
                  >{i.name}</span>
                  <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span className="font-medium text-foreground">{i.meeting_date}</span>
                  {i.field && <span>| {i.field}</span>}
                </div>
                <div className="flex gap-2">
                  {i.youtube && <a href={i.youtube} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">YT<ExternalLink className="h-2.5 w-2.5" /></a>}
                  {i.instagram && <a href={i.instagram} target="_blank" rel="noopener noreferrer" className="text-[10px] text-pink-600 hover:underline flex items-center gap-0.5">IG<ExternalLink className="h-2.5 w-2.5" /></a>}
                </div>
                {i.instructor_info && <p className="text-[10px] text-muted-foreground">{i.instructor_info}</p>}
                {i.meeting_memo && (
                  <div className="flex items-start gap-1">
                    <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <p className="text-[10px]">{i.meeting_memo}</p>
                  </div>
                )}
                <button onClick={() => setEditingMemo({ id: i.id, memo: i.meeting_memo || "" })} className="text-[10px] text-primary hover:underline">메모 수정</button>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* 메모 모달 */}
      {editingMemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingMemo(null)}>
          <Card className="w-[360px]" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-semibold">미팅 메모 수정</p>
              <Textarea value={editingMemo.memo} onChange={(e) => setEditingMemo({ ...editingMemo, memo: e.target.value })} rows={4} autoFocus className="text-xs" />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={handleSaveMemo}><Save className="h-3 w-3 mr-1" />저장</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingMemo(null)}>취소</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
