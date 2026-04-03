"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_COLORS } from "@/lib/constants";
import type { Instructor, InstructorStatus } from "@/lib/types";
import {
  ChevronLeft, ChevronRight, Search, Calendar, Clock,
  ExternalLink, Phone, Mail,
} from "lucide-react";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

const PRE_QUESTIONS = [
  { section: "기본 확인 사항", questions: [
    "핏크닉을 알고 있었는지, 이번에 연락이 닿아서 알게 되었는지",
    "'강의' 형태로 진행 여부 (온라인/오프라인, 기수제/상시판매/웨비나 등)",
  ]},
  { section: "콘텐츠 관련 확인사항", questions: [
    "수익을 내고 있는 콘텐츠",
    "현재 수익 규모",
    "유사 콘텐츠 강의와 다른점 (소구점, 고객 어필 포인트)",
    "AI를 활용하고 있는지, 어떻게 활용하는지",
  ]},
  { section: "강의 관련 확인 사항", questions: [
    "수강생 연령대, 타깃 고객",
    "강의 커리큘럼 (보유 여부, 진행 주차 등)",
    "수강생 실제 수익화 여부, 수익 발생 기간",
    "한번에 가능한 수강생 수 (우리는 한 기수당 100명, 강의금액 2~3백만원 대 감당 가능한지)",
  ]},
  { section: "위험 방어", questions: [
    "강의 진행 시 수강생 불만/항의 경험 및 해결방법",
    "콘텐츠로 수익을 내면서 플랫폼에서 알아야 할 위험요소",
  ]},
  { section: "기타", questions: [""] },
];

