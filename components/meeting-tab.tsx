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
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Save, ExternalLink,
  MessageSquare, X, Search, Calendar, Clock, Plus, ArrowUpRight,
} from "lucide-react";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// 사전 질문 구조
const PRE_QUESTIONS = [
  {
    section: "기본 확인 사항",
    questions: [
      "핏크닉을 알고 있었는지, 이번에 연락이 닿아서 알게 되었는지",
      "'강의' 형태로 진행 여부 (온라인/오프라인, 기수제/상시판매/웨비나 등)",
    ],
  },
  {
    section: "콘텐츠 관련 확인사항",
    questions: [
      "수익을 내고 있는 콘텐츠",
      "현재 수익 규모",
      "유사 콘텐츠 강의와 다른점 (소구점, 고객 어필 포인트)",
      "AI를 활용하고 있는지, 어떻게 활용하는지",
    ],
  },
  {
    section: "강의 관련 확인 사항",
    questions: [
      "수강생 연령대, 타깃 고객",
      "강의 커리큘럼 (보유 여부, 진행 주차 등)",
      "수강생 실제 수익화 여부, 수익 발생 기간",
      "한번에 가능한 수강생 수 (우리는 한 기수당 100명, 강의금액 2~3백만원 대 감당 가능한지)",
    ],
  },
  {
    section: "위험 방어",
    questions: [
      "강의 진행 시 수강생 불만/항의 경험 및 해결방법",
      "콘텐츠로 수익을 내면서 플랫폼에서 알아야 할 위험요소",
    ],
  },
  {
    section: "기타",
    questions: [
      "",
    ],
  },
];

