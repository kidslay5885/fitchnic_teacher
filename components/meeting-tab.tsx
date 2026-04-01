"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_COLORS } from "@/lib/constants";
import type { Instructor, InstructorStatus } from "@/lib/types";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Save, ExternalLink, MessageSquare, Plus, X, Trash2 } from "lucide-react";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export default function MeetingTab() {
  const { state, dispatch } = useOutreach();
  const [monthOffset, setMonthOffset] = useState(0);
  const [editingMemo, setEditingMemo] = useState<{ id: string; memo: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const meetings = useMemo(() => state.instructors.filter((i) => i.meeting_date), [state.instructors]);

  const now = new Date();
  const viewYear = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getFullYear();
  const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getMonth();
  const monthLabel = `${viewYear}년 ${viewMonth + 1}월`;

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: { date: Date | null; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null, day: 0, inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(viewYear, viewMonth, d), day: d, inMonth: true });
    while (cells.length < 42) cells.push({ date: null, day: 0, inMonth: false });
    return cells;
  }, [viewYear, viewMonth]);

  const getMeetingsForDate = (date: Date | null) => {
    if (!date) return [];
    const m = date.getMonth() + 1, d = date.getDate();
    const iso = `${date.getFullYear()}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return meetings.filter((mt) => {
      const md = mt.meeting_date || "";
      return md.includes(iso) || md.includes(`${m}/${d}`) || md.includes(`${m}월 ${d}일`) ||
        md.includes(`${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`);
    });
  };

  const isToday = (date: Date | null) => date?.toDateString() === now.toDateString();

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

  const handleRemoveMeeting = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/instructors/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_date: "", meeting_memo: "" }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      toast.success(`${name} 미팅 삭제`);
    } catch { toast.error("삭제 실패"); }
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* 헤더 */}
      <div className="shrink-0 flex items-center justify-between pb-3">
        <h2 className="text-lg font-semibold">미팅관리</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{meetings.length}건</span>
          <Button size="sm" className="h-8 text-sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-1" />미팅 추가
          </Button>
        </div>
      </div>

      {/* 월 네비 */}
      <div className="shrink-0 flex items-center gap-3 pb-3">
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setMonthOffset(monthOffset - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold min-w-[100px] text-center">{monthLabel}</span>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setMonthOffset(monthOffset + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {monthOffset !== 0 && (
          <Button size="sm" variant="ghost" className="h-8 text-sm" onClick={() => setMonthOffset(0)}>이번 달</Button>
        )}
      </div>

      {/* 월간 달력 */}
      <div className="shrink-0 border rounded-lg overflow-hidden mb-4">
        <div className="grid grid-cols-7 bg-[#f8f9fa] border-b">
          {DAY_NAMES.map((d, i) => (
            <div key={d} className={`text-center text-xs font-semibold py-2 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted-foreground"} ${i < 6 ? "border-r border-gray-200" : ""}`}>
              {d}
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div key={week} className={`grid grid-cols-7 ${week < 5 ? "border-b" : ""}`}>
            {calendarDays.slice(week * 7, week * 7 + 7).map((cell, ci) => {
              const dayMeetings = getMeetingsForDate(cell.date);
              const today = isToday(cell.date);
              return (
                <div
                  key={ci}
                  className={`min-h-[72px] p-1 ${ci < 6 ? "border-r border-gray-200" : ""} ${
                    !cell.inMonth ? "bg-gray-50/50" : today ? "bg-primary/5" : "bg-white"
                  }`}
                >
                  {cell.inMonth && (
                    <>
                      <div className={`text-xs mb-0.5 ${today ? "text-primary font-bold" : ci === 0 ? "text-red-400" : ci === 6 ? "text-blue-400" : "text-muted-foreground"}`}>
                        {cell.day}
                      </div>
                      <div className="space-y-0.5">
                        {dayMeetings.map((mt) => {
                          const time = mt.meeting_date?.match(/\d{1,2}:\d{2}/)?.[0];
                          return (
                            <button
                              key={mt.id}
                              onClick={() => setEditingMemo({ id: mt.id, memo: mt.meeting_memo || "" })}
                              className="w-full text-left rounded bg-blue-100 border border-blue-200 px-1.5 py-0.5 text-[11px] hover:bg-blue-200 transition-colors truncate"
                            >
                              <span className="font-medium text-blue-900">{mt.name}</span>
                              {time && <span className="text-blue-500 ml-1">{time}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 전체 미팅 목록 */}
      <h3 className="shrink-0 text-sm font-semibold text-muted-foreground uppercase tracking-wider pb-2">전체 미팅 목록</h3>
      <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#f8f9fa] text-xs font-semibold text-muted-foreground">
            <tr className="border-b">
              <th className="text-left px-3 py-2 border-r border-gray-200 w-[100px]">강사명</th>
              <th className="text-left px-3 py-2 border-r border-gray-200 w-[80px]">상태</th>
              <th className="text-left px-3 py-2 border-r border-gray-200 w-[140px]">미팅일정</th>
              <th className="text-left px-3 py-2 border-r border-gray-200">분야</th>
              <th className="text-left px-3 py-2 border-r border-gray-200 w-[80px]">유튜브</th>
              <th className="text-left px-3 py-2 border-r border-gray-200 w-[80px]">인스타그램</th>
              <th className="text-left px-3 py-2 border-r border-gray-200">메모</th>
              <th className="text-center px-3 py-2 w-[80px]">관리</th>
            </tr>
          </thead>
          <tbody>
            {meetings
              .sort((a, b) => (a.meeting_date || "").localeCompare(b.meeting_date || ""))
              .map((i, idx) => (
                <tr key={i.id} className={`border-b hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}`}>
                  <td className="px-3 py-2 border-r border-gray-200/60 font-medium">{i.name}</td>
                  <td className="px-3 py-2 border-r border-gray-200/60">
                    <Badge className={`text-xs px-1.5 py-0 whitespace-nowrap ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge>
                  </td>
                  <td className="px-3 py-2 border-r border-gray-200/60 font-medium">{i.meeting_date}</td>
                  <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground">{i.field}</td>
                  <td className="px-3 py-2 border-r border-gray-200/60">
                    {i.youtube ? <a href={i.youtube} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5">링크<ExternalLink className="h-3 w-3" /></a> : ""}
                  </td>
                  <td className="px-3 py-2 border-r border-gray-200/60">
                    {i.instagram ? <a href={i.instagram.startsWith("http") ? i.instagram : `https://instagram.com/${i.instagram}`} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline flex items-center gap-0.5">링크<ExternalLink className="h-3 w-3" /></a> : ""}
                  </td>
                  <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground">
                    {i.meeting_memo ? <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3 shrink-0" /><span className="truncate max-w-[200px]">{i.meeting_memo}</span></span> : ""}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setEditingMemo({ id: i.id, memo: i.meeting_memo || "" })} className="text-xs text-primary hover:underline">메모</button>
                      <button onClick={() => handleRemoveMeeting(i.id, i.name)} className="text-xs text-red-500 hover:underline">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {meetings.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">미팅 예정이 없습니다.</div>
        )}
      </div>

      {/* 미팅 추가 모달 */}
      {showAddModal && (
        <AddMeetingModal
          instructors={state.instructors}
          onSave={async (id, meetingDate, memo) => {
            try {
              const res = await fetch(`/api/instructors/${id}`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ meeting_date: meetingDate, meeting_memo: memo || "" }),
              });
              if (!res.ok) throw new Error("Failed");
              dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
              toast.success("미팅 추가 완료");
              setShowAddModal(false);
            } catch { toast.error("추가 실패"); }
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* 메모 수정 모달 */}
      {editingMemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingMemo(null)}>
          <Card className="w-[400px]" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-5 space-y-3">
              <p className="text-sm font-semibold">미팅 메모 수정</p>
              <Textarea value={editingMemo.memo} onChange={(e) => setEditingMemo({ ...editingMemo, memo: e.target.value })} rows={4} autoFocus className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" className="h-8 text-sm" onClick={handleSaveMemo}><Save className="h-3.5 w-3.5 mr-1" />저장</Button>
                <Button size="sm" variant="outline" className="h-8 text-sm" onClick={() => setEditingMemo(null)}>취소</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ── 미팅 추가 모달 ── */
function AddMeetingModal({ instructors, onSave, onClose }: {
  instructors: Instructor[];
  onSave: (id: string, meetingDate: string, memo: string) => Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    if (!search || search.length < 1) return [];
    const q = search.toLowerCase();
    return instructors
      .filter((i) => i.name?.toLowerCase().includes(q) || i.field?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, instructors]);

  const selected = selectedId ? instructors.find((i) => i.id === selectedId) : null;

  const handleSubmit = async () => {
    if (!selectedId || !date) { toast.error("강사와 날짜를 선택하세요."); return; }
    const meetingDate = time ? `${date} ${time}` : date;
    setSaving(true);
    await onSave(selectedId, meetingDate, memo);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <Card className="w-[440px]" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">미팅 추가</p>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>

          {/* 강사 검색 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">강사 검색</label>
            {selected ? (
              <div className="flex items-center justify-between border rounded-md px-3 py-2">
                <div>
                  <span className="text-sm font-medium">{selected.name}</span>
                  {selected.field && <span className="text-xs text-muted-foreground ml-2">{selected.field}</span>}
                </div>
                <button onClick={() => { setSelectedId(null); setSearch(""); }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  ref={inputRef}
                  placeholder="이름 또는 분야로 검색..."
                  className="h-9 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {results.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-white shadow-lg max-h-[200px] overflow-auto">
                    {results.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => { setSelectedId(i.id); setSearch(""); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between border-b last:border-b-0"
                      >
                        <span className="font-medium">{i.name}</span>
                        <span className="text-xs text-muted-foreground">{i.field} · {i.assignee}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 날짜 + 시간 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">날짜</label>
              <Input type="date" className="h-9 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="w-[120px]">
              <label className="text-xs text-muted-foreground mb-1 block">시간 (선택)</label>
              <Input type="time" className="h-9 text-sm" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">메모 (선택)</label>
            <Textarea className="text-sm" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="미팅 관련 메모..." />
          </div>

          {/* 버튼 */}
          <div className="flex gap-2">
            <Button size="sm" className="h-9 text-sm flex-1" onClick={handleSubmit} disabled={saving || !selectedId || !date}>
              {saving ? "저장 중..." : "미팅 추가"}
            </Button>
            <Button size="sm" variant="outline" className="h-9 text-sm" onClick={onClose}>취소</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
