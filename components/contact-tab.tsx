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
import InstructorDetail from "@/components/instructor-detail";
import { toast } from "sonner";
import { Send, Search, X } from "lucide-react";

const CONTACT_STATUSES: InstructorStatus[] = ["발송 예정", "진행 중", "계약 완료", "제외", "보류", "거절"];
type ViewFilter = "all" | InstructorStatus;

const ROW_H = 40;
const GRID = "36px 1.5fr 88px 1fr 76px 1fr 1fr 1fr 88px";
const MIN_W = 820;

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
  const [wavesMap, setWavesMap] = useState<Record<string, OutreachWave[]>>({});
  const [editingWave, setEditingWave] = useState<{ instructorId: string; wave: number; x: number; y: number } | null>(null);
  const [editingStatus, setEditingStatus] = useState<{ instructor: Instructor; x: number; y: number } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWaveNum, setBulkWaveNum] = useState("1");
  const [bulkDate, setBulkDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [bulkResult, setBulkResult] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, select: true });

  // 컨택 대상만 (발송 예정 / 진행 중 / 계약 완료), 연락 금지 제외
  const contactInstructors = useMemo(() =>
    state.instructors.filter((i) => !i.is_banned && CONTACT_STATUSES.includes(i.status as InstructorStatus)),
  [state.instructors]);

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

  const filtered = useMemo(() => {
    let list = contactInstructors;
    if (viewFilter === "제외") list = list.filter((i) => ["제외", "보류", "거절"].includes(i.status));
    else if (viewFilter !== "all") list = list.filter((i) => i.status === viewFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name?.toLowerCase().includes(q) || i.field?.toLowerCase().includes(q) || i.assignee?.toLowerCase().includes(q));
    }
    return list;
  }, [contactInstructors, viewFilter, search]);

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

  /* ── 개별 발송 편집 ── */
  const handleWaveUpdate = async (instructorId: string, waveNumber: number, field: string, value: string) => {
    try {
      const existing = (wavesMap[instructorId] || []).find((w) => w.wave_number === waveNumber);
      const body: any = { wave_number: waveNumber, sent_date: existing?.sent_date || null, result: existing?.result || "", [field]: value };
      const res = await fetch(`/api/instructors/${instructorId}/waves`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "저장 실패");
      }
      await loadAllWaves();
    } catch (e: any) { toast.error(e.message || "업데이트 실패"); }
  };

  /* ── 개별 상태 변경 ── */
  const handleStatusChange = async (instructorId: string, newStatus: InstructorStatus, reason: string) => {
    try {
      const inst = state.instructors.find(i => i.id === instructorId);
      const res = await fetch(`/api/instructors/${instructorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, _changed_by: inst?.assignee || "", _reason: reason }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = await res.json();
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: updated });
      await loadStats();
      toast.success(`${inst?.name} → ${newStatus}`);
      setEditingStatus(null);
    } catch (e: any) { toast.error(e.message); }
  };

  /* ── 일괄 발송 기록 ── */
  const handleBulkWaveApply = async () => {
    if (selectedIds.size === 0) return;
    if (!bulkDate && !bulkResult) { toast.error("발송일 또는 결과를 선택하세요."); return; }
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const waveNum = parseInt(bulkWaveNum);
      await Promise.all(ids.map(id => {
        const existing = (wavesMap[id] || []).find(w => w.wave_number === waveNum);
        return fetch(`/api/instructors/${id}/waves`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wave_number: waveNum,
            sent_date: bulkDate || existing?.sent_date || null,
            result: bulkResult || existing?.result || "",
          }),
        });
      }));
      await loadAllWaves();
      toast.success(`${ids.length}명 ${bulkWaveNum}차 일괄 업데이트`);
      setSelectedIds(new Set());
    } catch { toast.error("일괄 업데이트 실패"); }
    finally { setBulkLoading(false); }
  };

  /* ── 일괄 발송 시작 ── */
  const handleBulkStartOutreach = async () => {
    const targets = Array.from(selectedIds).filter(id => {
      const inst = state.instructors.find(i => i.id === id);
      return inst?.status === "발송 예정";
    });
    if (targets.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/instructors/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targets, status: "진행 중", reason: "발송 시작" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const today = new Date().toISOString().split("T")[0];
      await Promise.all(targets.map(id =>
        fetch(`/api/instructors/${id}/waves`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wave_number: 1, sent_date: today, result: "" }),
        })
      ));
      await Promise.all([loadInstructors(), loadAllWaves(), loadStats()]);
      toast.success(`${targets.length}명 발송 시작`);
      setSelectedIds(new Set());
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkLoading(false); }
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

  /* ── 헬퍼 ── */
  const cnt = (s: string) => contactInstructors.filter((i) => i.status === s).length;
  const getWave = (id: string, n: number) => (wavesMap[id] || []).find((w) => w.wave_number === n);

  const formatWave = (w: OutreachWave | undefined) => {
    if (!w || (!w.sent_date && !w.result)) return "-";
    const d = w.sent_date ? (() => { const p = w.sent_date.split("-"); return `${parseInt(p[1])}/${parseInt(p[2])}`; })() : "";
    const r = w.result || "";
    if (d && r) return `${d} · ${r}`;
    return d || r;
  };

  const waveColor = (w: OutreachWave | undefined) => {
    if (!w?.result) return "";
    if (w.result === "응답") return "text-green-700 bg-green-50";
    if (w.result === "거절") return "text-red-600 bg-red-50";
    if (w.result === "읽씹") return "text-amber-700 bg-amber-50";
    if (w.result === "무응답") return "text-gray-500 bg-gray-50";
    return "";
  };

  const handleCellClick = (e: React.MouseEvent, instructorId: string, wave: number) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingWave({ instructorId, wave, x: rect.left, y: rect.bottom + 4 });
  };

  const handleStatusClick = (e: React.MouseEvent, instructor: Instructor) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingStatus({ instructor, x: rect.left, y: rect.bottom + 4 });
  };

  const readyToSendCount = useMemo(() =>
    Array.from(selectedIds).filter(id => state.instructors.find(i => i.id === id)?.status === "발송 예정").length,
  [selectedIds, state.instructors]);

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
            { key: "제외" as ViewFilter, label: `제외/보류/거절 (${cnt("제외") + cnt("보류") + cnt("거절")})`, active: "bg-rose-200 text-rose-900 border-rose-400", idle: "bg-rose-50 text-rose-700 border-rose-200" },
            { key: "계약 완료" as ViewFilter, label: `계약 완료 (${cnt("계약 완료")})`, active: "bg-green-200 text-green-900 border-green-400", idle: "bg-green-50 text-green-700 border-green-200" },
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
            <Input placeholder="이름, 분야, 담당자..." className="h-8 text-sm pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="text-sm text-muted-foreground">{filtered.length}명</span>
        </div>
      </div>

      {/* ── 테이블 ── */}
      <div ref={scrollRef} className="border rounded flex-1 min-h-0 overflow-auto">
        {/* 헤더 */}
        <div
          className="sticky top-0 z-10 grid items-center bg-[#f8f9fa] border-b text-xs font-semibold text-muted-foreground select-none"
          style={{ gridTemplateColumns: GRID, minWidth: MIN_W }}
        >
          <div className="px-1 flex justify-center cursor-pointer border-r border-gray-200" onClick={toggleSelectAll}>
            <input type="checkbox" className="h-3.5 w-3.5 rounded accent-primary pointer-events-none"
              checked={selectedIds.size === filtered.length && filtered.length > 0} readOnly />
          </div>
          <div className="px-3 py-2.5 border-r border-gray-200">이름</div>
          <div className="px-2 py-2.5 border-r border-gray-200">상태</div>
          <div className="px-2 py-2.5 border-r border-gray-200">분야</div>
          <div className="px-2 py-2.5 border-r border-gray-200">담당자</div>
          <div className="px-2 py-2.5 text-center border-r border-gray-200">1차</div>
          <div className="px-2 py-2.5 text-center border-r border-gray-200">2차</div>
          <div className="px-2 py-2.5 text-center border-r border-gray-200">3차</div>
          <div className="px-2 py-2.5">최종</div>
        </div>

        {/* 본문 */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">해당하는 강사가 없습니다.</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", minWidth: MIN_W }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const i = filtered[vRow.index];
              const isSelected = selectedIds.has(i.id);
              const rowBg = isSelected ? "bg-blue-100/70" : ROW_BG[i.status] || (vRow.index % 2 === 0 ? "bg-white" : "bg-[#fafafa]");
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
                    className="px-3 font-medium cursor-pointer hover:underline truncate border-r border-gray-200/60"
                    title={i.name}
                    onClick={() => setDetailId(i.id)}
                  >
                    {i.name}
                  </div>
                  {/* 상태 */}
                  <div className="px-2 cursor-pointer border-r border-gray-200/60" onClick={(e) => handleStatusClick(e, i)}>
                    <Badge className={`text-xs px-1.5 py-0 whitespace-nowrap cursor-pointer hover:ring-2 hover:ring-primary/30 transition ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>
                      {i.status}
                    </Badge>
                  </div>
                  {/* 분야 */}
                  <div className="px-2 text-muted-foreground truncate border-r border-gray-200/60" title={i.field || ""}>{i.field || ""}</div>
                  {/* 담당자 */}
                  <div className="px-2 text-muted-foreground truncate border-r border-gray-200/60" title={i.assignee || ""}>{i.assignee || ""}</div>
                  {/* 1차 2차 3차 */}
                  {[1, 2, 3].map((n) => {
                    const w = getWave(i.id, n);
                    return (
                      <div
                        key={n}
                        className={`px-2 flex items-center justify-center cursor-pointer hover:brightness-95 transition-colors border-r border-gray-200/60 ${waveColor(w)}`}
                        onClick={(e) => handleCellClick(e, i.id, n)}
                      >
                        <span className="text-sm whitespace-nowrap">{formatWave(w)}</span>
                      </div>
                    );
                  })}
                  {/* 최종 */}
                  <div className="px-2 text-muted-foreground truncate" title={i.final_status || ""}>{i.final_status || "-"}</div>
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
          <Select value={bulkResult || "_none"} onValueChange={v => setBulkResult(v === "_none" ? "" : v)}>
            <SelectTrigger className="w-[96px] h-8 text-sm"><SelectValue placeholder="결과" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">미선택</SelectItem>
              {WAVE_RESULTS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-sm" onClick={handleBulkWaveApply} disabled={bulkLoading}>
            {bulkLoading ? "처리 중..." : "일괄 적용"}
          </Button>
          {readyToSendCount > 0 && (
            <>
              <div className="h-4 w-px bg-border" />
              <Button size="sm" className="h-8 text-sm bg-green-600 hover:bg-green-700 text-white" onClick={handleBulkStartOutreach} disabled={bulkLoading}>
                <Send className="h-3.5 w-3.5 mr-1.5" />발송 시작 ({readyToSendCount}명)
              </Button>
            </>
          )}
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

      {/* ── 발송 편집 팝오버 ── */}
      {editingWave && (
        <WavePopover
          wave={getWave(editingWave.instructorId, editingWave.wave)}
          waveNumber={editingWave.wave}
          x={editingWave.x}
          y={editingWave.y}
          onUpdate={(field, value) => handleWaveUpdate(editingWave.instructorId, editingWave.wave, field, value)}
          onClose={() => setEditingWave(null)}
        />
      )}

      {/* ── 강사 상세 패널 (컨택관리 내) ── */}
      {detailInstructor && (
        <InstructorDetail
          instructor={detailInstructor}
          onClose={() => setDetailId(null)}
        />
      )}
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
function WavePopover({ wave, waveNumber, x, y, onUpdate, onClose }: {
  wave: OutreachWave | undefined;
  waveNumber: number;
  x: number; y: number;
  onUpdate: (field: string, value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(wave?.sent_date || "");
  const [result, setResult] = useState(wave?.result || "");
  const [saving, setSaving] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // 저장 중이거나 Select 열려있으면 닫지 않음
      if (savingRef.current || selectOpen) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-radix-popper-content-wrapper]")) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, selectOpen]);

  const popW = 260;
  const popH = 180;
  const adjustedX = Math.min(x, window.innerWidth - popW - 16);
  const adjustedY = y + popH > window.innerHeight ? y - popH - ROW_H - 8 : y;

  const handleSave = async (field: string, value: string) => {
    setSaving(true);
    savingRef.current = true;
    try {
      await onUpdate(field, value);
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border rounded-lg shadow-lg p-4 space-y-3"
      style={{ left: adjustedX, top: adjustedY, width: popW }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{waveNumber}차 발송</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground">발송일</label>
          <Input
            type="date"
            className="h-8 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={() => { if (date !== (wave?.sent_date || "")) handleSave("sent_date", date); }}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">결과</label>
          <Select
            value={result || "_none"}
            open={selectOpen}
            onOpenChange={setSelectOpen}
            onValueChange={(v) => {
              const val = v === "_none" ? "" : v;
              setResult(val);
              handleSave("result", val);
            }}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">미선택</SelectItem>
              {WAVE_RESULTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {saving && <p className="text-xs text-muted-foreground">저장 중...</p>}
    </div>
  );
}
