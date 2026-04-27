"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STATUSES, STATUS_COLORS, WAVE_RESULTS } from "@/lib/constants";
import { requiresReason } from "@/lib/status-machine";
import type { Instructor, InstructorStatus, OutreachWave } from "@/lib/types";
import { buildEmailDuplicateMap } from "@/lib/email-duplicates";
import InstructorDetail from "@/components/instructor-detail";
import SendEmailModal from "@/components/send-email-modal";
import { toast } from "sonner";
import { Search, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Pencil, Mail, Calendar as CalendarIcon } from "lucide-react";
import * as XLSX from "xlsx";

const CONTACT_STATUSES: InstructorStatus[] = ["발송 예정", "진행 중", "보류", "계약 완료"];
const FINAL_STATUSES = ["진행 중", "미팅 완료", "계약 완료", "보류", "거절"] as const;
type ViewFilter = "all" | "no_preinfo" | "check_needed" | InstructorStatus;
type SortKey = "name" | "status" | "field" | "email" | "wave1_date" | "wave2_date" | "wave3_date";
type SendMethodFilter = "" | "DM" | "이메일" | "기타";
type SortDir = "asc" | "desc";
type WaveFilterKey = "none" | "미입력" | "체크필요" | "무응답" | "응답" | "거절";

const ROW_H = 40;
const GRID = "36px 1.4fr 84px 64px 1fr 1.3fr 96px 72px 0.7fr 72px 0.7fr 72px 0.7fr";
const MIN_W = 1192;

// 상태별 행 배경색 (연한 틴트)
const ROW_BG: Record<string, string> = {
  미검토: "bg-gray-50/60 hover:bg-gray-100/50",
  "컨펌 필요": "bg-yellow-50/60 hover:bg-yellow-100/50",
  "발송 예정": "bg-blue-50/70 hover:bg-blue-100/50",
  "진행 중": "bg-indigo-50/60 hover:bg-indigo-100/50",
  "계약 완료": "bg-green-50/60 hover:bg-green-100/50",
  제외: "bg-red-50/50 hover:bg-red-100/40",
  보류: "bg-orange-50/60 hover:bg-orange-100/50",
  거절: "bg-rose-50/60 hover:bg-rose-100/50",
};