export default function MeetingTab() {
  const { state, dispatch } = useOutreach();
  const [monthOffset, setMonthOffset] = useState(0);
  const [editingMeeting, setEditingMeeting] = useState<{
    instructor: Instructor; date: string; time: string; memo: string;
    confirmed: boolean; remindDate: string; meetingType: string;
    postSpecial: string; postPositive: string; postNegative: string;
    modalTab: "before" | "questions" | "after";
    preQuestions: Record<string, string>;
  } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [remindModal, setRemindModal] = useState<Instructor | null>(null);
  const [remindDate, setRemindDate] = useState("");
  const [remindDone, setRemindDone] = useState(false);
  const [search, setSearch] = useState("");

  // 응답을 받은 강사 (거절/제외/보류 제외) + 미팅 관련 강사
  const EXCLUDE_STATUSES = ["거절", "제외", "보류"];
  const respondedInstructors = useMemo(() => {
    return state.instructors.filter((i) => {
      if (i.meeting_date || i.meeting_confirmed) return true;
      if (EXCLUDE_STATUSES.includes(i.status)) return false;
      return i.has_response;
    });
  }, [state.instructors]);

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

  // 3섹션 분리: 확정+날짜 / 확정+날짜미정 / 미확정
  // 날짜가 있으면 확정으로 간주
  const isConfirmed = (i: Instructor) => i.meeting_confirmed || !!i.meeting_date;
  const confirmedWithDate = useMemo(() =>
    filteredList.filter((i) => isConfirmed(i) && i.meeting_date).sort((a, b) => (a.meeting_date || "").localeCompare(b.meeting_date || "")),
  [filteredList]);
  const confirmedNoDate = useMemo(() =>
    filteredList.filter((i) => i.meeting_confirmed && !i.meeting_date),
  [filteredList]);
  const notConfirmed = useMemo(() =>
    filteredList.filter((i) => !isConfirmed(i)),
  [filteredList]);

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

  // 리마인드 대상 조회: remind_date가 있으면 그걸 사용, 없으면 미팅일+1달(주말→금)
  const getRemindersForDate = (date: Date | null) => {
    if (!date) return [];
    const targetIso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return meetings.filter((mt) => {
      if (mt.remind_date) return mt.remind_date === targetIso;
      return calcRemindDate(mt.meeting_date || "") === targetIso;
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

  // 리마인드 기본 날짜 계산: 1달 후, 주말이면 금요일로
  const calcRemindDate = (meetingDate: string) => {
    const d = extractDate(meetingDate);
    if (!d) return "";
    d.setMonth(d.getMonth() + 1);
    const day = d.getDay();
    if (day === 6) d.setDate(d.getDate() - 1); // 토 → 금
    if (day === 0) d.setDate(d.getDate() - 2); // 일 → 금
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const parsePostInfo = (raw: string) => {
    try { const p = JSON.parse(raw); return { special: p.special || "", positive: p.positive || "", negative: p.negative || "" }; }
    catch { return { special: raw || "", positive: "", negative: "" }; }
  };

  const openEdit = (i: Instructor) => {
    const { date, time } = parseMeetingDate(i.meeting_date || "");
    const post = parsePostInfo(i.post_info || "");
    const remindDate = i.remind_date || (i.meeting_date ? calcRemindDate(i.meeting_date) : "");
    let preQ: Record<string, string> = {};
    try { if (i.pre_questions) preQ = JSON.parse(i.pre_questions); } catch {}
    // 미팅 날짜 기준 기본 탭 결정
    let defaultTab: "before" | "questions" | "after" = "before";
    if (date) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const meetDate = new Date(date); meetDate.setHours(0, 0, 0, 0);
      if (meetDate.getTime() === today.getTime()) defaultTab = "questions";
      else if (meetDate < today) defaultTab = "after";
    }
    setEditingMeeting({
      instructor: i, date, time, memo: i.meeting_memo || "",
      confirmed: !!i.meeting_confirmed, remindDate, meetingType: i.meeting_type || "",
      postSpecial: post.special, postPositive: post.positive, postNegative: post.negative,
      modalTab: defaultTab, preQuestions: preQ,
    });
  };

  const handleSave = async () => {
    if (!editingMeeting) return;
    const meetingDate = editingMeeting.date
      ? (editingMeeting.time ? `${editingMeeting.date} ${editingMeeting.time}` : editingMeeting.date)
      : "";
    try {
      const res = await fetch(`/api/instructors/${editingMeeting.instructor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_date: meetingDate, meeting_memo: editingMeeting.memo,
          meeting_confirmed: editingMeeting.confirmed,
          remind_date: editingMeeting.remindDate || "",
          meeting_type: editingMeeting.meetingType || "",
          pre_questions: JSON.stringify(editingMeeting.preQuestions),
          post_info: JSON.stringify({ special: editingMeeting.postSpecial, positive: editingMeeting.postPositive, negative: editingMeeting.postNegative }),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      setEditingMeeting(null);
      toast.success("미팅 정보 저장 완료");
    } catch { toast.error("저장 실패"); }
  };

  const handleRemove = async () => {
    if (!editingMeeting) return;
    try {
      const res = await fetch(`/api/instructors/${editingMeeting.instructor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_date: "", meeting_memo: "", meeting_confirmed: false, post_info: "" }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      setEditingMeeting(null);
      toast.success(`${editingMeeting.instructor.name} 미팅 삭제`);
    } catch { toast.error("삭제 실패"); }
  };

  // 미팅일 지났는데 사후 정보 없는 강사
  const hasPostInfo = (raw: string) => {
    try { const p = JSON.parse(raw); return !!(p.special || p.positive || p.negative); }
    catch { return !!raw; }
  };
  const needsPostInfo = (i: Instructor) => {
    if (!i.meeting_date || hasPostInfo(i.post_info)) return false;
    const d = extractDate(i.meeting_date);
    return d ? d.getTime() < now.getTime() : false;
  };

  const renderRows = (list: Instructor[], showDate: boolean) =>
    list.map((i, idx) => (
      <tr key={i.id} className={`border-b hover:bg-blue-50/40 cursor-pointer ${idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}`} onClick={() => openEdit(i)}>
        <td className="px-3 py-2 border-r border-gray-200/60 font-medium whitespace-nowrap">
          <span className="flex items-center gap-1">
            {i.name}
            {needsPostInfo(i) && <span className="shrink-0 h-2 w-2 rounded-full bg-red-500" title="사후 정보 미입력" />}
          </span>
        </td>
        <td className="px-3 py-2 border-r border-gray-200/60">
          <Badge className={`text-[10px] px-1.5 py-0 whitespace-nowrap ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge>
        </td>
        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground truncate max-w-[120px]">{i.field}</td>
        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground whitespace-nowrap">{i.assignee}</td>
        <td className="px-3 py-2 border-r border-gray-200/60 whitespace-nowrap font-medium text-blue-700">
          {showDate ? formatMeetingDate(i.meeting_date || "") : "-"}
        </td>
        <td className="px-2 py-2 border-r border-gray-200/60 text-center whitespace-nowrap">
          {i.meeting_type ? (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${i.meeting_type === "줌미팅" ? "text-blue-600 border-blue-300 bg-blue-50" : "text-orange-600 border-orange-300 bg-orange-50"}`}>{i.meeting_type}</Badge>
          ) : <span className="text-muted-foreground text-xs">-</span>}
        </td>
        <td className="px-3 py-2 border-r border-gray-200/60 text-sm text-foreground/70 truncate max-w-[200px]" title={i.meeting_memo || ""}>
          {i.meeting_memo || ""}
        </td>
      </tr>
    ));

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 56px)" }}>
      {/* ── 좌측: 전체 미팅 목록 ── */}
      <div className="flex flex-col w-[750px] shrink-0">
        <div className="shrink-0 space-y-3 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">미팅관리</h2>
            <div className="flex items-center gap-2">
              <Link href="/meeting" target="_blank">
                <Button size="sm" variant="outline" className="h-8 text-sm">
                  <ArrowUpRight className="h-4 w-4 mr-1" />미팅 페이지
                </Button>
              </Link>
              <Button size="sm" className="h-8 text-sm" onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-1" />미팅 추가
              </Button>
            </div>
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
            <span>확정 {confirmedWithDate.length + confirmedNoDate.length}명</span>
            <span>·</span>
            <span>예정 {notConfirmed.length}명</span>
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
                <th className="text-center px-2 py-2 border-r border-gray-200 whitespace-nowrap">방식</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">메모</th>
              </tr>
            </thead>
            <tbody>
              {/* 미팅 확정 (날짜 O) */}
              {confirmedWithDate.length > 0 && (
                <>
                  <tr>
                    <td colSpan={7} className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 border-b">
                      <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />미팅 확정 ({confirmedWithDate.length})</span>
                    </td>
                  </tr>
                  {renderRows(confirmedWithDate, true)}
                </>
              )}
              {/* 미팅 확정 (날짜 미정) */}
              {confirmedNoDate.length > 0 && (
                <>
                  <tr>
                    <td colSpan={7} className="bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 border-b">
                      <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />미팅 확정 · 날짜 미정 ({confirmedNoDate.length})</span>
                    </td>
                  </tr>
                  {renderRows(confirmedNoDate, false)}
                </>
              )}
              {/* 미팅 예정 (미확정) */}
              {notConfirmed.length > 0 && (
                <>
                  <tr>
                    <td colSpan={7} className="bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 border-b">
                      <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />미팅 예정 ({notConfirmed.length})</span>
                    </td>
                  </tr>
                  {renderRows(notConfirmed, false)}
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
                                  {mt.meeting_type && <span className="text-blue-400 ml-1">({mt.meeting_type === "줌미팅" ? "줌" : "대면"})</span>}
                                </button>
                              );
                            })}
                            {dayReminders.map((mt) => (
                              <button
                                key={`remind-${mt.id}`}
                                onClick={() => { setRemindModal(mt); setRemindDate(mt.remind_date || calcRemindDate(mt.meeting_date || "")); setRemindDone(!!mt.remind_done); }}
                                className={`w-full text-left rounded px-1.5 py-0.5 text-[11px] transition-colors truncate border ${
                                  mt.remind_done
                                    ? "bg-green-50 border-green-200 hover:bg-green-100"
                                    : "bg-orange-100 border-orange-200 hover:bg-orange-200"
                                }`}
                              >
                                <span className={`font-medium ${mt.remind_done ? "text-green-700 line-through" : "text-orange-800"}`}>
                                  {mt.remind_done ? "✓" : "📞"} {mt.name}
                                </span>
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

      {/* ── 미팅 상세 모달 ── */}
      {editingMeeting && (() => {
        const inst = editingMeeting.instructor;
        const igUrl = inst.instagram ? (inst.instagram.startsWith("http") ? inst.instagram : `https://instagram.com/${inst.instagram}`) : "";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <Card className="w-[1100px] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <CardContent className="p-6 flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold">{inst.name}</p>
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[inst.status as InstructorStatus] || ""}`}>{inst.status}</Badge>
                  </div>
                  <button onClick={() => setEditingMeeting(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>

                <div className="flex gap-5 flex-1 min-h-0">
                  {/* ── 왼쪽: 기본 정보 + 미팅 설정 ── */}
                  <div className="w-[320px] shrink-0 space-y-4 overflow-y-auto">
                    {/* 강사 기본 정보 */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm border rounded-lg p-3 bg-gray-50/50">
                      <div><span className="text-muted-foreground">분야</span> <span className="ml-1 font-medium">{inst.field || "-"}</span></div>
                      <div><span className="text-muted-foreground">담당자</span> <span className="ml-1 font-medium">{inst.assignee || "-"}</span></div>
                      <div><span className="text-muted-foreground">강의</span> <span className="ml-1 font-medium">{inst.has_lecture_history || "-"}</span></div>
                      <div><span className="text-muted-foreground">플랫폼</span> <span className="ml-1 font-medium">{inst.lecture_platform || "-"}</span></div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">유튜브</span>
                        {inst.youtube ? <a href={inst.youtube} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-600 hover:underline flex items-center gap-0.5">링크<ExternalLink className="h-3 w-3" /></a> : <span className="ml-1">-</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">인스타</span>
                        {igUrl ? <a href={igUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-pink-600 hover:underline flex items-center gap-0.5">링크<ExternalLink className="h-3 w-3" /></a> : <span className="ml-1">-</span>}
                      </div>
                    </div>

                    {/* 미팅 확정 */}
                    <div
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                        editingMeeting.confirmed ? "bg-blue-50 border-blue-300" : "bg-gray-50 border-gray-200"
                      }`}
                      onClick={() => setEditingMeeting({ ...editingMeeting, confirmed: !editingMeeting.confirmed })}
                    >
                      <input type="checkbox" className="h-4 w-4 rounded accent-primary pointer-events-none" checked={editingMeeting.confirmed} readOnly />
                      <span className={`text-sm font-medium ${editingMeeting.confirmed ? "text-blue-800" : "text-gray-500"}`}>미팅 확정</span>
                    </div>

                    {/* 날짜 / 시간 */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground mb-1 block">날짜</label>
                        <Input type="date" className="h-9 text-sm" value={editingMeeting.date} onChange={(e) => {
                          const newDate = e.target.value;
                          setEditingMeeting({ ...editingMeeting, date: newDate, remindDate: newDate ? calcRemindDate(newDate) : "" });
                        }} />
                      </div>
                      <div className="w-[140px]">
                        <label className="text-xs text-muted-foreground mb-1 block">시간 (선택)</label>
                        <Input type="time" className="h-9 text-sm" value={editingMeeting.time} onChange={(e) => setEditingMeeting({ ...editingMeeting, time: e.target.value })} />
                      </div>
                    </div>

                    {/* 리마인드 날짜 */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">리마인드 날짜</label>
                      <div className="flex gap-2 items-center">
                        <Input
                          type="date" className="h-9 text-sm flex-1"
                          value={editingMeeting.remindDate}
                          onChange={(e) => setEditingMeeting({ ...editingMeeting, remindDate: e.target.value })}
                        />
                        {editingMeeting.date && (
                          <button
                            className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                            onClick={() => setEditingMeeting({ ...editingMeeting, remindDate: calcRemindDate(editingMeeting.date) })}
                          >
                            자동 계산
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 미팅 방식 */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">미팅 방식</label>
                      <div className="flex gap-2">
                        {(["줌미팅", "대면미팅"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setEditingMeeting({ ...editingMeeting, meetingType: editingMeeting.meetingType === t ? "" : t })}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                              editingMeeting.meetingType === t
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white text-muted-foreground border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 메모 */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">메모</label>
                      <Textarea className="text-sm" rows={4} value={editingMeeting.memo} onChange={(e) => setEditingMeeting({ ...editingMeeting, memo: e.target.value })} />
                    </div>
                  </div>

                  {/* ── 오른쪽: 탭 전환 영역 ── */}
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
                          onClick={() => setEditingMeeting({ ...editingMeeting, modalTab: tab.id })}
                          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            editingMeeting.modalTab === tab.id
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
                      {/* 미팅 전 */}
                      {editingMeeting.modalTab === "before" && (
                        <div className="border rounded-md px-3 py-2 text-sm bg-gray-50 text-foreground/80 whitespace-pre-wrap h-full overflow-y-auto">
                          {inst.pre_info || "입력된 사전 정보가 없습니다."}
                        </div>
                      )}

                      {/* 미팅 질문 */}
                      {editingMeeting.modalTab === "questions" && (
                        <div className="space-y-5">
                          {PRE_QUESTIONS.map((section, si) => (
                            <div key={si} className="space-y-2.5">
                              <p className="text-sm font-semibold text-foreground border-b pb-1">
                                {si + 1}. {section.section}
                              </p>
                              {section.questions.map((q, qi) => {
                                const key = `${si}_${qi}`;
                                return (
                                  <div key={qi}>
                                    {q && <label className="text-xs text-muted-foreground mb-1 block">{q}</label>}
                                    <Textarea
                                      className="text-sm"
                                      rows={2}
                                      value={editingMeeting.preQuestions[key] || ""}
                                      onChange={(e) => setEditingMeeting({
                                        ...editingMeeting,
                                        preQuestions: { ...editingMeeting.preQuestions, [key]: e.target.value },
                                      })}
                                      placeholder="답변 입력..."
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 미팅 후 */}
                      {editingMeeting.modalTab === "after" && (
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">특이사항</label>
                            <Textarea
                              className="text-sm !min-h-[200px]"
                              placeholder="미팅 중 특이사항..."
                              value={editingMeeting.postSpecial}
                              onChange={(e) => setEditingMeeting({ ...editingMeeting, postSpecial: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">긍정적인 점</label>
                            <Textarea
                              className="text-sm"
                              rows={4}
                              placeholder="긍정적인 점..."
                              value={editingMeeting.postPositive}
                              onChange={(e) => setEditingMeeting({ ...editingMeeting, postPositive: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">부정적인 점</label>
                            <Textarea
                              className="text-sm"
                              rows={4}
                              placeholder="부정적인 점..."
                              value={editingMeeting.postNegative}
                              onChange={(e) => setEditingMeeting({ ...editingMeeting, postNegative: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 버튼 */}
                <div className="flex gap-2 mt-5 shrink-0">
                  <Button size="sm" className="h-9 text-sm flex-1" onClick={handleSave}><Save className="h-3.5 w-3.5 mr-1" />저장</Button>
                  {(inst.meeting_date || inst.meeting_confirmed) && (
                    <Button size="sm" variant="outline" className="h-9 text-sm text-red-500 hover:text-red-600" onClick={handleRemove}>삭제</Button>
                  )}
                  <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => setEditingMeeting(null)}>취소</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}
      {/* ── 리마인드 모달 ── */}
      {remindModal && (() => {
        const inst = remindModal;
        const igUrl = inst.instagram ? (inst.instagram.startsWith("http") ? inst.instagram : `https://instagram.com/${inst.instagram}`) : "";
        const handleRemindSave = async () => {
          try {
            const res = await fetch(`/api/instructors/${inst.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ remind_date: remindDate, remind_done: remindDone }),
            });
            if (!res.ok) throw new Error("Failed");
            dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
            setRemindModal(null);
            toast.success("리마인드 날짜 저장 완료");
          } catch { toast.error("저장 실패"); }
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRemindModal(null)}>
            <Card className="w-[440px]" onClick={(e) => e.stopPropagation()}>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-600">📞</span>
                    <p className="text-base font-semibold">{inst.name} 리마인드</p>
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[inst.status as InstructorStatus] || ""}`}>{inst.status}</Badge>
                  </div>
                  <button onClick={() => setRemindModal(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>

                {/* 연락처 정보 */}
                <div className="border rounded-lg p-4 space-y-2.5 bg-gray-50/50">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">연락처</p>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-16 shrink-0">전화</span>
                    {inst.phone ? <a href={`tel:${inst.phone}`} className="text-blue-600 hover:underline font-medium">{inst.phone}</a> : <span className="text-muted-foreground">-</span>}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-16 shrink-0">이메일</span>
                    {inst.email ? <a href={`mailto:${inst.email}`} className="text-blue-600 hover:underline font-medium">{inst.email}</a> : <span className="text-muted-foreground">-</span>}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-16 shrink-0">유튜브</span>
                    {inst.youtube ? <a href={inst.youtube} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5">링크<ExternalLink className="h-3 w-3" /></a> : <span className="text-muted-foreground">-</span>}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-16 shrink-0">인스타</span>
                    {igUrl ? <a href={igUrl} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline flex items-center gap-0.5">링크<ExternalLink className="h-3 w-3" /></a> : <span className="text-muted-foreground">-</span>}
                  </div>
                </div>

                {/* 미팅 정보 요약 */}
                <div className="text-sm text-muted-foreground">
                  <span>미팅일: </span>
                  <span className="font-medium text-foreground">{inst.meeting_date ? formatMeetingDate(inst.meeting_date) : "-"}</span>
                </div>

                {/* 리마인드 날짜 변경 */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">리마인드 날짜</label>
                  <div className="flex gap-2 items-center">
                    <Input type="date" className="h-9 text-sm flex-1" value={remindDate} onChange={(e) => setRemindDate(e.target.value)} />
                    {inst.meeting_date && (
                      <button className="text-xs text-blue-600 hover:underline whitespace-nowrap" onClick={() => setRemindDate(calcRemindDate(inst.meeting_date))}>
                        자동 계산
                      </button>
                    )}
                  </div>
                </div>

                {/* 리마인드 완료 체크 */}
                <div
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    remindDone ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200"
                  }`}
                  onClick={() => setRemindDone(!remindDone)}
                >
                  <input type="checkbox" className="h-4 w-4 rounded accent-green-600 pointer-events-none" checked={remindDone} readOnly />
                  <span className={`text-sm font-medium ${remindDone ? "text-green-800" : "text-gray-500"}`}>리마인드 완료</span>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="h-9 text-sm flex-1" onClick={handleRemindSave}><Save className="h-3.5 w-3.5 mr-1" />저장</Button>
                  <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => setRemindModal(null)}>닫기</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}
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