export default function MeetingReportPage() {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [detailInstructor, setDetailInstructor] = useState<Instructor | null>(null);
  const [detailTab, setDetailTab] = useState<"before" | "questions" | "after">("before");

  const getDefaultTab = (meetingDate: string | undefined): "before" | "questions" | "after" => {
    if (!meetingDate) return "before";
    const match = meetingDate.match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) return "before";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(match[1]); d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return "questions";
    if (d < today) return "after";
    return "before";
  };

  // 데이터 로드
  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/instructors");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.data || []);
        setInstructors(list);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 미팅 관련 강사
  const EXCLUDE_STATUSES = ["거절", "제외", "보류"];
  const meetingInstructors = useMemo(() => {
    return instructors.filter((i) => {
      if (i.meeting_date || i.meeting_confirmed) return true;
      if (EXCLUDE_STATUSES.includes(i.status)) return false;
      return i.has_response;
    });
  }, [instructors]);

  const filteredList = useMemo(() => {
    if (!search) return meetingInstructors;
    const q = search.toLowerCase();
    return meetingInstructors.filter(
      (i) => i.name?.toLowerCase().includes(q) || i.field?.toLowerCase().includes(q) || i.assignee?.toLowerCase().includes(q)
    );
  }, [meetingInstructors, search]);

  const isConfirmed = (i: Instructor) => i.meeting_confirmed || !!i.meeting_date;
  const confirmedWithDate = useMemo(() =>
    filteredList.filter((i) => isConfirmed(i) && i.meeting_date).sort((a, b) => (a.meeting_date || "").localeCompare(b.meeting_date || "")),
  [filteredList]);
  const confirmedNoDate = useMemo(() => filteredList.filter((i) => i.meeting_confirmed && !i.meeting_date), [filteredList]);
  const notConfirmed = useMemo(() => filteredList.filter((i) => !isConfirmed(i)), [filteredList]);

  // 캘린더
  const now = new Date();
  const meetings = useMemo(() => instructors.filter((i) => i.meeting_date), [instructors]);
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

  const extractDate = (md: string): Date | null => {
    const isoMatch = md.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
    const slashMatch = md.match(/(\d{1,2})\/(\d{1,2})/);
    if (slashMatch) return new Date(now.getFullYear(), +slashMatch[1] - 1, +slashMatch[2]);
    const korMatch = md.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (korMatch) return new Date(now.getFullYear(), +korMatch[1] - 1, +korMatch[2]);
    return null;
  };

  const calcRemindDate = (meetingDate: string) => {
    const d = extractDate(meetingDate);
    if (!d) return "";
    d.setMonth(d.getMonth() + 1);
    const day = d.getDay();
    if (day === 6) d.setDate(d.getDate() - 1);
    if (day === 0) d.setDate(d.getDate() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

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

  const getRemindersForDate = (date: Date | null) => {
    if (!date) return [];
    const targetIso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return meetings.filter((mt) => {
      if (mt.remind_date) return mt.remind_date === targetIso;
      return calcRemindDate(mt.meeting_date || "") === targetIso;
    });
  };

  const isToday = (date: Date | null) => date?.toDateString() === now.toDateString();

  const formatMeetingDate = (md: string) => {
    const dateMatch = md.match(/(\d{4}-\d{2}-\d{2})/);
    const timeMatch = md.match(/(\d{1,2}:\d{2})/);
    const date = dateMatch?.[1] || "";
    const time = timeMatch?.[1] || "";
    if (!date) return md;
    const d = new Date(date);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dow = DAY_KO[d.getDay()];
    return time ? `${m}/${day}(${dow}) ${time}` : `${m}/${day}(${dow})`;
  };

  const parsePostInfo = (raw: string) => {
    try { const p = JSON.parse(raw); return { special: p.special || "", positive: p.positive || "", negative: p.negative || "" }; }
    catch { return { special: raw || "", positive: "", negative: "" }; }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-3">
        <h1 className="text-lg font-bold">미팅관리 현황</h1>
        <p className="text-xs text-muted-foreground">보고용 · 읽기 전용</p>
      </header>

      <div className="flex gap-4 p-6" style={{ height: "calc(100vh - 70px)" }}>
        {/* ── 좌측: 강사 목록 ── */}
        <div className="flex flex-col w-[800px] shrink-0">
          <div className="shrink-0 space-y-3 pb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="이름, 분야, 담당자..." className="h-8 text-sm pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>전체 {meetingInstructors.length}명</span>
              <span>·</span>
              <span>확정 {confirmedWithDate.length + confirmedNoDate.length}명</span>
              <span>·</span>
              <span>예정 {notConfirmed.length}명</span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#f8f9fa] text-xs font-semibold text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left px-3 py-2 border-r border-gray-200">이름</th>
                  <th className="text-left px-3 py-2 border-r border-gray-200">상태</th>
                  <th className="text-left px-3 py-2 border-r border-gray-200">분야</th>
                  <th className="text-left px-3 py-2 border-r border-gray-200">담당자</th>
                  <th className="text-left px-3 py-2 border-r border-gray-200">미팅일</th>
                  <th className="text-center px-2 py-2 border-r border-gray-200">방식</th>
                  <th className="text-left px-3 py-2">메모</th>
                </tr>
              </thead>
              <tbody>
                {confirmedWithDate.length > 0 && (
                  <>
                    <tr><td colSpan={7} className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 border-b">
                      <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />미팅 확정 ({confirmedWithDate.length})</span>
                    </td></tr>
                    {confirmedWithDate.map((i, idx) => (
                      <tr key={i.id} className={`border-b cursor-pointer hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}`} onClick={() => { setDetailInstructor(i); setDetailTab(getDefaultTab(i.meeting_date)); }}>
                        <td className="px-3 py-2 border-r border-gray-200/60 font-medium whitespace-nowrap">{i.name}</td>
                        <td className="px-3 py-2 border-r border-gray-200/60"><Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge></td>
                        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground truncate max-w-[120px]">{i.field}</td>
                        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground">{i.contact_assignee || i.assignee}</td>
                        <td className="px-3 py-2 border-r border-gray-200/60 font-medium text-blue-700 whitespace-nowrap">{formatMeetingDate(i.meeting_date || "")}</td>
                        <td className="px-2 py-2 border-r border-gray-200/60 text-center whitespace-nowrap">
                          {i.meeting_type ? (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${i.meeting_type === "줌미팅" ? "text-blue-600 border-blue-300 bg-blue-50" : "text-orange-600 border-orange-300 bg-orange-50"}`}>{i.meeting_type}</Badge>
                          ) : <span className="text-muted-foreground text-xs">-</span>}
                        </td>
                        <td className="px-3 py-2 text-foreground/70 truncate max-w-[200px]">{i.meeting_memo || ""}</td>
                      </tr>
                    ))}
                  </>
                )}
                {confirmedNoDate.length > 0 && (
                  <>
                    <tr><td colSpan={7} className="bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 border-b">
                      <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />미팅 확정 · 날짜 미정 ({confirmedNoDate.length})</span>
                    </td></tr>
                    {confirmedNoDate.map((i, idx) => (
                      <tr key={i.id} className={`border-b cursor-pointer hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}`} onClick={() => { setDetailInstructor(i); setDetailTab(getDefaultTab(i.meeting_date)); }}>
                        <td className="px-3 py-2 border-r border-gray-200/60 font-medium whitespace-nowrap">{i.name}</td>
                        <td className="px-3 py-2 border-r border-gray-200/60"><Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge></td>
                        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground truncate max-w-[120px]">{i.field}</td>
                        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground">{i.contact_assignee || i.assignee}</td>
                        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground">-</td>
                        <td className="px-2 py-2 border-r border-gray-200/60 text-center whitespace-nowrap">
                          {i.meeting_type ? (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${i.meeting_type === "줌미팅" ? "text-blue-600 border-blue-300 bg-blue-50" : "text-orange-600 border-orange-300 bg-orange-50"}`}>{i.meeting_type}</Badge>
                          ) : <span className="text-muted-foreground text-xs">-</span>}
                        </td>
                        <td className="px-3 py-2 text-foreground/70 truncate max-w-[200px]">{i.meeting_memo || ""}</td>
                      </tr>
                    ))}
                  </>
                )}
                {notConfirmed.length > 0 && (
                  <>
                    <tr><td colSpan={7} className="bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 border-b">
                      <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />미팅 예정 ({notConfirmed.length})</span>
                    </td></tr>
                    {notConfirmed.map((i, idx) => (
                      <tr key={i.id} className={`border-b cursor-pointer hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}`} onClick={() => { setDetailInstructor(i); setDetailTab(getDefaultTab(i.meeting_date)); }}>
                        <td className="px-3 py-2 border-r border-gray-200/60 font-medium whitespace-nowrap">{i.name}</td>
                        <td className="px-3 py-2 border-r border-gray-200/60"><Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge></td>
                        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground truncate max-w-[120px]">{i.field}</td>
                        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground">{i.contact_assignee || i.assignee}</td>
                        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground">-</td>
                        <td className="px-2 py-2 border-r border-gray-200/60 text-center whitespace-nowrap">
                          {i.meeting_type ? (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${i.meeting_type === "줌미팅" ? "text-blue-600 border-blue-300 bg-blue-50" : "text-orange-600 border-orange-300 bg-orange-50"}`}>{i.meeting_type}</Badge>
                          ) : <span className="text-muted-foreground text-xs">-</span>}
                        </td>
                        <td className="px-3 py-2 text-foreground/70 truncate max-w-[200px]">{i.meeting_memo || ""}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
            {filteredList.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">데이터가 없습니다.</div>
            )}
          </div>
        </div>

        {/* ── 우측: 캘린더 ── */}
        <div className="flex-1 flex flex-col min-w-0">
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
            <span className="text-sm text-muted-foreground ml-auto">{meetings.length}건</span>
          </div>

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
                      <div key={ci} className={`p-1 overflow-hidden ${ci < 6 ? "border-r border-gray-200" : ""} ${!cell.inMonth ? "bg-gray-50/50" : today ? "bg-primary/5" : "bg-white"}`}>
                        {cell.inMonth && (
                          <>
                            <div className={`text-xs mb-0.5 ${today ? "text-primary font-bold" : ci === 0 ? "text-red-400" : ci === 6 ? "text-blue-400" : "text-muted-foreground"}`}>
                              {cell.day}
                            </div>
                            <div className="space-y-0.5">
                              {dayMeetings.map((mt) => {
                                const time = mt.meeting_date?.match(/\d{1,2}:\d{2}/)?.[0];
                                return (
                                  <button key={mt.id} onClick={() => { setDetailInstructor(mt); setDetailTab(getDefaultTab(mt.meeting_date)); }}
                                    className={`w-full text-left rounded px-1.5 py-0.5 text-[11px] transition-colors truncate border ${
                                      mt.meeting_type === "대면미팅"
                                        ? "bg-orange-100 border-orange-200 hover:bg-orange-200"
                                        : mt.meeting_type === "줌미팅"
                                        ? "bg-blue-100 border-blue-200 hover:bg-blue-200"
                                        : "bg-gray-100 border-gray-200 hover:bg-gray-200"
                                    }`}
                                    title={`${mt.name} ${time || ""} ${mt.meeting_type || ""}`}
                                  >
                                    <span className={`font-medium ${
                                      mt.meeting_type === "대면미팅" ? "text-orange-900" : mt.meeting_type === "줌미팅" ? "text-blue-900" : "text-gray-900"
                                    }`}>{mt.name}</span>
                                    {time && <span className={`ml-1 ${
                                      mt.meeting_type === "대면미팅" ? "text-orange-500" : mt.meeting_type === "줌미팅" ? "text-blue-500" : "text-gray-500"
                                    }`}>{time}</span>}
                                  </button>
                                );
                              })}
                              {dayReminders.map((mt) => (
                                <div key={`remind-${mt.id}`}
                                  className={`w-full text-left rounded px-1.5 py-0.5 text-[11px] truncate border ${
                                    mt.remind_done ? "bg-green-50 border-green-200" : "bg-orange-100 border-orange-200"
                                  }`}>
                                  <span className={`font-medium ${mt.remind_done ? "text-green-700 line-through" : "text-orange-800"}`}>
                                    {mt.remind_done ? "✓" : "📞"} {mt.name}
                                  </span>
                                </div>
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
      </div>

      {/* ── 강사 상세 모달 (읽기 전용) ── */}
      {detailInstructor && (() => {
        const inst = detailInstructor;
        const igUrl = inst.instagram ? (inst.instagram.startsWith("http") ? inst.instagram : `https://instagram.com/${inst.instagram}`) : "";
        const post = parsePostInfo(inst.post_info || "");
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailInstructor(null)}>
            <div className="bg-white rounded-lg shadow-lg w-[900px] max-h-[85vh] overflow-hidden flex flex-col p-6" onClick={(e) => e.stopPropagation()}>
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold">{inst.name}</p>
                  <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[inst.status as InstructorStatus] || ""}`}>{inst.status}</Badge>
                  {inst.meeting_confirmed && <span className="text-xs text-blue-600 font-medium">미팅 확정</span>}
                </div>
                <button onClick={() => setDetailInstructor(null)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
              </div>

              <div className="flex gap-6 flex-1 min-h-0">
                {/* 왼쪽: 기본 정보 */}
                <div className="w-[280px] shrink-0 space-y-4 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm border rounded-lg p-3 bg-gray-50/50">
                    <div><span className="text-muted-foreground">분야</span> <span className="ml-1 font-medium">{inst.field || "-"}</span></div>
                    <div><span className="text-muted-foreground">담당자</span> <span className="ml-1 font-medium">{inst.assignee || "-"}</span></div>
                    <div><span className="text-muted-foreground">강의</span> <span className="ml-1 font-medium">{inst.has_lecture_history || "-"}</span></div>
                    <div><span className="text-muted-foreground">플랫폼</span> <span className="ml-1 font-medium">{inst.lecture_platform || "-"}</span></div>
                  </div>

                  {/* 연락처 */}
                  <div className="border rounded-lg p-3 space-y-2 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground">연락처</p>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {inst.phone ? <a href={`tel:${inst.phone}`} className="text-blue-600 hover:underline">{inst.phone}</a> : <span className="text-muted-foreground">-</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {inst.email ? <a href={`mailto:${inst.email}`} className="text-blue-600 hover:underline">{inst.email}</a> : <span className="text-muted-foreground">-</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      {inst.youtube ? <a href={inst.youtube} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">유튜브</a> : <span className="text-muted-foreground">유튜브 -</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      {igUrl ? <a href={igUrl} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">인스타그램</a> : <span className="text-muted-foreground">인스타 -</span>}
                    </div>
                  </div>

                  {/* 미팅 정보 */}
                  <div className="border rounded-lg p-3 space-y-1.5 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground">미팅 정보</p>
                    <div><span className="text-muted-foreground">미팅일</span> <span className="ml-2 font-medium">{inst.meeting_date ? formatMeetingDate(inst.meeting_date) : "-"}</span></div>
                    <div><span className="text-muted-foreground">리마인드</span> <span className="ml-2 font-medium">{inst.remind_date || "-"}</span>
                      {inst.remind_done && <span className="ml-1 text-green-600 text-xs">✓ 완료</span>}
                    </div>
                    {inst.meeting_memo && <div><span className="text-muted-foreground">메모</span> <span className="ml-2">{inst.meeting_memo}</span></div>}
                  </div>
                </div>

                {/* 오른쪽: 탭 전환 영역 (읽기 전용) */}
                <div className="flex-1 min-w-0 flex flex-col">
                  {/* 탭 헤더 */}
                  <div className="flex border-b mb-3">
                    {([
                      { id: "before" as const, label: "미팅 전" },
                      { id: "questions" as const, label: "미팅 질문" },
                      { id: "after" as const, label: "미팅 후" },
                    ]).map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setDetailTab(tab.id)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          detailTab === tab.id
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* 탭 내용 */}
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {detailTab === "before" && (
                      <div className="border rounded-md px-3 py-2 text-sm bg-gray-50 whitespace-pre-wrap h-full overflow-y-auto">
                        {inst.pre_info || "입력된 사전 정보가 없습니다."}
                      </div>
                    )}

                    {detailTab === "questions" && (() => {
                      let preQ: Record<string, string> = {};
                      try { if (inst.pre_questions) preQ = JSON.parse(inst.pre_questions); } catch {}
                      return (
                        <div className="space-y-4">
                          {PRE_QUESTIONS.map((section, si) => (
                            <div key={si} className="space-y-2">
                              <p className="text-sm font-semibold border-b pb-1">{si + 1}. {section.section}</p>
                              {section.questions.map((q, qi) => {
                                const answer = preQ[`${si}_${qi}`] || "";
                                return (
                                  <div key={qi}>
                                    {q && <p className="text-xs text-muted-foreground mb-1">{q}</p>}
                                    <div className="border rounded-md px-3 py-2 text-sm bg-gray-50 whitespace-pre-wrap min-h-[36px]">
                                      {answer || "-"}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {detailTab === "after" && (
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">특이사항</p>
                          <div className="border rounded-md px-3 py-2 text-sm bg-gray-50 whitespace-pre-wrap min-h-[80px]">{post.special || "-"}</div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">긍정적인 점</p>
                          <div className="border rounded-md px-3 py-2 text-sm bg-gray-50 whitespace-pre-wrap min-h-[60px]">{post.positive || "-"}</div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">부정적인 점</p>
                          <div className="border rounded-md px-3 py-2 text-sm bg-gray-50 whitespace-pre-wrap min-h-[60px]">{post.negative || "-"}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
