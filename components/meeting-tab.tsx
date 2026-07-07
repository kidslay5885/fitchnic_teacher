"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_COLORS, STATUSES, ASSIGNEES, SOURCES } from "@/lib/constants";
import { requiresReason } from "@/lib/status-machine";
import type { Instructor, InstructorStatus } from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Save, ExternalLink,
  MessageSquare, X, Search, Calendar, Clock, Plus, Minus, ArrowUpRight, Trash2,
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

// 미팅 안내 메시지 단계 정의 (전송 현황 체크용)
const MESSAGE_STAGES = [
  { key: "before", label: "미팅 전", desc: "일정 확정" },
  { key: "dayBefore", label: "전날", desc: "" },
  { key: "dayOf", label: "당일", desc: "" },
  { key: "afterEnd", label: "종료 후", desc: "" },
  { key: "rejected", label: "계약 반려", desc: "" },
] as const;

type MessageStatus = {
  before: boolean; dayBefore: boolean; dayOf: boolean;
  afterEnd: boolean; rejected: boolean; carNumber: string;
  // 단계별 수정본(강사별). 키가 있으면 자동 문구 대신 이 값을 사용
  overrides: Record<string, string>;
};

const EMPTY_MESSAGE_STATUS: MessageStatus = {
  before: false, dayBefore: false, dayOf: false,
  afterEnd: false, rejected: false, carNumber: "", overrides: {},
};

const parseMessageStatus = (raw: string): MessageStatus => {
  try {
    const p = JSON.parse(raw || "{}");
    return {
      before: !!p.before, dayBefore: !!p.dayBefore, dayOf: !!p.dayOf,
      afterEnd: !!p.afterEnd, rejected: !!p.rejected, carNumber: p.carNumber || "",
      overrides: (p.overrides && typeof p.overrides === "object") ? p.overrides : {},
    };
  } catch { return { ...EMPTY_MESSAGE_STATUS, overrides: {} }; }
};

// 미팅 안내 문구 (장소·네이버링크 고정)
const MSG_PLACE = "장소: 서울 강남구 역삼동 702-29 아름빌딩 5층 (1층 생활맥주 건물)";
const MSG_NAVER = "https://naver.me/GRoB9jjU";

// 담당자별 발신자 표기 (메시지 서명)
function senderLabel(assignee: string): string {
  const name = (assignee || "").trim();
  if (name === "정승희") return "(주)핏크닉 강의기획팀 팀장 정승희";
  if (name === "김보성") return "(주)핏크닉 강의기획파트장 김보성";
  if (name) return `(주)핏크닉 강의기획팀 ${name}`;
  return "(주)핏크닉 강의기획팀 팀장 정승희";
}

// 단계별 안내 메시지 생성 (미팅일시·시간·차량번호·발신자 자동 반영)
function buildMessage(
  stage: string,
  opts: { name: string; dateStr: string; hour: number | null; carNumber: string; sender: string }
): string {
  const { name, dateStr, hour, carNumber, sender } = opts;
  const car = carNumber.trim() || "000라 0000";
  const hourTxt = hour != null ? `${hour}시 ` : "";
  const dateBlock = `-\n미팅일시: ${dateStr || "(미정)"}\n${MSG_PLACE}\n\n${MSG_NAVER}`;
  switch (stage) {
    case "before":
      return `안녕하세요, 대표님 :)\n금일 연락드린 ${sender}입니다.\n다음주 미팅을 위해 오시는 길을 안내드립니다.\n\n삼성동 마에스트로 주차장을 이용하실 경우,\n핏크닉에서 무료주차(1시간) 지원을 해드립니다.\n주차등록이 필요하시다면 차량번호 전달 부탁드립니다. ^^\n${dateBlock}`;
    case "dayBefore":
      return `안녕하세요, 대표님\n내일 ${hourTxt}미팅일정 리마인드차 연락드립니다!\n일정 변동이 없으시다면 내일 뵙고 다시 한 번 인사드리겠습니다.\n\n방문 시 아름빌딩 5층에 오셔서 벨 눌러주세요. 감사합니다. ^^\n\n(주차등록 차량번호: ${car})\n${dateBlock}`;
    case "dayOf":
      return `안녕하세요, 대표님\n금일 ${hourTxt}미팅일정 리마인드차 연락드립니다!\n아름빌딩 5층에 올라오셔서 벨 눌러주시면 됩니다. 감사합니다. ^^\n\n(주차등록 차량번호: ${car})\n${dateBlock}`;
    case "afterEnd":
      return `대표님, 오늘 시간내어 방문해주셔서 감사합니다.\n덕분에 많은 말씀 나눌 수 있었습니다.\n저희는 충분한 내부논의 거친 후에 다시 한 번 연락드리겠습니다!\n\n감사합니다. ^^`;
    case "rejected":
      return `안녕하세요 ${name} 대표님, ${sender}입니다.\n지난 미팅 시간내어주셔서 감사합니다.\n\n내부적으로 충분히 검토한 결과, 현재 저희의 기획과정에서 대표님과 함께 진행하기에는 시점이 조금 아쉬운 것 같습니다.\n추후 발전된 방향성으로 다시 한 번 연락드릴 수 있도록 하겠습니다.\n\n대표님의 사업에도 늘 좋은 성과가 있으시길 응원하겠습니다.\n감사합니다 :)`;
    default: return "";
  }
}