export default function ContactTab() {
  const { state, dispatch, loadInstructors, loadStats } = useOutreach();
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [wavesMap, setWavesMap] = useState<Record<string, OutreachWave[]>>({});
  const [editingWave, setEditingWave] = useState<{ instructorId: string; wave: number; x: number; y: number } | null>(null);
  const [editingStatus, setEditingStatus] = useState<{ instructor: Instructor; x: number; y: number } | null>(null);
  const [editingFinal, setEditingFinal] = useState<{ instructor: Instructor; x: number; y: number } | null>(null);
  const [editingSendMethod, setEditingSendMethod] = useState<{ instructor: Instructor; x: number; y: number } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWaveNum, setBulkWaveNum] = useState("1");
  const [bulkDate, setBulkDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [bulkResult, setBulkResult] = useState("무응답");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<InstructorStatus | "">("");
  const [bulkStatusReason, setBulkStatusReason] = useState("");
  const [bulkStatusLoading, setBulkStatusLoading] = useState(false);
  const [waveFilters, setWaveFilters] = useState<Record<number, WaveFilterKey>>({});
  const [sendMethodFilter, setSendMethodFilter] = useState<SendMethodFilter>("");
  const [dateFilter, setDateFilter] = useState("");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, select: true });

  // 컨택 대상만 (발송 예정 / 진행 중 / 계약 완료), 연락 금지 제외
  const contactInstructors = useMemo(() =>
    state.instructors.filter((i) => !i.is_banned && CONTACT_STATUSES.includes(i.status as InstructorStatus)),
  [state.instructors]);

  const emailDupMap = useMemo(
    () => buildEmailDuplicateMap(state.instructors, state.youtubeChannels),
    [state.instructors, state.youtubeChannels],
  );

  const loadAllWaves = useCallback(async () => {
    if (contactInstructors.length === 0) return;
    try {
      const ids = contactInstructors.map((i) => i.id);
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
  }, [contactInstructors]);

  useEffect(() => { loadAllWaves(); }, [loadAllWaves]);

  // 응답 받았지만 사전 정보 없는 강사
  const noPreInfoCount = useMemo(() => contactInstructors.filter((i) => i.has_response && !i.pre_info).length, [contactInstructors]);

  // 체크필요 강사 (웨이브 결과가 체크필요이거나, 발송일 있고 결과 미입력)
  const checkNeededIds = useMemo(() => {
    const ids = new Set<string>();
    for (const inst of contactInstructors) {
      const waves = wavesMap[inst.id] || [];
      for (const w of waves) {
        if (w.result === "체크필요" || (!w.result && w.sent_date)) {
          ids.add(inst.id);
          break;
        }
      }
    }
    return ids;
  }, [contactInstructors, wavesMap]);

  const filtered = useMemo(() => {
    let list = contactInstructors;
    if (viewFilter === "no_preinfo") list = list.filter((i) => i.has_response && !i.pre_info);
    else if (viewFilter === "check_needed") list = list.filter((i) => checkNeededIds.has(i.id));
    else if (viewFilter !== "all") list = list.filter((i) => i.status === viewFilter);
    if (search) {
      const q = search.toLowerCase().replace(/\s/g, "");
      const strip = (s?: string) => s?.toLowerCase().replace(/\s/g, "") || "";
      list = list.filter((i) => strip(i.name).includes(q) || strip(i.field).includes(q) || strip(i.email).includes(q));
    }
    if (sendMethodFilter === "기타") {
      list = list.filter((i) => !!i.send_method && i.send_method !== "DM" && i.send_method !== "이메일");
    } else if (sendMethodFilter) {
      list = list.filter((i) => i.send_method === sendMethodFilter);
    }
    if (dateFilter) {
      list = list.filter((i) => (wavesMap[i.id] || []).some((w) => w.sent_date === dateFilter));
    }
    const waveDateMatch = sortKey ? /^wave([123])_date$/.exec(sortKey) : null;
    let sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (waveDateMatch) {
        const wn = Number(waveDateMatch[1]);
        const da = (wavesMap[a.id] || []).find((w) => w.wave_number === wn)?.sent_date || "";
        const db = (wavesMap[b.id] || []).find((w) => w.wave_number === wn)?.sent_date || "";
        // 빈 값은 항상 뒤로
        if (!da && !db) cmp = 0;
        else if (!da) return 1;
        else if (!db) return -1;
        else cmp = da.localeCompare(db);
      } else if (sortKey) {
        const av = (a[sortKey as keyof Instructor] || "") as string;
        const bv = (b[sortKey as keyof Instructor] || "") as string;
        cmp = av.localeCompare(bv, "ko");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    // 기타 필터: 같은 send_method 문자열끼리 인접하게 그룹 정렬 (Array.sort stable이라 그룹 내 기존 순서는 유지)
    if (sendMethodFilter === "기타") {
      sorted.sort((a, b) => (a.send_method || "").localeCompare(b.send_method || "", "ko"));
    }

    // 웨이브 상태 필터 (차수별 AND)
    const activeWaves = (Object.entries(waveFilters) as [string, WaveFilterKey][])
      .filter(([, k]) => k && k !== "none")
      .map(([w, k]) => [Number(w), k] as [number, WaveFilterKey]);
    if (activeWaves.length > 0) {
      sorted = sorted.filter((i) =>
        activeWaves.every(([wn, key]) => {
          const w = (wavesMap[i.id] || []).find((w) => w.wave_number === wn);
          if (key === "미입력") return !w || (!w.sent_date && !w.result);
          if (!w) return false;
          if (key === "체크필요") return !w.result || w.result === "체크필요";
          return w.result === key;
        }),
      );
      // 명시적 발송일 정렬이 없을 때만 활성 차수 기준 자동 정렬
      if (!waveDateMatch) {
        const primaryWave = Math.min(...activeWaves.map(([w]) => w));
        sorted.sort((a, b) => {
          const wa = (wavesMap[a.id] || []).find((w) => w.wave_number === primaryWave);
          const wb = (wavesMap[b.id] || []).find((w) => w.wave_number === primaryWave);
          const da = wa?.sent_date || "";
          const db = wb?.sent_date || "";
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return da.localeCompare(db);
        });
      }
    }

    return sorted;
  }, [contactInstructors, viewFilter, search, sortKey, sortDir, waveFilters, wavesMap, checkNeededIds, sendMethodFilter, dateFilter]);

  // 발송일이 있는 날짜 집합 (달력에 점 표시용)
  const datesWithWave = useMemo(() => {
    const set = new Set<string>();
    for (const waves of Object.values(wavesMap)) {
      for (const w of waves) if (w.sent_date) set.add(w.sent_date);
    }
    return set;
  }, [wavesMap]);

  useEffect(() => { setSelectedIds(new Set()); }, [viewFilter, search]);

  useEffect(() => {
    const end = () => { dragRef.current.active = false; };
    document.addEventListener("mouseup", end);
    return () => document.removeEventListener("mouseup", end);
  }, []);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });

  /* ── 개별 발송 저장 (응답여부 모달 저장) ── */
  const handleWaveSave = async (instructorId: string, waveNumber: number, data: { result: string; pre_info: string; meeting_type: string; contact_assignee: string; has_own_lecture: string; lecture_appeal: string; sns_over_10k: string; meeting_type_override: boolean }) => {
    try {
      const { pre_info, meeting_type, contact_assignee, has_own_lecture, lecture_appeal, sns_over_10k, meeting_type_override, result } = data;
      // 발송 기록 저장 (result만 업데이트, sent_date 등은 건드리지 않음)
      const res = await fetch(`/api/instructors/${instructorId}/waves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wave_number: waveNumber, result }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "저장 실패");
      // 사전 정보 + 미팅 방식 + 평가 데이터는 강사 테이블에 저장 (1~3차 공유)
      const inst = state.instructors.find(i => i.id === instructorId);
      const instructorUpdate = { pre_info, meeting_type, contact_assignee, has_own_lecture, lecture_appeal, sns_over_10k, meeting_type_override };
      const hasChanges = inst?.pre_info !== pre_info || inst?.meeting_type !== meeting_type || inst?.contact_assignee !== contact_assignee || inst?.has_own_lecture !== has_own_lecture || inst?.lecture_appeal !== lecture_appeal || inst?.sns_over_10k !== sns_over_10k || inst?.meeting_type_override !== meeting_type_override;
      if (hasChanges) {
        const r2 = await fetch(`/api/instructors/${instructorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(instructorUpdate),
        });
        if (r2.ok) dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await r2.json() });
      }
      await loadAllWaves();
      toast.success(`${waveNumber}차 발송 저장 완료`);
      setEditingWave(null);
    } catch (e: any) { toast.error(e.message); }
  };

  /* ── 개별 발송 삭제 ── */
  const handleWaveDelete = async (instructorId: string, waveNumber: number) => {
    try {
      const res = await fetch(`/api/instructors/${instructorId}/waves`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wave_number: waveNumber }),
      });
      if (!res.ok) throw new Error("삭제 실패");
      await loadAllWaves();
      toast.success(`${waveNumber}차 발송 기록 삭제`);
      setEditingWave(null);
    } catch (e: any) { toast.error(e.message); }
  };

  /* ── 개별 상태 변경 ── */
  const handleStatusChange = async (instructorId: string, newStatus: InstructorStatus, reason: string) => {
    try {
      const inst = state.instructors.find(i => i.id === instructorId);
      const body: any = { status: newStatus, _changed_by: inst?.assignee || "", _reason: reason };
      if (newStatus === "컨펌 필요") body.confirm_reason = reason;
      if (requiresReason(newStatus)) body.exclude_reason = reason;
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

  /* ── 최종 상태 변경 ── */
  const handleFinalStatusChange = async (instructorId: string, finalStatus: string) => {
    try {
      const res = await fetch(`/api/instructors/${instructorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final_status: finalStatus }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = await res.json();
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: updated });
      toast.success(`최종 → ${finalStatus}`);
      setEditingFinal(null);
    } catch (e: any) { toast.error(e.message); }
  };

  /* ── 일괄 발송 기록 ── */
  const handleBulkWaveApply = async () => {
    if (selectedIds.size === 0) return;
    if (!bulkDate && !bulkResult) {
      toast.error("발송일·응답여부 중 하나는 선택하세요.");
      return;
    }
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const waveNum = parseInt(bulkWaveNum);
      const results = await Promise.all(ids.map(id =>
        fetch(`/api/instructors/${id}/waves`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wave_number: waveNum,
            sent_date: bulkDate || null,
            result: bulkResult || "",
          }),
        })
      ));
      const failed = results.filter(r => !r.ok).length;
      await loadAllWaves();
      if (failed > 0) {
        toast.error(`${failed}건 업데이트 실패 (${ids.length - failed}건만 반영됨)`);
      } else {
        toast.success(`${ids.length}명 ${bulkWaveNum}차 일괄 업데이트`);
      }
      setSelectedIds(new Set());
    } catch { toast.error("일괄 업데이트 실패"); }
    finally { setBulkLoading(false); }
  };

  /* ── 일괄 상태 변경 ── */
  const handleBulkStatusApply = async () => {
    if (selectedIds.size === 0 || !bulkStatus) return;
    if (requiresReason(bulkStatus) && !bulkStatusReason.trim()) {
      toast.error("사유를 입력하세요.");
      return;
    }
    setBulkStatusLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/instructors/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status: bulkStatus, reason: bulkStatusReason.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "실패");
      await Promise.all([loadInstructors(), loadStats()]);
      toast.success(`${ids.length}명 상태 → ${bulkStatus}`);
      setBulkStatus("");
      setBulkStatusReason("");
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkStatusLoading(false); }
  };

  /* ── 선택 / 드래그 / Shift 범위선택 ── */
  const lastClickedIdx = useRef<number | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(i => i.id)));
  };
  const handleCheckClick = (id: string, idx: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedIdx.current !== null) {
      // Shift+클릭: 범위 선택
      const start = Math.min(lastClickedIdx.current, idx);
      const end = Math.max(lastClickedIdx.current, idx);
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(filtered[i].id);
        return next;
      });
    } else {
      toggleSelect(id);
    }
    lastClickedIdx.current = idx;
  };
  const handleDragStart = (id: string, idx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.shiftKey) { handleCheckClick(id, idx, e); return; }
    e.preventDefault();
    const willSelect = !selectedIds.has(id);
    dragRef.current = { active: true, select: willSelect };
    lastClickedIdx.current = idx;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (willSelect) next.add(id); else next.delete(id);
      return next;
    });
  };
  const handleDragEnter = (id: string) => {
    if (!dragRef.current.active) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (dragRef.current.select) next.add(id); else next.delete(id);
      return next;
    });
  };

  // 3-스텝 사이클: 오름차순 → 내림차순 → 정렬 해제
  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); setSortDir("asc"); }
    } else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey, sortDir]);

  /* ── 헬퍼 ── */
  const cnt = (s: string) => contactInstructors.filter((i) => i.status === s).length;
  const getWave = (id: string, n: number) => (wavesMap[id] || []).find((w) => w.wave_number === n);

  const formatWave = (w: OutreachWave | undefined) => {
    if (!w || (!w.sent_date && !w.result)) return "-";
    return w.result || (w.sent_date ? "체크필요" : "-");
  };

  // 응답여부 pill 색 (배경+글자). null이면 pill 없이 텍스트만 표시
  const waveBadgeClass = (w: OutreachWave | undefined): string | null => {
    if (!w?.result) return null;
    if (w.result === "응답") return "bg-green-100 text-green-800";
    if (w.result === "거절") return "bg-red-100 text-red-700";
    if (w.result === "체크필요") return "bg-amber-100 text-amber-800";
    return null; // 무응답 등은 텍스트만
  };

  // 진행 도트 색 (차수별 발송/결과 상태)
  const waveDotColor = (w: OutreachWave | undefined) => {
    if (!w || (!w.sent_date && !w.result)) return "bg-gray-200";
    if (w.result === "응답") return "bg-green-500";
    if (w.result === "거절") return "bg-red-400";
    if (w.result === "체크필요") return "bg-amber-400";
    if (w.result === "무응답") return "bg-gray-400";
    if (w.sent_date) return "bg-amber-400";
    return "bg-gray-200";
  };

  // 발송 수단이 DM이면 2·3차 입력 잠금
  const isDMLocked = (inst: Instructor, wave: number) => wave >= 2 && inst.send_method === "DM";

  const handleCellClick = (e: React.MouseEvent, instructor: Instructor, wave: number) => {
    e.stopPropagation();
    if (isDMLocked(instructor, wave)) {
      toast.info("발송 수단이 DM인 강사는 2·3차 발송이 없습니다.");
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingWave({ instructorId: instructor.id, wave, x: rect.left, y: rect.bottom + 4 });
  };

  const handleStatusClick = (e: React.MouseEvent, instructor: Instructor) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingStatus({ instructor, x: rect.left, y: rect.bottom + 4 });
  };

  const handleFinalClick = (e: React.MouseEvent, instructor: Instructor) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingFinal({ instructor, x: rect.left, y: rect.bottom + 4 });
  };

  const handleSendMethodClick = (e: React.MouseEvent, instructor: Instructor) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingSendMethod({ instructor, x: rect.left, y: rect.bottom + 4 });
  };

  /* ── 발송 수단 변경 ── */
  const handleSendMethodChange = async (instructorId: string, method: string) => {
    try {
      const res = await fetch(`/api/instructors/${instructorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_method: method }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "저장 실패");
      const updated = await res.json();
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: updated });
      toast.success(`발송 수단 → ${method || "미선택"}`);
      setEditingSendMethod(null);
    } catch (e: any) { toast.error(e.message); }
  };

  /* ── 발송일 변경 (인라인 date picker) ── */
  const handleWaveDateChange = async (instructorId: string, waveNumber: number, date: string) => {
    try {
      const res = await fetch(`/api/instructors/${instructorId}/waves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wave_number: waveNumber, sent_date: date || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "저장 실패");
      await loadAllWaves();
      toast.success(`${waveNumber}차 발송일 저장`);
    } catch (e: any) { toast.error(e.message); }
  };

  const detailInstructor = detailId ? state.instructors.find(i => i.id === detailId) : null;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* ── 필터 영역 ── */}
      <div className="shrink-0 space-y-3 pb-3">
        <h2 className="text-lg font-semibold">컨택관리</h2>

        <div className="flex gap-2 flex-wrap">
          {([
            { key: "all" as ViewFilter, label: `전체 (${contactInstructors.length})`, active: "bg-gray-200 text-gray-900 border-gray-300", idle: "bg-gray-100 text-gray-600" },
            { key: "발송 예정" as ViewFilter, label: `발송 예정 (${cnt("발송 예정")})`, active: "bg-blue-200 text-blue-900 border-blue-400", idle: "bg-blue-50 text-blue-700 border-blue-200" },
            { key: "진행 중" as ViewFilter, label: `진행 중 (${cnt("진행 중")})`, active: "bg-indigo-200 text-indigo-900 border-indigo-400", idle: "bg-indigo-50 text-indigo-700 border-indigo-200" },
            { key: "보류" as ViewFilter, label: `보류 (${cnt("보류")})`, active: "bg-orange-200 text-orange-900 border-orange-400", idle: "bg-orange-50 text-orange-700 border-orange-200" },
            { key: "계약 완료" as ViewFilter, label: `계약 완료 (${cnt("계약 완료")})`, active: "bg-green-200 text-green-900 border-green-400", idle: "bg-green-50 text-green-700 border-green-200" },
            ...(checkNeededIds.size > 0 ? [{ key: "check_needed" as ViewFilter, label: `체크필요 (${checkNeededIds.size})`, active: "bg-amber-200 text-amber-900 border-amber-400", idle: "bg-amber-50 text-amber-700 border-amber-200" }] : []),
            ...(noPreInfoCount > 0 ? [{ key: "no_preinfo" as ViewFilter, label: `사전 정보 미입력 (${noPreInfoCount})`, active: "bg-red-200 text-red-900 border-red-400", idle: "bg-red-50 text-red-700 border-red-200" }] : []),
          ]).map((f) => (
            <button
              key={f.key}
              onClick={() => setViewFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                viewFilter === f.key ? f.active : f.idle
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="이름, 분야, 이메일..." className="h-8 text-sm pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="text-sm text-muted-foreground">{filtered.length}명</span>
          <Button size="sm" variant="outline" className="h-8 text-sm" onClick={() => {
            const rows = filtered.map(i => {
              const w1 = getWave(i.id, 1);
              const w2 = getWave(i.id, 2);
              const w3 = getWave(i.id, 3);
              return {
                "이름": i.name,
                "상태": i.status,
                "분야": i.field || "",
                "이메일": i.email || "",
                "발송 수단": i.send_method || "",
                "1차 발송일": w1?.sent_date || "",
                "1차 응답여부": w1?.result || "",
                "2차 발송일": w2?.sent_date || "",
                "2차 응답여부": w2?.result || "",
                "3차 발송일": w3?.sent_date || "",
                "3차 응답여부": w3?.result || "",
                "최종": i.final_status || "",
              };
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "컨택관리");
            XLSX.writeFile(wb, `컨택관리_${new Date().toISOString().slice(0,10)}.xlsx`);
            toast.success(`${rows.length}건 엑셀 다운로드`);
          }}>
            <Download className="h-3.5 w-3.5 mr-1.5" />엑셀
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-sm" onClick={() => setBulkEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />일괄 수정
          </Button>
          {/* 날짜 필터 */}
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              className={`h-8 text-sm ${dateFilter ? "text-primary border-primary" : ""}`}
              onClick={() => setDateFilterOpen((v) => !v)}
            >
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {dateFilter
                ? (() => { const p = dateFilter.split("-"); return `${parseInt(p[1])}/${parseInt(p[2])}`; })()
                : "날짜"}
            </Button>
            {dateFilterOpen && (
              <DateFilterPopover
                selected={dateFilter}
                onSelect={(d) => { setDateFilter(d); if (d) setDateFilterOpen(false); }}
                onClose={() => setDateFilterOpen(false)}
                datesWithData={datesWithWave}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── 테이블 ── */}
      <div ref={scrollRef} className="border rounded flex-1 min-h-0 overflow-auto">
        {/* 헤더 (2단 구조: 상단 그룹 / 하단 발송일·응답여부) */}
        <div
          className="sticky top-0 z-10 grid items-stretch bg-[#f8f9fa] border-b text-xs font-semibold text-muted-foreground select-none"
          style={{ gridTemplateColumns: GRID, minWidth: MIN_W }}
        >
          <div className="row-span-2 px-1 flex justify-center items-center cursor-pointer border-r border-gray-200" onClick={toggleSelectAll}>
            <input type="checkbox" className="h-3.5 w-3.5 rounded accent-primary pointer-events-none"
              checked={selectedIds.size === filtered.length && filtered.length > 0} readOnly />
          </div>
          <SortHeader label="이름" col="name" sk={sortKey} sd={sortDir} onSort={handleSort} extraClass="row-span-2" />
          <SortHeader label="상태" col="status" sk={sortKey} sd={sortDir} onSort={handleSort} extraClass="row-span-2" />
          <div className="row-span-2 px-2 py-2.5 flex items-center justify-center border-r border-gray-200">진행</div>
          <SortHeader label="분야" col="field" sk={sortKey} sd={sortDir} onSort={handleSort} extraClass="row-span-2" />
          <SortHeader label="이메일" col="email" sk={sortKey} sd={sortDir} onSort={handleSort} extraClass="row-span-2" />
          <SendMethodHeader active={sendMethodFilter} onFilter={setSendMethodFilter} extraClass="row-span-2 border-r-2 border-r-gray-300" />
          {/* 상단: 1차/2차/3차 그룹 헤더 */}
          {[1, 2, 3].map((n) => (
            <div
              key={`group-${n}`}
              className={`col-span-2 px-2 py-1 text-center border-b border-gray-200 ${n < 3 ? "border-r-2 border-r-gray-300" : ""}`}
            >
              {n}차
            </div>
          ))}
          {/* 하단: 발송일 / 응답여부 */}
          {[1, 2, 3].map((n) => {
            const dateCol = `wave${n}_date` as SortKey;
            const isLastGroup = n === 3;
            return (
              <div key={`sub-${n}`} className="contents">
                <SortHeader label="발송일" col={dateCol} sk={sortKey} sd={sortDir} onSort={handleSort} center />
                <WaveHeader
                  wave={n}
                  label="응답여부"
                  active={waveFilters[n] || "none"}
                  extraClass={!isLastGroup ? "border-r-2 border-r-gray-300" : ""}
                  onFilter={(key) => setWaveFilters(prev => {
                    const next = { ...prev };
                    if (key === "none" || prev[n] === key) delete next[n];
                    else next[n] = key;
                    return next;
                  })}
                />
              </div>
            );
          })}
        </div>

        {/* 본문 */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">해당하는 강사가 없습니다.</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", minWidth: MIN_W }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const i = filtered[vRow.index];
              const isSelected = selectedIds.has(i.id);
              const rowBg = isSelected ? "bg-blue-100/70" : (vRow.index % 2 === 0 ? "bg-white" : "bg-slate-100");
              return (
                <div
                  key={i.id}
                  className={`grid items-center border-b text-sm transition-colors ${rowBg}`}
                  style={{
                    position: "absolute", top: 0, left: 0, right: 0,
                    height: ROW_H,
                    gridTemplateColumns: GRID,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  onMouseEnter={() => handleDragEnter(i.id)}
                >
                  {/* 체크박스 */}
                  <div className="px-1 flex justify-center cursor-pointer border-r border-gray-200/60"
                       onMouseDown={(e) => handleDragStart(i.id, vRow.index, e)}>
                    <input type="checkbox" className="h-3.5 w-3.5 rounded accent-primary pointer-events-none"
                      checked={isSelected} readOnly />
                  </div>
                  {/* 이름 */}
                  <div
                    className="px-3 font-medium cursor-pointer hover:underline truncate border-r border-gray-200/60 flex items-center gap-1"
                    title={i.name}
                    onClick={() => setDetailId(i.id)}
                  >
                    {i.name}
                    {i.has_response && !i.pre_info && (
                      <span className="shrink-0 h-2 w-2 rounded-full bg-red-500" title="사전 정보 미입력" />
                    )}
                  </div>
                  {/* 상태 */}
                  <div className="px-2 cursor-pointer border-r border-gray-200/60" onClick={(e) => handleStatusClick(e, i)}>
                    <Badge className={`text-xs px-1.5 py-0 whitespace-nowrap cursor-pointer hover:ring-2 hover:ring-primary/30 transition ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>
                      {i.status}
                    </Badge>
                  </div>
                  {/* 진행 (차수별 도트) */}
                  <div className="px-2 flex items-center justify-center gap-1.5 border-r border-gray-200/60">
                    {[1, 2, 3].map((n) => (
                      <span
                        key={n}
                        className={`h-3 w-3 rounded-full ${waveDotColor(getWave(i.id, n))}`}
                        title={`${n}차: ${getWave(i.id, n)?.result || (getWave(i.id, n)?.sent_date ? "체크필요" : "미발송")}`}
                      />
                    ))}
                  </div>
                  {/* 분야 */}
                  <div className="px-2 text-muted-foreground truncate border-r border-gray-200/60" title={i.field || ""}>{i.field || ""}</div>
                  {/* 이메일 */}
                  <div className="px-2 border-r border-gray-200/60 text-xs flex items-center gap-1 overflow-hidden" title={i.email || ""}>
                    {(() => {
                      const k = i.email?.trim().toLowerCase();
                      const owners = k ? emailDupMap.get(k) : undefined;
                      const others = owners?.filter((o) => o.id !== i.id) ?? [];
                      if (others.length === 0) return null;
                      return (
                        <span
                          className="shrink-0 inline-flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
                          aria-label="이메일 중복"
                          title={`이메일 중복:\n${others.map((o) => `· ${o.label} | ${o.status || "상태없음"}`).join("\n")}`}
                        >
                          !
                        </span>
                      );
                    })()}
                    <span className="text-muted-foreground truncate">{i.email || ""}</span>
                  </div>
                  {/* 발송 수단 */}
                  <div
                    className="self-stretch px-2 flex items-center justify-center cursor-pointer hover:bg-gray-100/60 border-r-2 border-r-gray-300"
                    onClick={(e) => handleSendMethodClick(e, i)}
                    title={i.send_method || "미선택"}
                  >
                    {i.send_method ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        i.send_method === "DM" ? "bg-purple-100 text-purple-700" :
                        i.send_method === "이메일" ? "bg-blue-100 text-blue-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {i.send_method}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </div>
                  {/* 1/2/3차 발송일 + 응답여부 */}
                  {[1, 2, 3].map((n) => {
                    const w = getWave(i.id, n);
                    const responseText = formatWave(w);
                    const dateDisplay = w?.sent_date
                      ? (() => { const p = w.sent_date.split("-"); return `${parseInt(p[1])}/${parseInt(p[2])}`; })()
                      : "-";
                    const locked = isDMLocked(i, n);
                    return (
                      <div key={n} className="contents">
                                                {/* 발송일 (인라인 date picker, DM 잠금 시 비활성) */}
                        {locked ? (
                          <div
                            className="self-stretch border-r border-gray-200/60 bg-gray-200 cursor-not-allowed"
                            title="발송 수단 DM — 2·3차 발송 없음"
                          />
                        ) : (
                          <div
                            className="relative self-stretch px-1 flex items-center justify-center border-r border-gray-200/60 cursor-pointer hover:bg-gray-100/60"
                            onClick={(e) => {
                              e.stopPropagation();
                              const input = e.currentTarget.querySelector('input[type="date"]') as HTMLInputElement | null;
                              if (!input) return;
                              if (typeof input.showPicker === "function") {
                                try { input.showPicker(); return; } catch {}
                              }
                              input.focus();
                              input.click();
                            }}
                          >
                            <input
                              type="date"
                              className="sr-only"
                              value={w?.sent_date || ""}
                              onChange={(e) => handleWaveDateChange(i.id, n, e.target.value)}
                              aria-label={`${n}차 발송일`}
                            />
                            <span className={`text-sm whitespace-nowrap ${w?.sent_date ? "text-foreground font-medium" : "text-gray-300"}`}>
                              {dateDisplay}
                            </span>
                          </div>
                        )}
                        {/* 응답여부 (모달 트리거, DM 잠금 시 비활성) */}
                        {(() => {
                          const borderClass = n < 3 ? "border-r-2 border-r-gray-300" : "border-r border-gray-200/60";
                          const badge = waveBadgeClass(w);
                          return locked ? (
                            <div
                              className={`self-stretch bg-gray-200 cursor-not-allowed ${borderClass}`}
                              title="발송 수단 DM — 2·3차 발송 없음"
                            />
                          ) : (
                            <div
                              className={`self-stretch px-2 flex items-center justify-center cursor-pointer hover:bg-gray-100/60 ${borderClass}`}
                              onClick={(e) => handleCellClick(e, i, n)}
                            >
                              {badge ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>
                                  {responseText}
                                </span>
                              ) : (
                                <span className={`text-sm whitespace-nowrap ${responseText === "-" ? "text-gray-300" : "text-muted-foreground"}`}>
                                  {responseText}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 일괄 작업 바 ── */}
      {selectedIds.size > 0 && (
        <div className="shrink-0 border-t bg-muted/30 px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold whitespace-nowrap">{selectedIds.size}명 선택</span>
          <div className="h-4 w-px bg-border" />
          <Select value={bulkWaveNum} onValueChange={setBulkWaveNum}>
            <SelectTrigger className="w-[76px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1차</SelectItem>
              <SelectItem value="2">2차</SelectItem>
              <SelectItem value="3">3차</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" className="w-[148px] h-8 text-sm" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
          <Select value={bulkResult} onValueChange={setBulkResult}>
            <SelectTrigger className="w-[96px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WAVE_RESULTS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-sm" onClick={handleBulkWaveApply} disabled={bulkLoading}>
            {bulkLoading ? "처리 중..." : "일괄 적용"}
          </Button>
          <div className="h-4 w-px bg-border" />
          <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as InstructorStatus)}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <span className="text-muted-foreground">상태:</span>
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {bulkStatus && requiresReason(bulkStatus) && (
            <Input
              className="w-[160px] h-8 text-sm"
              placeholder="사유 입력"
              value={bulkStatusReason}
              onChange={(e) => setBulkStatusReason(e.target.value)}
            />
          )}
          <Button size="sm" className="h-8 text-sm" onClick={handleBulkStatusApply} disabled={!bulkStatus || bulkStatusLoading}>
            {bulkStatusLoading ? "처리 중..." : "상태 변경"}
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button
            size="sm"
            className="h-8 text-sm bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => setSendEmailOpen(true)}
          >
            <Mail className="h-3.5 w-3.5 mr-1.5" />메일 자동 발송
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-sm" onClick={() => {
            const emails = Array.from(selectedIds)
              .map(id => state.instructors.find(i => i.id === id)?.email)
              .filter(Boolean)
              .join("\n");
            if (!emails) { toast.error("이메일이 없습니다"); return; }
            navigator.clipboard.writeText(emails);
            toast.success(`${emails.split("\n").length}개 이메일 복사됨`);
          }}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />이메일 복사
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="h-8 text-sm text-muted-foreground" onClick={() => setSelectedIds(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

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

      {/* ── 발송 편집 모달 ── */}
      {editingWave && (
        <WaveModal
          wave={getWave(editingWave.instructorId, editingWave.wave)}
          waveNumber={editingWave.wave}
          preInfo={state.instructors.find(i => i.id === editingWave.instructorId)?.pre_info || ""}
          meetingType={state.instructors.find(i => i.id === editingWave.instructorId)?.meeting_type || ""}
          contactAssignee={state.instructors.find(i => i.id === editingWave.instructorId)?.contact_assignee || ""}
          hasOwnLecture={state.instructors.find(i => i.id === editingWave.instructorId)?.has_own_lecture || ""}
          lectureAppeal={state.instructors.find(i => i.id === editingWave.instructorId)?.lecture_appeal || ""}
          snsOver10k={state.instructors.find(i => i.id === editingWave.instructorId)?.sns_over_10k || ""}
          meetingTypeOverride={state.instructors.find(i => i.id === editingWave.instructorId)?.meeting_type_override || false}
          onSave={(data) => handleWaveSave(editingWave.instructorId, editingWave.wave, data)}
          onDelete={() => handleWaveDelete(editingWave.instructorId, editingWave.wave)}
          onClose={() => setEditingWave(null)}
        />
      )}

      {/* ── 최종 상태 팝오버 ── */}
      {editingFinal && (
        <FinalStatusPopover
          instructor={editingFinal.instructor}
          x={editingFinal.x}
          y={editingFinal.y}
          onSelect={handleFinalStatusChange}
          onClose={() => setEditingFinal(null)}
        />
      )}

      {/* ── 발송 수단 팝오버 ── */}
      {editingSendMethod && (
        <SendMethodPopover
          instructor={editingSendMethod.instructor}
          x={editingSendMethod.x}
          y={editingSendMethod.y}
          onSelect={handleSendMethodChange}
          onClose={() => setEditingSendMethod(null)}
        />
      )}

      {/* ── 이메일 기반 일괄 수정 모달 ── */}
      {bulkEditOpen && (
        <BulkEditByEmailModal
          instructors={contactInstructors}
          wavesMap={wavesMap}
          onApply={async (ids, waveNum, date, result, contactAssignee) => {
            const wavePending = (date || result)
              ? Promise.all(ids.map(id => {
                  const existing = (wavesMap[id] || []).find(w => w.wave_number === waveNum);
                  return fetch(`/api/instructors/${id}/waves`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      wave_number: waveNum,
                      sent_date: date || existing?.sent_date || null,
                      result: result || existing?.result || "",
                    }),
                  });
                }))
              : Promise.resolve();
            const assigneePending = contactAssignee
              ? Promise.all(ids.map(async (id) => {
                  const r = await fetch(`/api/instructors/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contact_assignee: contactAssignee }),
                  });
                  if (r.ok) dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await r.json() });
                }))
              : Promise.resolve();
            await Promise.all([wavePending, assigneePending]);
            if (date || result) await loadAllWaves();
          }}
          onClose={() => setBulkEditOpen(false)}
        />
      )}

      {/* ── 강사 상세 패널 (컨택관리 내) ── */}
      {detailInstructor && (
        <InstructorDetail
          instructor={detailInstructor}
          onClose={() => setDetailId(null)}
        />
      )}

      {/* ── 이메일 자동 발송 모달 ── */}
      <SendEmailModal
        open={sendEmailOpen}
        onClose={() => setSendEmailOpen(false)}
        selectedIds={selectedIds}
        instructors={state.instructors}
        wavesMap={wavesMap}
        onComplete={async () => {
          await Promise.all([loadInstructors(), loadAllWaves(), loadStats()]);
          setSelectedIds(new Set());
        }}
      />
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

  const handleSelect = async (status: InstructorStatus) => {
    if (requiresReason(status)) {
      setPendingStatus(status);
      return;
    }
    setSaving(true);
    await onConfirm(instructor.id, status, "");
    setSaving(false);
  };

  const handleReasonSubmit = async () => {
    if (!reason.trim()) { toast.error("사유를 입력하세요."); return; }
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
          {pendingStatus ? `${pendingStatus} 사유` : `${instructor.name} 상태 변경`}
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!pendingStatus ? (
        nextStatuses.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">변경 가능한 상태가 없습니다.</p>
        ) : (
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
        )
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="사유 입력..."
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
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPendingStatus(null)}>뒤로</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 발송 편집 팝오버 ── */
const SEND_METHODS = ["이메일", "DM"] as const;

// 평가 항목 기반 미팅 방식 자동 산출
function calculateMeetingType(hasLecture: string, appeal: string, sns: string): string {
  if (hasLecture === "O") {
    if (appeal === "높음") return "대면미팅";
    if (appeal === "낮음") return "줌미팅";
  }
  if (hasLecture === "X") {
    if (sns === "O") return "줌미팅";
    if (sns === "X") return "보류";
  }
  return "";
}

// 미팅 방식별 안내 문구
const MEETING_TYPE_DESCRIPTIONS: Record<string, string> = {
  "대면미팅": "핵심 조건 충족. 최우선 진행. → 본부장님 일정 조율 후 대면 미팅 세팅",
  "줌미팅": "가능성 있음. 검토 후 진행. → 줌 일정 조율. 미팅 후 대면 전환 여부 결정",
  "보류": "현재 조건 미충족. → 강사모집 탭 상태 \"보류\" 처리 후 대기",
};

function WaveModal({ wave, waveNumber, preInfo: initialPreInfo, meetingType: initialMeetingType, contactAssignee: initialContactAssignee, hasOwnLecture: initialHasOwnLecture, lectureAppeal: initialLectureAppeal, snsOver10k: initialSnsOver10k, meetingTypeOverride: initialOverride, onSave, onDelete, onClose }: {
  wave: OutreachWave | undefined;
  waveNumber: number;
  preInfo: string;
  meetingType: string;
  contactAssignee: string;
  hasOwnLecture: string;
  lectureAppeal: string;
  snsOver10k: string;
  meetingTypeOverride: boolean;
  onSave: (data: { result: string; pre_info: string; meeting_type: string; contact_assignee: string; has_own_lecture: string; lecture_appeal: string; sns_over_10k: string; meeting_type_override: boolean }) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [result, setResult] = useState(wave?.result || "");
  const [preInfo, setPreInfo] = useState(initialPreInfo);
  const [meetingType, setMeetingType] = useState(initialMeetingType);
  const [contactAssignee, setContactAssignee] = useState(initialContactAssignee);
  const [hasOwnLecture, setHasOwnLecture] = useState(initialHasOwnLecture);
  const [lectureAppeal, setLectureAppeal] = useState(initialLectureAppeal);
  const [snsOver10k, setSnsOver10k] = useState(initialSnsOver10k);
  const [isOverride, setIsOverride] = useState(initialOverride);
  const [saving, setSaving] = useState(false);

  // 평가 입력 변경 시 자동 산출
  const autoMeetingType = calculateMeetingType(hasOwnLecture, lectureAppeal, snsOver10k);

  // 강의 X 선택 시 매력도 초기화
  const handleLectureChange = (value: string) => {
    setHasOwnLecture(hasOwnLecture === value ? "" : value);
    if (value === "X" || (hasOwnLecture === "O" && value === "O")) {
      setLectureAppeal("");
    }
    setIsOverride(false);
  };

  // 평가 항목 변경 시 오버라이드 해제 + 자동 반영
  useEffect(() => {
    if (!isOverride && autoMeetingType) {
      setMeetingType(autoMeetingType);
    }
  }, [autoMeetingType, isOverride]);

  // 미팅 방식 수동 변경
  const handleMeetingTypeManual = (type: string) => {
    if (meetingType === type) {
      setMeetingType("");
      setIsOverride(false);
    } else {
      setMeetingType(type);
      setIsOverride(type !== autoMeetingType);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave({ result: result || "체크필요", pre_info: preInfo, meeting_type: meetingType, contact_assignee: contactAssignee, has_own_lecture: hasOwnLecture, lecture_appeal: lectureAppeal, sns_over_10k: snsOver10k, meeting_type_override: isOverride });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg w-[820px] max-h-[90vh] p-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="text-base font-semibold">{waveNumber}차 발송</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-6 flex-1 min-h-0">
          {/* ── 왼쪽: 결과 + 담당자 + 평가 ── */}
          <div className="w-[380px] space-y-4 overflow-y-auto pr-1">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">결과</label>
              <Select value={result || "체크필요"} onValueChange={setResult}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAVE_RESULTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">담당자</label>
              <div className="flex gap-2">
                {(["정승희", "김보성"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setContactAssignee(contactAssignee === a ? "" : a)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      contactAssignee === a
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-white text-muted-foreground border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* ── 강사 평가 ── */}
            <div className="border rounded-lg p-3 space-y-3 bg-gray-50/50">
              <label className="text-xs font-semibold text-foreground block">강사 평가</label>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">① 자체 강의 보유</label>
                <div className="flex gap-2">
                  {(["O", "X"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => handleLectureChange(v)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        hasOwnLecture === v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white text-muted-foreground border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">② 강의 매력도 (핏크닉과의 핏)</label>
                <div className="flex gap-2">
                  {(["높음", "낮음"] as const).map((v) => (
                    <button
                      key={v}
                      disabled={hasOwnLecture !== "O"}
                      onClick={() => { setLectureAppeal(lectureAppeal === v ? "" : v); setIsOverride(false); }}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        hasOwnLecture !== "O"
                          ? "bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed"
                          : lectureAppeal === v
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-white text-muted-foreground border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                  {hasOwnLecture === "X" && (
                    <span className="text-xs text-muted-foreground self-center ml-1">강의 X → 비활성</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">③ SNS 팔로워 1만 이상</label>
                <div className="flex gap-2">
                  {(["O", "X"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => { setSnsOver10k(snsOver10k === v ? "" : v); setIsOverride(false); }}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        snsOver10k === v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white text-muted-foreground border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 미팅 방식 (자동 산출 + 수동 변경) ── */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs text-muted-foreground block">미팅 방식</label>
                {autoMeetingType && !isOverride && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">자동</span>
                )}
                {isOverride && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">수동 변경</span>
                )}
              </div>
              <div className="flex gap-2">
                {(["줌미팅", "대면미팅", "보류"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => handleMeetingTypeManual(t)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      meetingType === t
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
              {meetingType && MEETING_TYPE_DESCRIPTIONS[meetingType] && (
                <p className="text-xs text-muted-foreground mt-1.5">{MEETING_TYPE_DESCRIPTIONS[meetingType]}</p>
              )}
            </div>
          </div>

          {/* ── 오른쪽: 사전 정보 ── */}
          <div className="flex-1 flex flex-col min-w-0">
            <label className="text-xs text-muted-foreground mb-1 block">사전 정보</label>
            <textarea
              className="w-full flex-1 border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="강사에 대한 사전 정보나 메모..."
              value={preInfo}
              onChange={(e) => setPreInfo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <Button size="sm" className="h-9 text-sm flex-1" onClick={handleSubmit} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
          {wave && (
            <Button size="sm" variant="outline" className="h-9 text-sm text-red-500 hover:text-red-600" onClick={onDelete}>
              삭제
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-9 text-sm" onClick={onClose}>취소</Button>
        </div>
      </div>
    </div>
  );
}

/* ── 최종 상태 팝오버 ── */
const FINAL_COLORS: Record<string, string> = {
  "진행 중": "bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
  "미팅 완료": "bg-purple-50 text-purple-700 hover:bg-purple-100",
  "계약 완료": "bg-green-50 text-green-700 hover:bg-green-100",
  보류: "bg-orange-50 text-orange-700 hover:bg-orange-100",
  거절: "bg-red-50 text-red-700 hover:bg-red-100",
};

function FinalStatusPopover({ instructor, x, y, onSelect, onClose }: {
  instructor: Instructor;
  x: number; y: number;
  onSelect: (id: string, status: string) => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const popW = 160;
  const popH = FINAL_STATUSES.length * 36 + 48;
  const adjustedX = Math.min(x, window.innerWidth - popW - 16);
  const adjustedY = y + popH > window.innerHeight ? y - popH - 8 : y;

  const handleClick = async (status: string) => {
    setSaving(true);
    await onSelect(instructor.id, status);
    setSaving(false);
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border rounded-lg shadow-lg p-2 space-y-1"
      style={{ left: adjustedX, top: adjustedY, width: popW }}
    >
      <p className="text-xs font-semibold text-muted-foreground px-2 py-1">최종 상태</p>
      {instructor.final_status && (
        <button
          onClick={() => handleClick("")}
          disabled={saving}
          className="w-full text-left px-3 py-1.5 rounded text-sm text-muted-foreground hover:bg-gray-100 transition-colors"
        >
          초기화
        </button>
      )}
      {FINAL_STATUSES.map((s) => (
        <button
          key={s}
          onClick={() => handleClick(s)}
          disabled={saving}
          className={`w-full text-left px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            instructor.final_status === s ? "ring-2 ring-primary/40" : ""
          } ${FINAL_COLORS[s] || ""}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/* ── 날짜 필터 팝오버 (발송일 기반) ── */
function fmtDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function DateFilterPopover({ selected, onSelect, onClose, datesWithData }: {
  selected: string;
  onSelect: (date: string) => void;
  onClose: () => void;
  datesWithData: Set<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const initial = selected ? new Date(selected) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: { date: string; inMonth: boolean; day: number }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(viewYear, viewMonth, -i);
    cells.push({ date: fmtDateYmd(d), inMonth: false, day: d.getDate() });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(viewYear, viewMonth, i);
    cells.push({ date: fmtDateYmd(d), inMonth: true, day: i });
  }
  while (cells.length < 42) {
    const last = new Date(cells[cells.length - 1].date);
    last.setDate(last.getDate() + 1);
    cells.push({ date: fmtDateYmd(last), inMonth: false, day: last.getDate() });
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const today = fmtDateYmd(new Date());

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-1 z-50 bg-white border rounded-lg shadow-lg p-3 w-72"
    >
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{viewYear}년 {viewMonth + 1}월</span>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] mb-1 text-muted-foreground">
        {["일","월","화","수","목","금","토"].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c, idx) => {
          const hasData = datesWithData.has(c.date);
          const isSelected = selected === c.date;
          const isToday = today === c.date;
          return (
            <button
              key={idx}
              onClick={() => onSelect(isSelected ? "" : c.date)}
              disabled={!c.inMonth && !hasData}
              className={`relative aspect-square rounded text-xs flex items-center justify-center transition ${
                isSelected
                  ? "bg-primary text-primary-foreground font-semibold"
                  : !c.inMonth
                  ? "text-gray-300 hover:bg-gray-50"
                  : hasData
                  ? "bg-blue-50 text-blue-700 font-medium hover:bg-blue-100"
                  : isToday
                  ? "ring-1 ring-primary/40 hover:bg-gray-100"
                  : "hover:bg-gray-100"
              }`}
            >
              {c.day}
              {hasData && !isSelected && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {selected
            ? `${selected} 선택됨`
            : `발송일 ${datesWithData.size}개`}
        </span>
        {selected && (
          <button
            onClick={() => { onSelect(""); onClose(); }}
            className="text-primary hover:underline"
          >
            해제
          </button>
        )}
      </div>
    </div>
  );
}

/* ── 발송 수단 팝오버 ── */
function SendMethodPopover({ instructor, x, y, onSelect, onClose }: {
  instructor: Instructor;
  x: number; y: number;
  onSelect: (id: string, method: string) => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // 현재 send_method가 DM/이메일/빈값이 아니면 기타로 간주
  const isCurrentOther = !!instructor.send_method && !SEND_METHODS.includes(instructor.send_method as any);
  const [otherMode, setOtherMode] = useState(isCurrentOther);
  const [otherText, setOtherText] = useState(isCurrentOther ? instructor.send_method : "");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const popW = 180;
  const popH = (SEND_METHODS.length + 1) * 36 + 48 + (otherMode ? 80 : 0);
  const adjustedX = Math.min(x, window.innerWidth - popW - 16);
  const adjustedY = y + popH > window.innerHeight ? y - popH - 8 : y;

  const handleClick = async (method: string) => {
    setSaving(true);
    await onSelect(instructor.id, method);
    setSaving(false);
  };

  const handleOtherSubmit = async () => {
    const v = otherText.trim();
    if (!v) return;
    setSaving(true);
    await onSelect(instructor.id, v);
    setSaving(false);
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border rounded-lg shadow-lg p-2 space-y-1"
      style={{ left: adjustedX, top: adjustedY, width: popW }}
    >
      <p className="text-xs font-semibold text-muted-foreground px-2 py-1">발송 수단</p>
      {instructor.send_method && (
        <button
          onClick={() => handleClick("")}
          disabled={saving}
          className="w-full text-left px-3 py-1.5 rounded text-sm text-muted-foreground hover:bg-gray-100 transition-colors"
        >
          초기화
        </button>
      )}
      {SEND_METHODS.map((m) => (
        <button
          key={m}
          onClick={() => { setOtherMode(false); handleClick(m); }}
          disabled={saving}
          className={`w-full text-left px-3 py-1.5 rounded text-sm font-medium transition-colors hover:bg-gray-100 ${
            instructor.send_method === m ? "ring-2 ring-primary/40 bg-primary/5" : ""
          }`}
        >
          {m}
        </button>
      ))}
      <button
        onClick={() => setOtherMode((v) => !v)}
        disabled={saving}
        className={`w-full text-left px-3 py-1.5 rounded text-sm font-medium transition-colors hover:bg-gray-100 ${
          isCurrentOther ? "ring-2 ring-primary/40 bg-primary/5" : ""
        }`}
      >
        기타{isCurrentOther && !otherMode ? ` (${instructor.send_method})` : ""}
      </button>
      {otherMode && (
        <div className="px-2 pt-1 pb-2 space-y-1.5">
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleOtherSubmit(); }}
            placeholder="발송 수단 입력"
            autoFocus
            className="w-full h-7 px-2 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleOtherSubmit}
            disabled={saving || !otherText.trim()}
            className="w-full h-7 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            저장
          </button>
        </div>
      )}
    </div>
  );
}

/* ── 정렬 헤더 셀 ── */
function SortHeader({ label, col, sk, sd, onSort, last, center, extraClass }: {
  label: string; col: SortKey; sk: SortKey | null; sd: SortDir;
  onSort: (k: SortKey) => void; last?: boolean; center?: boolean; extraClass?: string;
}) {
  const active = sk === col;
  return (
    <div
      className={`px-2 py-2.5 whitespace-nowrap flex items-center cursor-pointer hover:bg-gray-200/50 ${center ? "justify-center" : ""} ${!last ? "border-r border-gray-200" : ""} ${active ? "text-primary font-bold" : ""} ${extraClass || ""}`}
      onClick={() => onSort(col)}
    >
      {label}
      {active && (sd === "asc" ? <ChevronUp className="h-3.5 w-3.5 ml-0.5" /> : <ChevronDown className="h-3.5 w-3.5 ml-0.5" />)}
    </div>
  );
}

/* ── 발송 수단 헤더 (DM/이메일/기타 필터) ── */
function SendMethodHeader({ active, onFilter, extraClass }: {
  active: SendMethodFilter;
  onFilter: (v: SendMethodFilter) => void;
  extraClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={`relative border-r border-gray-200 ${extraClass || ""}`} ref={ref}>
      <div
        className={`h-full px-2 py-2.5 text-center cursor-pointer hover:bg-gray-200/50 flex items-center justify-center gap-1 ${active ? "text-primary font-bold" : ""}`}
        onClick={() => setOpen(!open)}
      >
        발송 수단
        {active && <ChevronDown className="h-3 w-3" />}
      </div>
      {open && (
        <div className="absolute top-full left-0 z-20 bg-white border rounded-md shadow-lg py-1 min-w-[100px]">
          {(["DM", "이메일", "기타"] as const).map((m) => (
            <button
              key={m}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 ${active === m ? "text-primary font-semibold bg-primary/5" : ""}`}
              onClick={() => { onFilter(active === m ? "" : m); setOpen(false); }}
            >
              {m}
            </button>
          ))}
          {active && (
            <>
              <div className="border-t my-1" />
              <button
                className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-gray-100"
                onClick={() => { onFilter(""); setOpen(false); }}
              >
                필터 해제
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 웨이브 헤더 (상태 필터) ── */
function WaveHeader({ wave, active, onFilter, label, extraClass }: {
  wave: number;
  active: WaveFilterKey;
  onFilter: (key: WaveFilterKey) => void;
  label?: string;
  extraClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={`relative border-r border-gray-200 ${extraClass || ""}`} ref={ref}>
      <div
        className={`h-full px-2 py-2.5 text-center cursor-pointer hover:bg-gray-200/50 flex items-center justify-center gap-1 ${active !== "none" ? "text-primary font-bold" : ""}`}
        onClick={() => setOpen(!open)}
      >
        {label ?? `${wave}차`}
        {active !== "none" && <ChevronDown className="h-3 w-3" />}
      </div>
      {open && (
        <div className="absolute top-full left-0 z-20 bg-white border rounded-md shadow-lg py-1 min-w-[100px]">
          {(["미입력", "체크필요", "무응답", "응답", "거절"] as WaveFilterKey[]).map((key) => (
            <button
              key={key}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 ${active === key ? "text-primary font-semibold bg-primary/5" : ""}`}
              onClick={() => { onFilter(key); setOpen(false); }}
            >
              {key}
            </button>
          ))}
          {active !== "none" && (
            <>
              <div className="border-t my-1" />
              <button
                className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-gray-100"
                onClick={() => { onFilter("none"); setOpen(false); }}
              >
                필터 해제
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 이메일 기반 일괄 수정 모달 ── */
function BulkEditByEmailModal({ instructors, wavesMap, onApply, onClose }: {
  instructors: Instructor[];
  wavesMap: Record<string, OutreachWave[]>;
  onApply: (ids: string[], waveNum: number, date: string, result: string, contactAssignee: string) => Promise<void>;
  onClose: () => void;
}) {
  const [emailText, setEmailText] = useState("");
  const [waveNum, setWaveNum] = useState("1차");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState("");
  const [contactAssignee, setContactAssignee] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // 이메일 파싱 → 매칭
  const { matched, unmatched } = useMemo(() => {
    const emails = emailText
      .split(/[\n,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);
    const unique = [...new Set(emails)];
    const matched: { email: string; instructor: Instructor }[] = [];
    const unmatched: string[] = [];
    for (const email of unique) {
      const inst = instructors.find(i => i.email?.toLowerCase() === email);
      if (inst) matched.push({ email, instructor: inst });
      else unmatched.push(email);
    }
    return { matched, unmatched };
  }, [emailText, instructors]);

  const handleApply = async () => {
    if (matched.length === 0) { toast.error("매칭된 강사가 없습니다."); return; }
    if (!date && !result && !contactAssignee) { toast.error("발송일, 결과, 담당자 중 하나는 선택하세요."); return; }
    setSaving(true);
    try {
      const waveNumInt = parseInt(waveNum);
      await onApply(matched.map(m => m.instructor.id), waveNumInt, date, result, contactAssignee);
      toast.success(`${matched.length}명 ${waveNum} 일괄 수정 완료`);
      setDone(true);
    } catch { toast.error("일괄 수정 실패"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-lg w-[560px] max-h-[85vh] p-6 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-semibold">이메일로 일괄 수정</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 이메일 입력 */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-1 block">이메일 주소 (줄바꿈, 쉼표, 세미콜론으로 구분)</label>
          <textarea
            className="w-full h-32 border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder={"example1@gmail.com\nexample2@naver.com\nexample3@kakao.com"}
            value={emailText}
            onChange={e => { setEmailText(e.target.value); setDone(false); }}
          />
        </div>

        {/* 매칭 결과 */}
        {emailText.trim() && (
          <div className="mb-4 text-sm space-y-1">
            <p>
              <span className="font-medium text-green-700">매칭 {matched.length}명</span>
              {unmatched.length > 0 && (
                <span className="ml-2 text-red-600">미매칭 {unmatched.length}건</span>
              )}
            </p>
            {matched.length > 0 && (
              <div className="max-h-28 overflow-y-auto border rounded px-2 py-1.5 bg-gray-50 space-y-0.5">
                {matched.map(m => (
                  <div key={m.instructor.id} className="text-xs flex justify-between">
                    <span className="font-medium">{m.instructor.name}</span>
                    <span className="text-muted-foreground">{m.email}</span>
                  </div>
                ))}
              </div>
            )}
            {unmatched.length > 0 && (
              <div className="max-h-20 overflow-y-auto border border-red-200 rounded px-2 py-1.5 bg-red-50 space-y-0.5">
                {unmatched.map(e => (
                  <div key={e} className="text-xs text-red-600">{e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 수정 항목 */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">차수</label>
            <Select value={waveNum} onValueChange={v => { setWaveNum(v); setDone(false); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1차">1차</SelectItem>
                <SelectItem value="2차">2차</SelectItem>
                <SelectItem value="3차">3차</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">발송일</label>
            <Input type="date" className="h-9 text-sm" value={date} onChange={e => { setDate(e.target.value); setDone(false); }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">결과</label>
            <Select value={result || "체크필요"} onValueChange={v => { setResult(v); setDone(false); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WAVE_RESULTS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 담당자 */}
        <div className="mb-5">
          <label className="text-xs text-muted-foreground mb-1.5 block">담당자</label>
          <div className="flex gap-2">
            {(["정승희", "김보성"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => { setContactAssignee(contactAssignee === a ? "" : a); setDone(false); }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                  contactAssignee === a
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white text-muted-foreground border-gray-200 hover:bg-gray-50"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2">
          <Button className="flex-1 h-9 text-sm" onClick={handleApply} disabled={saving || matched.length === 0 || done}>
            {saving ? "처리 중..." : done ? "완료됨" : `${matched.length}명 일괄 수정`}
          </Button>
          <Button variant="outline" className="h-9 text-sm" onClick={onClose}>닫기</Button>
        </div>
      </div>
    </div>
  );
}
