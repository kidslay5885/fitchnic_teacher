"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_COLORS } from "@/lib/constants";
import type { Instructor, InstructorStatus, OutreachWave } from "@/lib/types";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Save, ExternalLink,
  MessageSquare, X, Search, Calendar, Clock, Plus,
} from "lucide-react";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export default function MeetingTab() {
  const { state, dispatch } = useOutreach();
  const [monthOffset, setMonthOffset] = useState(0);
  const [editingMeeting, setEditingMeeting] = useState<{ id: string; name: string; date: string; time: string; memo: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState("");
  const [wavesMap, setWavesMap] = useState<Record<string, OutreachWave[]>>({});

  // 발송 기록 로드
  const loadWaves = useCallback(async () => {
    if (state.instructors.length === 0) return;
    try {
      const ids = state.instructors.map((i) => i.id);
      const res = await fetch("/api/outreach/waves-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, OutreachWave[]> = {};
        for (const w of data) {
          if (!map[w.instructor_id]) map[w.instructor_id] = [];
          map[w.instructor_id].push(w);
        }
        setWavesMap(map);
      }
    } catch {}
  }, [state.instructors]);

  useEffect(() => { loadWaves(); }, [loadWaves]);

  // 응답을 받은 강사 (거절/제외/보류 제외) + 미팅 일정이 있는 강사
  const EXCLUDE_STATUSES = ["거절", "제외", "보류"];
  const respondedInstructors = useMemo(() => {
    return state.instructors.filter((i) => {
      // 미팅 일정이 있으면 무조건 포함
      if (i.meeting_date) return true;
      // 거절/제외/보류는 제외
      if (EXCLUDE_STATUSES.includes(i.status)) return false;
      // 응답 받은 강사 포함
      const waves = wavesMap[i.id] || [];
      return waves.some((w) => w.result === "응답");
    });
  }, [state.instructors, wavesMap]);

  // 검색 필터
  const filteredList = useMemo(() => {
    if (!search) return respondedInstructors;
    const q = search.toLowerCase();
    return respondedInstructors.filter(
      (i) => i.name?.toLowerCase().includes(q) || i.field?.toLowerCase().includes(q) || i.assignee?.toLowerCase().includes(q)
    );
  }, [respondedInstructors, search]);

  // 미팅 있는 강사 (캘린더용)
  const meetings = useMemo(() => state.instructors.filter((i) => i.meeting_date), [state.instructors]);

  // 미팅 있는/없는 분리 + 정렬
  const withMeeting = useMemo(() =>
    filteredList.filter((i) => i.meeting_date).sort((a, b) => (a.meeting_date || "").localeCompare(b.meeting_date || "")),
  [filteredList]);
  const withoutMeeting = useMemo(() => filteredList.filter((i) => !i.meeting_date), [filteredList]);

  // 캘린더 계산
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

  // 미팅 날짜 문자열에서 Date 객체 추출
  const extractDate = (md: string): Date | null => {
    // ISO: 2026-04-03
    const isoMatch = md.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
    // 4/3, 04/03 형식 (올해로 가정)
    const slashMatch = md.match(/(\d{1,2})\/(\d{1,2})/);
    if (slashMatch) return new Date(now.getFullYear(), +slashMatch[1] - 1, +slashMatch[2]);
    // 4월 3일 형식
    const korMatch = md.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (korMatch) return new Date(now.getFullYear(), +korMatch[1] - 1, +korMatch[2]);
    return null;
  };

  // 미팅일 + 1달 후 리마인드 대상 조회
  const getRemindersForDate = (date: Date | null) => {
    if (!date) return [];
    const targetIso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return meetings.filter((mt) => {
      const meetDate = extractDate(mt.meeting_date || "");
      if (!meetDate) return false;
      meetDate.setMonth(meetDate.getMonth() + 1);
      const remindIso = `${meetDate.getFullYear()}-${String(meetDate.getMonth() + 1).padStart(2, "0")}-${String(meetDate.getDate()).padStart(2, "0")}`;
      return remindIso === targetIso;
    });
  };

  const isToday = (date: Date | null) => date?.toDateString() === now.toDateString();

  const parseMeetingDate = (md: string) => {
    const dateMatch = md.match(/(\d{4}-\d{2}-\d{2})/);
    const timeMatch = md.match(/(\d{1,2}:\d{2})/);
    return { date: dateMatch?.[1] || "", time: timeMatch?.[1] || "" };
  };

  const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
  const formatMeetingDate = (md: string) => {
    const { date, time } = parseMeetingDate(md);
    if (!date) return md; // ISO 파싱 안 되면 원본 반환
    const d = new Date(date);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dow = DAY_KO[d.getDay()];
    return time ? `${m}/${day}(${dow}) ${time}` : `${m}/${day}(${dow})`;
  };

  const openEdit = (i: Instructor) => {
    const { date, time } = parseMeetingDate(i.meeting_date || "");
    setEditingMeeting({ id: i.id, name: i.name, date, time, memo: i.meeting_memo || "" });
  };

  const handleSave = async () => {
    if (!editingMeeting) return;
    const meetingDate = editingMeeting.date
      ? (editingMeeting.time ? `${editingMeeting.date} ${editingMeeting.time}` : editingMeeting.date)
      : "";
    try {
      const res = await fetch(`/api/instructors/${editingMeeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_date: meetingDate, meeting_memo: editingMeeting.memo }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      setEditingMeeting(null);
      toast.success("미팅 일정 저장 완료");
    } catch { toast.error("저장 실패"); }
  };

  const handleRemove = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/instructors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_date: "", meeting_memo: "" }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      toast.success(`${name} 미팅 삭제`);
    } catch { toast.error("삭제 실패"); }
  };

  const renderRows = (list: Instructor[], showDate: boolean) =>
    list.map((i, idx) => (
      <tr key={i.id} className={`border-b hover:bg-blue-50/40 cursor-pointer ${idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}`} onClick={() => openEdit(i)}>
        <td className="px-3 py-2 border-r border-gray-200/60 font-medium whitespace-nowrap">{i.name}</td>
        <td className="px-3 py-2 border-r border-gray-200/60">
          <Badge className={`text-[10px] px-1.5 py-0 whitespace-nowrap ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge>
        </td>
        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground truncate max-w-[120px]">{i.field}</td>
        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground whitespace-nowrap">{i.assignee}</td>
        <td className="px-3 py-2 border-r border-gray-200/60 whitespace-nowrap font-medium text-blue-700">
          {showDate ? formatMeetingDate(i.meeting_date || "") : "-"}
        </td>
        <td className="px-3 py-2 text-sm text-foreground/70 truncate max-w-[200px]" title={i.meeting_memo || ""}>
          {i.meeting_memo || ""}
        </td>
      </tr>
    ));

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 56px)" }}>
      {/* ── 좌측: 전체 미팅 목록 ── */}
      <div className="flex flex-col w-[650px] shrink-0">
        <div className="shrink-0 space-y-3 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">미팅관리</h2>
            <Button size="sm" className="h-8 text-sm" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-1" />미팅 추가
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름, 분야, 담당자..."
              className="h-8 text-sm pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>응답 {respondedInstructors.length}명</span>
            <span>·</span>
            <span>미팅 예정 {withMeeting.length}명</span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#f8f9fa] text-xs font-semibold text-muted-foreground">
              <tr className="border-b">
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">이름</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">상태</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">분야</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">담당자</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">미팅일</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">메모</th>
              </tr>
            </thead>
            <tbody>
              {/* 미팅 예정 섹션 */}
              {withMeeting.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 border-b">
                      <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />미팅 예정 ({withMeeting.length})</span>
                    </td>
                  </tr>
                  {renderRows(withMeeting, true)}
                </>
              )}
              {/* 미팅 미정 섹션 */}
              {withoutMeeting.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 border-b">
                      <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />미팅 미정 ({withoutMeeting.length})</span>
                    </td>
                  </tr>
                  {renderRows(withoutMeeting, false)}
                </>
              )}
            </tbody>
          </table>
          {filteredList.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">응답한 강사가 없습니다.</div>
          )}
        </div>
      </div>

      {/* ── 우측: 캘린더 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 월 네비 */}
        <div className="shrink-0 flex items-center gap-3 pb-3 pt-9">
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
          <span className="text-sm text-muted-foreground ml-auto">{meetings.length}건</span>
        </div>

        {/* 월간 달력 */}
        <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
          <div className="grid grid-cols-7 bg-[#f8f9fa] border-b shrink-0">
            {DAY_NAMES.map((d, i) => (
              <div key={d} className={`text-center text-xs font-semibold py-2 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted-foreground"} ${i < 6 ? "border-r border-gray-200" : ""}`}>
                {d}
              </div>
            ))}
          </div>
          <div className="flex-1 grid grid-rows-6">
            {Array.from({ length: 6 }, (_, week) => (
              <div key={week} className={`grid grid-cols-7 ${week < 5 ? "border-b" : ""}`}>
                {calendarDays.slice(week * 7, week * 7 + 7).map((cell, ci) => {
                  const dayMeetings = getMeetingsForDate(cell.date);
                  const dayReminders = getRemindersForDate(cell.date);
                  const today = isToday(cell.date);
                  return (
                    <div
                      key={ci}
                      className={`p-1 overflow-hidden ${ci < 6 ? "border-r border-gray-200" : ""} ${
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
                                  onClick={() => openEdit(mt)}
                                  className="w-full text-left rounded bg-blue-100 border border-blue-200 px-1.5 py-0.5 text-[11px] hover:bg-blue-200 transition-colors truncate"
                                >
                                  <span className="font-medium text-blue-900">{mt.name}</span>
                                  {time && <span className="text-blue-500 ml-1">{time}</span>}
                                </button>
                              );
                            })}
                            {dayReminders.map((mt) => (
                              <button
                                key={`remind-${mt.id}`}
                                onClick={() => openEdit(mt)}
                                className="w-full text-left rounded bg-orange-100 border border-orange-200 px-1.5 py-0.5 text-[11px] hover:bg-orange-200 transition-colors truncate"
                              >
                                <span className="font-medium text-orange-800">📞 {mt.name}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 미팅 수정 모달 ── */}
      {editingMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingMeeting(null)}>
          <Card className="w-[440px]" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{editingMeeting.name} 미팅 일정</p>
                <button onClick={() => setEditingMeeting(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">날짜</label>
                  <Input type="date" className="h-9 text-sm" value={editingMeeting.date} onChange={(e) => setEditingMeeting({ ...editingMeeting, date: e.target.value })} autoFocus />
                </div>
                <div className="w-[120px]">
                  <label className="text-xs text-muted-foreground mb-1 block">시간 (선택)</label>
                  <Input type="time" className="h-9 text-sm" value={editingMeeting.time} onChange={(e) => setEditingMeeting({ ...editingMeeting, time: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">메모</label>
                <Textarea className="text-sm" rows={3} value={editingMeeting.memo} onChange={(e) => setEditingMeeting({ ...editingMeeting, memo: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-9 text-sm flex-1" onClick={handleSave}><Save className="h-3.5 w-3.5 mr-1" />저장</Button>
                {state.instructors.find(i => i.id === editingMeeting.id)?.meeting_date && (
                  <Button size="sm" variant="outline" className="h-9 text-sm text-red-500 hover:text-red-600" onClick={() => { handleRemove(editingMeeting.id, editingMeeting.name); setEditingMeeting(null); }}>삭제</Button>
                )}
                <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => setEditingMeeting(null)}>취소</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {/* ── 미팅 추가 모달 ── */}
      {showAddModal && (
        <AddMeetingModal
          instructors={state.instructors}
          onSave={async (id, meetingDate, memo) => {
            try {
              const res = await fetch(`/api/instructors/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
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