export default function MeetingTab() {
  const { state, dispatch, loadStats } = useOutreach();
  const [monthOffset, setMonthOffset] = useState(0);
  const [editingMeeting, setEditingMeeting] = useState<{
    instructor: Instructor; date: string; time: string; memo: string;
    confirmed: boolean; remindDate: string; meetingType: string;
    postSpecial: string; postPositive: string; postNegative: string;
    modalTab: "before" | "questions" | "after" | "messages";
    preQuestions: Record<string, string>;
    preInfo: string;
    messageStatus: MessageStatus;
  } | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialOpen = useRef(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [remindModal, setRemindModal] = useState<Instructor | null>(null);
  const [remindDate, setRemindDate] = useState("");
  const [remindDone, setRemindDone] = useState(false);
  const [search, setSearch] = useState("");
  const [editingStatus, setEditingStatus] = useState<{ instructor: Instructor; x: number; y: number } | null>(null);
  // 대시보드 등 다른 탭에서 진입 시 특정 강사 행 스크롤·하이라이트
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // 문자 자동발송 게이트웨이: 등록 기기 상태 + 예약시각 + 발송중 단계
  const [smsDevice, setSmsDevice] = useState<{ paired: boolean; pairing_code: string; last_seen: string | null; phone_number: string } | null>(null);
  const [smsScheduleAt, setSmsScheduleAt] = useState("");
  const [smsBusy, setSmsBusy] = useState<string | null>(null);

  const loadDevice = async () => {
    try {
      const r = await fetch("/api/sms/device");
      const d = await r.json();
      setSmsDevice(d.device);
    } catch {}
  };
  useEffect(() => { loadDevice(); }, []);

  const registerDevice = async () => {
    try {
      const r = await fetch("/api/sms/device/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error((await r.json()).error);
      toast.success("페어링 코드 발급됨 — 폰 앱에 입력하세요");
      loadDevice();
    } catch (e: any) { toast.error(e.message); }
  };
  const unregisterDevice = async () => {
    try {
      await fetch("/api/sms/device", { method: "DELETE" });
      toast.success("기기 등록 해제됨");
      loadDevice();
    } catch (e: any) { toast.error(e.message); }
  };

  // 발송/예약 등록
  const enqueueSms = async (inst: Instructor, stage: string, text: string, scheduledAt?: string) => {
    if (!smsDevice?.paired) { toast.error("먼저 폰 기기를 등록·연결하세요."); return; }
    const phone = (inst.phone || "").replace(/[^0-9]/g, "");
    if (!phone) { toast.error("강사 전화번호가 없습니다."); return; }
    setSmsBusy(stage + (scheduledAt ? ":sched" : ":now"));
    try {
      const images = stage === "before" ? "transit,car" : "";
      const res = await fetch("/api/sms/enqueue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructor_id: inst.id, instructor_name: inst.name, phone, stage, body: text, images, scheduled_at: scheduledAt || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(scheduledAt ? "예약 등록 완료" : "발송 대기열에 추가됨");
    } catch (e: any) { toast.error(e.message); }
    finally { setSmsBusy(null); }
  };

  // 강의현황(구글시트)에 있는 강사명 Set
  const [scheduleNames, setScheduleNames] = useState<Set<string>>(new Set());
  useEffect(() => {
    const now = new Date();
    const monthName = `${now.getMonth() + 1}월`;
    fetch(`/api/schedule?sheet=${encodeURIComponent(monthName)}`)
      .then(res => res.json())
      .then(data => {
        const names = new Set<string>();
        for (const week of data.weeks || []) {
          for (const day of week.days || []) {
            for (const lec of day.lectures || []) {
              if (lec.instructor) names.add(lec.instructor.trim());
            }
          }
        }
        setScheduleNames(names);
      })
      .catch(() => {});
  }, []);

  // 상태 클릭 → 팝오버
  const handleStatusClick = (e: React.MouseEvent, instructor: Instructor) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingStatus({ instructor, x: rect.left, y: rect.bottom + 4 });
  };

  // 상태 변경 처리
  const handleStatusChange = async (instructorId: string, newStatus: InstructorStatus, reason: string) => {
    try {
      const inst = state.instructors.find(i => i.id === instructorId);
      const body: any = { status: newStatus, _changed_by: inst?.assignee || "", _reason: reason };
      if (newStatus === "컨펌 필요" || requiresReason(newStatus)) body.reason = reason;
      const res = await fetch(`/api/instructors/${instructorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = await res.json();
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: updated });
      await loadStats();
      toast.success(`${inst?.name} → ${newStatus}`);
      setEditingStatus(null);
    } catch (e: any) { toast.error(e.message); }
  };

  // 응답을 받은 강사 (거절/제외/보류 제외) + 미팅 관련 강사
  const EXCLUDE_STATUSES = ["거절", "제외", "보류"];
  const respondedInstructors = useMemo(() => {
    return state.instructors.filter((i) => {
      if (EXCLUDE_STATUSES.includes(i.status)) return false;
      if (i.meeting_date || i.meeting_confirmed) return true;
      return i.has_response;
    });
  }, [state.instructors]);

  // 다른 탭(대시보드 등)에서 강사 진입 시: 검색 초기화 → 해당 행 스크롤·하이라이트
  useEffect(() => {
    const focusId = state.focusInstructorId;
    if (!focusId) return;
    // 미팅관리 목록(respondedInstructors)에 없는 강사는 노출 불가 — 포커스만 해제
    const exists = respondedInstructors.some((i) => i.id === focusId);
    if (!exists) {
      dispatch({ type: "FOCUS_INSTRUCTOR", id: null });
      return;
    }
    // 검색으로 가려져 있으면 먼저 검색을 비우고 다음 렌더에서 다시 처리
    if (search) {
      setSearch("");
      return;
    }
    rowRefs.current[focusId]?.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightedId(focusId);
    dispatch({ type: "FOCUS_INSTRUCTOR", id: null });
  }, [state.focusInstructorId, respondedInstructors, search, dispatch]);

  // 하이라이트는 잠깐만 보였다가 사라지도록 자동 해제
  useEffect(() => {
    if (!highlightedId) return;
    const t = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightedId]);

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
    // 시간 없는 항목은 맨 뒤로 보내기 위해 큰 값 사용
    const timeToMinutes = (md: string) => {
      const t = md.match(/(\d{1,2}):(\d{2})/);
      if (!t) return Number.MAX_SAFE_INTEGER;
      return +t[1] * 60 + +t[2];
    };
    return meetings.filter((mt) => {
      const md = mt.meeting_date || "";
      return md.includes(iso) || md.includes(`${m}/${d}`) || md.includes(`${m}월 ${d}일`) ||
        md.includes(`${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`);
    }).sort((a, b) => timeToMinutes(a.meeting_date || "") - timeToMinutes(b.meeting_date || ""));
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
  // remind_disabled=true면 명시적으로 삭제된 상태이므로 자동 계산도 무시
  const getRemindersForDate = (date: Date | null) => {
    if (!date) return [];
    const targetIso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return meetings.filter((mt) => {
      if (mt.remind_disabled) return false;
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
    const remindDate = i.remind_date || (i.remind_disabled || !i.meeting_date ? "" : calcRemindDate(i.meeting_date));
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
    isInitialOpen.current = true;
    setAutoSaveStatus("idle");
    setEditingMeeting({
      instructor: i, date, time, memo: i.meeting_memo || "",
      confirmed: !!i.meeting_confirmed, remindDate, meetingType: i.meeting_type || "",
      postSpecial: post.special, postPositive: post.positive, postNegative: post.negative,
      modalTab: defaultTab, preQuestions: preQ, preInfo: i.pre_info || "",
      messageStatus: parseMessageStatus(i.message_status || ""),
    });
  };

  // 공통 저장 로직 (silent=true: 자동 저장, false: 수동 저장)
  const saveMeeting = async (data: NonNullable<typeof editingMeeting>, silent: boolean) => {
    const meetingDate = data.date
      ? (data.time ? `${data.date} ${data.time}` : data.date)
      : "";
    try {
      if (silent) setAutoSaveStatus("saving");
      const res = await fetch(`/api/instructors/${data.instructor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_date: meetingDate, meeting_memo: data.memo,
          meeting_confirmed: data.confirmed,
          remind_date: data.remindDate || "",
          remind_disabled: !data.remindDate,
          meeting_type: data.meetingType || "",
          pre_info: data.preInfo,
          pre_questions: JSON.stringify(data.preQuestions),
          post_info: JSON.stringify({ special: data.postSpecial, positive: data.postPositive, negative: data.postNegative }),
          message_status: JSON.stringify(data.messageStatus),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      if (silent) setAutoSaveStatus("saved");
      return true;
    } catch {
      if (silent) setAutoSaveStatus("idle");
      else toast.error("저장 실패");
      return false;
    }
  };

  // 자동 저장 대상 데이터 (modalTab 제외 — 탭 전환은 저장 트리거하지 않음)
  const autoSaveDeps = editingMeeting
    ? JSON.stringify({ ...editingMeeting, modalTab: undefined, instructor: undefined })
    : null;

  // 디바운스 자동 저장
  useEffect(() => {
    if (!editingMeeting || !autoSaveDeps) return;
    // 모달 첫 오픈 시에는 저장하지 않음
    if (isInitialOpen.current) {
      isInitialOpen.current = false;
      return;
    }
    setAutoSaveStatus("idle");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveMeeting(editingMeeting, true);
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [autoSaveDeps]);

  const handleSave = async () => {
    if (!editingMeeting) return;
    // 대기 중인 자동 저장 취소
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    const ok = await saveMeeting(editingMeeting, false);
    if (ok) {
      setEditingMeeting(null);
      toast.success("미팅 정보 저장 완료");
    }
  };

  const handleRemove = async () => {
    if (!editingMeeting) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
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
      <tr
        key={i.id}
        ref={(el) => { rowRefs.current[i.id] = el; }}
        className={`border-b hover:bg-blue-50/40 cursor-pointer transition-colors ${highlightedId === i.id ? "bg-amber-100" : scheduleNames.has(i.name.trim()) ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}`}
        onClick={() => openEdit(i)}
      >
        <td className="px-3 py-2 border-r border-gray-200/60 font-medium whitespace-nowrap">
          <span className="flex items-center gap-1">
            {i.name}
            {scheduleNames.has(i.name.trim()) && <span className="text-xs text-red-600 font-bold whitespace-nowrap">(타플랫폼 데뷔)</span>}
            {needsPostInfo(i) && <span className="shrink-0 h-2 w-2 rounded-full bg-red-500" title="사후 정보 미입력" />}
          </span>
        </td>
        <td className="px-3 py-2 border-r border-gray-200/60">
          <Badge
            className={`text-[10px] px-1.5 py-0 whitespace-nowrap cursor-pointer hover:ring-1 hover:ring-primary/30 ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}
            onClick={(e) => handleStatusClick(e, i)}
          >{i.status}</Badge>
        </td>
        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground truncate max-w-[120px] hidden sm:table-cell">{i.field}</td>
        <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground whitespace-nowrap hidden md:table-cell">{i.contact_assignee}</td>
        <td className="px-3 py-2 border-r border-gray-200/60 whitespace-nowrap font-medium text-blue-700">
          {showDate ? formatMeetingDate(i.meeting_date || "") : "-"}
        </td>
        <td className="px-2 py-2 border-r border-gray-200/60 whitespace-nowrap hidden md:table-cell">
          {(() => {
            const ms = parseMessageStatus(i.message_status || "");
            return (
              <div className="flex items-center gap-0.5">
                {MESSAGE_STAGES.map((s, si) => (
                  <span
                    key={s.key}
                    title={`${si + 1}. ${s.label}${ms[s.key] ? " · 전송완료" : " · 미전송"}`}
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                      ms[s.key] ? "bg-green-500 text-white" : "bg-gray-100 text-gray-400"
                    }`}
                  >{si + 1}</span>
                ))}
              </div>
            );
          })()}
        </td>
        <td className="px-2 py-2 border-r border-gray-200/60 text-center whitespace-nowrap hidden sm:table-cell">
          {i.meeting_type ? (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${i.meeting_type === "줌미팅" ? "text-blue-600 border-blue-300 bg-blue-50" : i.meeting_type === "보류" ? "text-gray-600 border-gray-300 bg-gray-50" : "text-orange-600 border-orange-300 bg-orange-50"}`}>{i.meeting_type}</Badge>
          ) : <span className="text-muted-foreground text-xs">-</span>}
        </td>
        <td className="px-3 py-2 border-r border-gray-200/60 text-sm text-foreground/70 truncate max-w-[200px] hidden lg:table-cell" title={i.meeting_memo || ""}>
          {i.meeting_memo || ""}
        </td>
      </tr>
    ));

  return (
    <div className="flex flex-col lg:flex-row gap-4" style={{ height: "calc(100vh - 56px)" }}>
      {/* ── 좌측: 전체 미팅 목록 ── */}
      <div className="flex flex-col w-full lg:w-[750px] shrink-0">
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
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap hidden sm:table-cell">분야</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap hidden md:table-cell">담당자</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">미팅일</th>
                <th className="text-left px-2 py-2 border-r border-gray-200 whitespace-nowrap hidden md:table-cell">메시지</th>
                <th className="text-center px-2 py-2 border-r border-gray-200 whitespace-nowrap hidden sm:table-cell">방식</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap hidden lg:table-cell">메모</th>
              </tr>
            </thead>
            <tbody>
              {/* 미팅 확정 (날짜 O) */}
              {confirmedWithDate.length > 0 && (
                <>
                  <tr>
                    <td colSpan={8} className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 border-b">
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
                    <td colSpan={8} className="bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 border-b">
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
                    <td colSpan={8} className="bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 border-b">
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
      <div className="flex-1 flex flex-col min-w-0 min-h-[400px]">
        {/* 월 네비 */}
        <div className="shrink-0 flex items-center gap-2 sm:gap-3 pb-3 pt-3 lg:pt-9">
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
                                  className={`w-full text-left rounded px-1.5 py-0.5 text-[11px] transition-colors truncate border ${
                                    mt.meeting_type === "대면미팅"
                                      ? "bg-orange-100 border-orange-200 hover:bg-orange-200"
                                      : mt.meeting_type === "줌미팅"
                                      ? "bg-blue-100 border-blue-200 hover:bg-blue-200"
                                      : mt.meeting_type === "보류"
                                      ? "bg-gray-100 border-gray-300 hover:bg-gray-200"
                                      : "bg-gray-100 border-gray-200 hover:bg-gray-200"
                                  }`}
                                  title={`${mt.name} ${time || ""} ${mt.meeting_type || ""}`}
                                >
                                  <span className={`font-medium ${
                                    mt.meeting_type === "대면미팅" ? "text-orange-900" : mt.meeting_type === "줌미팅" ? "text-blue-900" : mt.meeting_type === "보류" ? "text-gray-600" : "text-gray-900"
                                  }`}>{mt.meeting_type === "줌미팅" ? "(줌) " : mt.meeting_type === "대면미팅" ? "(대면) " : ""}{mt.name}</span>
                                  {time && <span className={`ml-1 ${
                                    mt.meeting_type === "대면미팅" ? "text-orange-500" : mt.meeting_type === "줌미팅" ? "text-blue-500" : mt.meeting_type === "보류" ? "text-gray-400" : "text-gray-500"
                                  }`}>{time}</span>}
                                </button>
                              );
                            })}
                            {dayReminders.map((mt) => (
                              <button
                                key={`remind-${mt.id}`}
                                onClick={() => { setRemindModal(mt); setRemindDate(mt.remind_date || (mt.remind_disabled ? "" : calcRemindDate(mt.meeting_date || ""))); setRemindDone(!!mt.remind_done); }}
                                className={`w-full text-left rounded px-1.5 py-0.5 text-[11px] transition-colors truncate border ${
                                  mt.remind_done
                                    ? "bg-green-50 border-green-200 hover:bg-green-100"
                                    : "bg-slate-200 border-slate-400 hover:bg-slate-300"
                                }`}
                              >
                                <span className={`font-medium ${mt.remind_done ? "text-green-700 line-through" : "text-slate-700"}`}>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4">
            <Card className="w-full max-w-[1100px] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <CardContent className="p-4 sm:p-6 flex flex-col overflow-hidden">
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold">{inst.name}</p>
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[inst.status as InstructorStatus] || ""}`}>{inst.status}</Badge>
                    {autoSaveStatus === "saving" && <span className="text-xs text-muted-foreground animate-pulse">저장 중...</span>}
                    {autoSaveStatus === "saved" && <span className="text-xs text-green-500">저장됨</span>}
                  </div>
                  <button onClick={() => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); setEditingMeeting(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>

                <div className="flex flex-col md:flex-row gap-4 md:gap-5 flex-1 min-h-0 overflow-y-auto md:overflow-y-hidden">
                  {/* ── 왼쪽: 기본 정보 + 미팅 설정 ── */}
                  <div className="w-full md:w-[320px] shrink-0 space-y-4 md:overflow-y-auto">
                    {/* 강사 기본 정보 */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm border rounded-lg p-3 bg-gray-50/50">
                      <div><span className="text-muted-foreground">분야</span> <span className="ml-1 font-medium">{inst.field || "-"}</span></div>
                      <div><span className="text-muted-foreground">담당자</span> <span className="ml-1 font-medium">{inst.contact_assignee || "-"}</span></div>
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
                      <div className="w-[120px] sm:w-[140px]">
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
                        {(["줌미팅", "대면미팅", "보류"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setEditingMeeting({ ...editingMeeting, meetingType: editingMeeting.meetingType === t ? "" : t })}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                              editingMeeting.meetingType === t
                                ? t === "보류"
                                  ? "bg-orange-500 text-white border-orange-500"
                                  : "bg-primary text-primary-foreground border-primary"
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
                        { id: "messages" as const, label: "메시지" },
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
                        <Textarea
                          className="text-sm h-full min-h-[200px]"
                          placeholder="사전 정보를 입력하세요..."
                          value={editingMeeting.preInfo}
                          onChange={(e) => setEditingMeeting({ ...editingMeeting, preInfo: e.target.value })}
                        />
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

                      {/* 메시지 전송 현황 */}
                      {editingMeeting.modalTab === "messages" && (() => {
                        const ms = editingMeeting.messageStatus;
                        let dateStr = "";
                        let hour: number | null = null;
                        if (editingMeeting.date) {
                          const [yy, mm, dd] = editingMeeting.date.split("-").map(Number);
                          const d = new Date(yy, mm - 1, dd);
                          dateStr = `${String(yy).slice(2)}.${String(mm).padStart(2, "0")}.${String(dd).padStart(2, "0")}. (${DAY_KO[d.getDay()]})${editingMeeting.time ? ` ${editingMeeting.time}` : ""}`;
                        }
                        if (editingMeeting.time) hour = parseInt(editingMeeting.time.split(":")[0], 10);
                        const copy = (text: string) => {
                          navigator.clipboard.writeText(text)
                            .then(() => toast.success("메시지 복사됨"))
                            .catch(() => toast.error("복사 실패"));
                        };
                        const phone = (inst.phone || "").replace(/[^0-9]/g, "");
                        const canSend = !!smsDevice?.paired && !!phone;
                        const schedISO = smsScheduleAt ? new Date(smsScheduleAt).toISOString() : "";
                        return (
                          <div className="space-y-3">
                            {/* 문자 자동발송: 기기 상태 + 예약시각 */}
                            <div className="border rounded-lg p-3 bg-slate-50/60 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">문자 자동발송 (내 폰)</span>
                                {!smsDevice ? (
                                  <button onClick={registerDevice} className="text-xs text-blue-600 hover:underline">기기 등록</button>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <button onClick={loadDevice} className="text-xs text-muted-foreground hover:underline">새로고침</button>
                                    <button onClick={unregisterDevice} className="text-xs text-red-500 hover:underline">등록 해제</button>
                                  </div>
                                )}
                              </div>
                              {!smsDevice && <p className="text-[11px] text-muted-foreground">등록된 폰이 없습니다. '기기 등록'으로 페어링 코드를 발급하세요.</p>}
                              {smsDevice && !smsDevice.paired && (
                                <p className="text-[11px] text-orange-600">
                                  페어링 코드 <span className="font-mono font-bold text-sm">{smsDevice.pairing_code}</span> — 폰 앱에 입력 후 '새로고침'
                                </p>
                              )}
                              {smsDevice?.paired && (
                                <p className="text-[11px] text-green-700">
                                  ✓ 연결됨 {smsDevice.phone_number && `(${smsDevice.phone_number})`}
                                  {smsDevice.last_seen && ` · 최근 접속 ${new Date(smsDevice.last_seen).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                                </p>
                              )}
                              {!phone && <p className="text-[11px] text-red-500">이 강사는 전화번호가 없어 발송할 수 없습니다.</p>}
                              <div>
                                <label className="text-[11px] text-muted-foreground mb-0.5 block">예약 발송 시각 (비우면 즉시)</label>
                                <Input type="datetime-local" className="h-8 text-xs" value={smsScheduleAt} onChange={(e) => setSmsScheduleAt(e.target.value)} />
                              </div>
                            </div>

                            {/* 주차등록 차량번호 */}
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">주차등록 차량번호 (전날·당일 안내에 자동 반영)</label>
                              <Input
                                className="h-9 text-sm"
                                placeholder="예: 12가 3456"
                                value={ms.carNumber}
                                onChange={(e) => setEditingMeeting({ ...editingMeeting, messageStatus: { ...ms, carNumber: e.target.value } })}
                              />
                            </div>

                            {MESSAGE_STAGES.map((s, si) => {
                              const done = ms[s.key];
                              const overrides = ms.overrides ?? {};
                              const hasOverride = Object.prototype.hasOwnProperty.call(overrides, s.key);
                              const generated = buildMessage(s.key, { name: inst.name, dateStr, hour, carNumber: ms.carNumber, sender: senderLabel(inst.contact_assignee || inst.assignee) });
                              const text = hasOverride ? overrides[s.key] : generated;
                              const setOverride = (val: string) =>
                                setEditingMeeting({ ...editingMeeting, messageStatus: { ...ms, overrides: { ...overrides, [s.key]: val } } });
                              const resetOverride = () => {
                                const next = { ...overrides };
                                delete next[s.key];
                                setEditingMeeting({ ...editingMeeting, messageStatus: { ...ms, overrides: next } });
                              };
                              return (
                                <div key={s.key} className={`border rounded-lg p-3 space-y-2 ${done ? "border-green-300 bg-green-50/40" : "border-gray-200"}`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"}`}>{si + 1}</span>
                                      <span className="text-sm font-semibold">{s.label}</span>
                                      {s.desc && <span className="text-xs text-muted-foreground">{s.desc}</span>}
                                      {hasOverride && <span className="text-[10px] text-orange-600 bg-orange-50 border border-orange-200 rounded px-1 py-0.5">수정됨</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {hasOverride && (
                                        <button
                                          type="button"
                                          onClick={resetOverride}
                                          className="text-xs text-muted-foreground hover:text-foreground hover:underline whitespace-nowrap"
                                        >기본 문구로</button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => copy(text)}
                                        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                                      >복사</button>
                                      <button
                                        type="button"
                                        disabled={!canSend || smsBusy !== null}
                                        onClick={() => enqueueSms(inst, s.key, text)}
                                        className="text-xs font-medium text-white bg-primary rounded px-2 py-0.5 disabled:opacity-40 whitespace-nowrap"
                                      >{smsBusy === s.key + ":now" ? "…" : "발송"}</button>
                                      <button
                                        type="button"
                                        disabled={!canSend || !schedISO || smsBusy !== null}
                                        onClick={() => enqueueSms(inst, s.key, text, schedISO)}
                                        className="text-xs font-medium text-primary border border-primary rounded px-2 py-0.5 disabled:opacity-40 whitespace-nowrap"
                                      >{smsBusy === s.key + ":sched" ? "…" : "예약"}</button>
                                      <label
                                        className={`flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer text-xs font-medium transition-colors ${done ? "bg-green-100 border-green-300 text-green-700" : "bg-white border-gray-200 text-gray-500"}`}
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5 rounded accent-green-600"
                                          checked={done}
                                          onChange={() => setEditingMeeting({ ...editingMeeting, messageStatus: { ...ms, [s.key]: !done } })}
                                        />
                                        전송완료
                                      </label>
                                    </div>
                                  </div>
                                  <Textarea
                                    className="text-xs leading-relaxed bg-gray-50 !min-h-[120px]"
                                    rows={Math.max(6, text.split("\n").length + 1)}
                                    value={text}
                                    onChange={(e) => setOverride(e.target.value)}
                                    placeholder="메시지 내용..."
                                  />
                                  {s.key === "before" && (
                                    <div className="space-y-1">
                                      <p className="text-[11px] text-muted-foreground">※ 아래 오시는길 이미지 2장도 함께 첨부하세요.</p>
                                      <div className="flex gap-2">
                                        <a href="/fitchnic-route-transit.png" target="_blank" rel="noopener noreferrer" className="block w-1/2">
                                          <img src="/fitchnic-route-transit.png" alt="오시는길(대중교통)" className="w-full rounded border" />
                                        </a>
                                        <a href="/fitchnic-route-car.png" target="_blank" rel="noopener noreferrer" className="block w-1/2">
                                          <img src="/fitchnic-route-car.png" alt="오시는길(차량)" className="w-full rounded border" />
                                        </a>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* 버튼 */}
                <div className="flex gap-2 mt-5 shrink-0">
                  <Button size="sm" className="h-9 text-sm flex-1" onClick={handleSave}><Save className="h-3.5 w-3.5 mr-1" />저장</Button>
                  {(inst.meeting_date || inst.meeting_confirmed) && (
                    <Button size="sm" variant="outline" className="h-9 text-sm text-red-500 hover:text-red-600" onClick={handleRemove}>삭제</Button>
                  )}
                  <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); setEditingMeeting(null); }}>닫기</Button>
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
              body: JSON.stringify({ remind_date: remindDate, remind_done: remindDone, remind_disabled: !remindDate }),
            });
            if (!res.ok) throw new Error("Failed");
            dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
            setRemindModal(null);
            toast.success("리마인드 날짜 저장 완료");
          } catch { toast.error("저장 실패"); }
        };
        const handleRemindDelete = async () => {
          try {
            const res = await fetch(`/api/instructors/${inst.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ remind_date: null, remind_done: false, remind_disabled: true }),
            });
            if (!res.ok) throw new Error("Failed");
            dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
            setRemindModal(null);
            toast.success("리마인드 삭제 완료");
          } catch { toast.error("삭제 실패"); }
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={() => setRemindModal(null)}>
            <Card className="w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
              <CardContent className="p-4 sm:p-6 space-y-5">
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
                  <Button size="sm" variant="outline" className="h-9 text-sm text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleRemindDelete}><Trash2 className="h-3.5 w-3.5 mr-1" />삭제</Button>
                  <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => setRemindModal(null)}>닫기</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}
      {/* ── 상태 변경 팝오버 ── */}
      {editingStatus && (
        <StatusPopover
          instructor={editingStatus.instructor}
          x={editingStatus.x}
          y={editingStatus.y}
          onConfirm={handleStatusChange}
          onClose={() => setEditingStatus(null)}
        />
      )}
      {/* ── 미팅 추가 모달 ── */}
      {showAddModal && (
        <AddMeetingModal
          instructors={state.instructors}
          dispatch={dispatch}
          loadStats={loadStats}
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
type AddMode = "existing" | "new";

function AddMeetingModal({ instructors, dispatch, loadStats, onSave, onClose }: {
  instructors: Instructor[];
  dispatch: ReturnType<typeof useOutreach>["dispatch"];
  loadStats: ReturnType<typeof useOutreach>["loadStats"];
  onSave: (id: string, meetingDate: string, memo: string) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AddMode>("existing");

  // 기존 강사 선택 상태
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 공통: 미팅 정보
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 새 강사 등록 폼
  const [form, setForm] = useState({
    name: "", field: "", assignee: "", email: "",
    instagram: "", youtube: "", phone: "", ref_link: "",
    has_lecture_history: "", lecture_platform: "", lecture_platform_url: "",
    source: "강사모집" as string, notes: "",
  });
  const [refLinks, setRefLinks] = useState<string[]>([""]);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    if (!search || search.length < 1) return [];
    const q = search.toLowerCase();
    return instructors
      .filter((i) => i.name?.toLowerCase().includes(q) || i.field?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, instructors]);

  const selected = selectedId ? instructors.find((i) => i.id === selectedId) : null;

  // 기존 강사 미팅 추가
  const handleSubmitExisting = async () => {
    if (!selectedId || !date) { toast.error("강사와 날짜를 선택하세요."); return; }
    const meetingDate = time ? `${date} ${time}` : date;
    setSaving(true);
    await onSave(selectedId, meetingDate, memo);
    setSaving(false);
  };

  // 새 강사 등록 + 미팅 추가
  const handleSubmitNew = async () => {
    if (!form.name.trim()) { toast.error("강사 이름을 입력하세요."); return; }
    setSaving(true);
    try {
      // 1. 강사 등록 (상태: 진행 중)
      const instructorBody: Record<string, unknown> = {
        ...form,
        status: "진행 중",
        ref_link: refLinks.filter((l) => l.trim()).join(" , "),
        meeting_confirmed: confirmed,
      };
      // 미팅 날짜가 있으면 함께 저장
      if (date) {
        instructorBody.meeting_date = time ? `${date} ${time}` : date;
        instructorBody.meeting_memo = memo || "";
      }
      if (memo && !date) {
        instructorBody.meeting_memo = memo;
      }
      const res = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(instructorBody),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      dispatch({ type: "ADD_INSTRUCTOR", instructor: data });
      await loadStats();
      toast.success(`${form.name} 등록 + 미팅 추가 완료`);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "등록 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={onClose}>
      <Card className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">미팅 추가</p>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>

          {/* 모드 탭 */}
          <div className="flex border-b">
            <button
              onClick={() => setMode("existing")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mode === "existing" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              기존 강사
            </button>
            <button
              onClick={() => setMode("new")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                mode === "new" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              새 강사 등록
            </button>
          </div>

          {mode === "existing" ? (
            <>
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
                <Button size="sm" className="h-9 text-sm flex-1" onClick={handleSubmitExisting} disabled={saving || !selectedId || !date}>
                  {saving ? "저장 중..." : "미팅 추가"}
                </Button>
                <Button size="sm" variant="outline" className="h-9 text-sm" onClick={onClose}>취소</Button>
              </div>
            </>
          ) : (
            <>
              {/* 새 강사 정보 입력 */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <div className="col-span-2">
                  <Label className="text-xs">이름 *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-sm" autoFocus />
                </div>
                <div>
                  <Label className="text-xs">분야</Label>
                  <Input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">강의 여부</Label>
                  <div className="flex gap-1.5 mt-1">
                    {["O", "X", "?"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setForm({ ...form, has_lecture_history: form.has_lecture_history === v ? "" : v })}
                        className={`h-8 w-10 rounded border text-sm font-medium transition-colors ${
                          form.has_lecture_history === v
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-muted-foreground border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">강의 플랫폼</Label>
                  <Input value={form.lecture_platform} onChange={(e) => setForm({ ...form, lecture_platform: e.target.value })} className="h-8 text-sm" placeholder="플랫폼 이름" />
                  <Input value={form.lecture_platform_url} onChange={(e) => setForm({ ...form, lecture_platform_url: e.target.value })} className="h-8 text-sm mt-1.5" placeholder="주소 (URL)" />
                </div>
                <div>
                  <Label className="text-xs">유튜브</Label>
                  <Input value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">인스타그램</Label>
                  <Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="h-8 text-sm" />
                </div>
                {/* 참조 링크 */}
                <div className="col-span-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">참조 링크</Label>
                    <button type="button" onClick={() => setRefLinks([...refLinks, ""])} className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800">
                      <Plus className="h-3.5 w-3.5" />추가
                    </button>
                  </div>
                  {refLinks.map((link, idx) => (
                    <div key={idx} className="flex items-center gap-1 mt-1.5">
                      <Input
                        value={link}
                        onChange={(e) => { const next = [...refLinks]; next[idx] = e.target.value; setRefLinks(next); }}
                        className="h-8 text-sm flex-1"
                        placeholder="https://"
                      />
                      {refLinks.length > 1 && (
                        <button type="button" onClick={() => setRefLinks(refLinks.filter((_, i) => i !== idx))} className="shrink-0 h-8 w-8 flex items-center justify-center rounded border border-gray-200 text-muted-foreground hover:text-red-500 hover:border-red-300">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div>
                  <Label className="text-xs">이메일</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">전화번호</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">비고</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="h-8 text-sm" />
                </div>
                {/* 찾은 사람 + 출처 */}
                <div className="col-span-2 flex items-end gap-4">
                  <div className="w-[140px] shrink-0 relative">
                    <Label className="text-xs">찾은 사람</Label>
                    <Input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} className="h-8 text-sm" placeholder="이름 입력" />
                    {form.assignee && !ASSIGNEES.includes(form.assignee) && (
                      <div className="absolute z-10 mt-0.5 w-full bg-white border rounded shadow-md">
                        {ASSIGNEES.filter((a) => a.includes(form.assignee)).map((a) => (
                          <button key={a} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100" onClick={() => setForm({ ...form, assignee: a })}>{a}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">출처</Label>
                    <div className="flex gap-1.5 mt-1">
                      {SOURCES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm({ ...form, source: s })}
                          className={`h-8 px-2.5 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
                            form.source === s
                              ? "bg-primary text-white border-primary"
                              : "bg-white text-muted-foreground border-gray-200 hover:border-gray-400"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 미팅 정보 (선택) */}
              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">미팅 정보 (선택 — 비워두면 미팅예정으로 등록)</p>
                <div
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    confirmed ? "bg-blue-50 border-blue-300" : "bg-gray-50 border-gray-200"
                  }`}
                  onClick={() => setConfirmed(!confirmed)}
                >
                  <input type="checkbox" className="h-4 w-4 rounded accent-blue-600 pointer-events-none" checked={confirmed} readOnly />
                  <span className={`text-sm font-medium ${confirmed ? "text-blue-800" : "text-gray-500"}`}>미팅 확정</span>
                </div>
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
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">메모 (선택)</label>
                  <Textarea className="text-sm" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="미팅 관련 메모..." />
                </div>
              </div>

              {/* 버튼 */}
              <div className="flex gap-2">
                <Button size="sm" className="h-9 text-sm flex-1" onClick={handleSubmitNew} disabled={saving || !form.name.trim()}>
                  {saving ? "저장 중..." : date ? "강사 등록 + 미팅 추가" : confirmed ? "강사 등록 (확정·날짜미정)" : "강사 등록 (미팅예정)"}
                </Button>
                <Button size="sm" variant="outline" className="h-9 text-sm" onClick={onClose}>취소</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── 상태 변경 팝오버 ── */
function StatusPopover({ instructor, x, y, onConfirm, onClose }: {
  instructor: Instructor;
  x: number; y: number;
  onConfirm: (id: string, status: InstructorStatus, reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const nextStatuses = STATUSES.filter(s => s !== instructor.status);
  const [pendingStatus, setPendingStatus] = useState<InstructorStatus | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const popW = 220;
  const adjustedX = Math.min(x, window.innerWidth - popW - 16);
  const adjustedY = y + 200 > window.innerHeight ? y - 200 - 8 : y;

  const needsInput = (status: InstructorStatus) => requiresReason(status) || status === "컨펌 필요";

  const handleSelect = async (status: InstructorStatus) => {
    if (needsInput(status)) {
      setPendingStatus(status);
      return;
    }
    setSaving(true);
    await onConfirm(instructor.id, status, "");
    setSaving(false);
  };

  const handleReasonSubmit = async () => {
    if (requiresReason(pendingStatus!) && !reason.trim()) { toast.error("사유를 입력하세요."); return; }
    if (!pendingStatus) return;
    setSaving(true);
    await onConfirm(instructor.id, pendingStatus, reason);
    setSaving(false);
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border rounded-lg shadow-lg p-3 space-y-2"
      style={{ left: adjustedX, top: adjustedY, width: popW }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">
          {pendingStatus ? (pendingStatus === "컨펌 필요" ? "컨펌 필요 메모" : `${pendingStatus} 사유`) : `${instructor.name} 상태 변경`}
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!pendingStatus ? (
        <div className="space-y-1">
          {nextStatuses.map(s => (
            <button
              key={s}
              onClick={() => handleSelect(s)}
              disabled={saving}
              className={`w-full text-left px-3 py-1.5 rounded text-sm font-medium transition-colors hover:ring-1 hover:ring-primary/30 ${STATUS_COLORS[s]}`}
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder={pendingStatus === "컨펌 필요" ? "메모 입력 (선택)..." : "사유 입력..."}
            className="h-8 text-sm"
            value={reason}
            onChange={e => setReason(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleReasonSubmit(); }}
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs flex-1" onClick={handleReasonSubmit} disabled={saving}>
              {saving ? "처리 중..." : "확인"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPendingStatus(null); setReason(""); }}>
              뒤로
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
