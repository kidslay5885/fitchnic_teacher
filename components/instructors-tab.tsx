"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STATUSES, STATUS_COLORS } from "@/lib/constants";
import { requiresReason } from "@/lib/status-machine";
import type { Instructor, InstructorStatus } from "@/lib/types";
import InstructorDetail from "@/components/instructor-detail";
import InstructorForm from "@/components/instructor-form";
import BulkActions from "@/components/bulk-actions";
import YouTubeChannelsTab from "@/components/youtube-channels-tab";
import { Plus, Search, ChevronUp, ChevronDown, X, ExternalLink, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type SubTab = "instructors" | "youtube-channels";

type SortKey = "name" | "status" | "field" | "assignee" | "source" | "has_lecture_history" | "lecture_platform" | "email" | "created_at";
type SortDir = "asc" | "desc";

const DEFAULT_SORT_KEY: SortKey = "created_at";
const DEFAULT_SORT_DIR: SortDir = "desc";
const ROW_H = 36;
// 체크 | 상태 | 분야 | 찾은 사람 | 이름 | 참조 | 강의 | 플랫폼 | 유튜브 | 인스타 | 이메일 | 비고 | 출처 | 등록일 | 사유
const GRID = "36px 84px 1.2fr 72px 1fr 48px 64px 1fr 48px 48px 1.2fr 1.5fr 80px 76px 1.2fr";
const MIN_W = 1180;

const ROW_BG: Record<string, string> = {
  미검토: "bg-gray-50",
  "컨펌 필요": "bg-yellow-50",
  "발송 예정": "bg-blue-50",
  "진행 중": "bg-indigo-50",
  "계약 완료": "bg-green-50",
  제외: "bg-red-50",
  보류: "bg-orange-50",
  거절: "bg-rose-50",
};

export default function InstructorsTab() {
  const [subTab, setSubTab] = useState<SubTab>("instructors");

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* 서브탭 */}
      <div className="flex items-center gap-1 border-b mb-3 shrink-0">
        <button
          onClick={() => setSubTab("instructors")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            subTab === "instructors"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          강사찾기
        </button>
        <button
          onClick={() => setSubTab("youtube-channels")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            subTab === "youtube-channels"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          YT채널수집
        </button>
      </div>

      {subTab === "youtube-channels" ? (
        <YouTubeChannelsTab />
      ) : (
        <InstructorListView />
      )}
    </div>
  );
}

function InstructorListView() {
  const { state, dispatch, loadInstructors, loadStats } = useOutreach();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingStatus, setEditingStatus] = useState<{ instructor: Instructor; x: number; y: number } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    return state.instructors.filter((i) => {
      // 연락 금지 강사 및 YT채널수집 출처 제외
      if (i.is_banned) return false;
      if (i.source === "YT채널수집") return false;
      const f = state.filters;
      if (f.status !== "전체" && i.status !== f.status) return false;
      if (f.search) {
        const q = f.search.toLowerCase();
        return (
          i.name?.toLowerCase().includes(q) ||
          i.email?.toLowerCase().includes(q) ||
          i.field?.toLowerCase().includes(q) ||
          i.youtube?.toLowerCase().includes(q) ||
          i.instagram?.toLowerCase().includes(q) ||
          i.lecture_platform?.toLowerCase().includes(q) ||
          i.notes?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state.instructors, state.filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "created_at") {
        const at = new Date(a.created_at || 0).getTime();
        const bt = new Date(b.created_at || 0).getTime();
        return sortDir === "asc" ? at - bt : bt - at;
      }
      const av = (a[sortKey] || "") as string;
      const bv = (b[sortKey] || "") as string;
      const cmp = av.localeCompare(bv, "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const isDefaultSort = sortKey === DEFAULT_SORT_KEY && sortDir === DEFAULT_SORT_DIR;
  const resetSort = useCallback(() => {
    setSortKey(DEFAULT_SORT_KEY);
    setSortDir(DEFAULT_SORT_DIR);
  }, []);

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey, sortDir]);

  const handleBulkToOutreach = async () => {
    if (selected.size === 0) return;
    try {
      const res = await fetch("/api/instructors/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), status: "발송 예정", reason: "", changed_by: "" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await Promise.all([loadInstructors(), loadStats()]);
      toast.success(`${selected.size}명이 발송 예정으로 이동`);
      setSelected(new Set());
    } catch (e: any) { toast.error(e.message); }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size}명의 강사를 삭제하시겠습니까?`)) return;
    try {
      await Promise.all(Array.from(selected).map(id =>
        fetch(`/api/instructors/${id}`, { method: "DELETE" })
      ));
      await Promise.all([loadInstructors(), loadStats()]);
      toast.success(`${selected.size}명 삭제 완료`);
      setSelected(new Set());
    } catch { toast.error("삭제 실패"); }
  };

  const handleStatusClick = (e: React.MouseEvent, instructor: Instructor) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingStatus({ instructor, x: rect.left, y: rect.bottom + 4 });
  };

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

  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((i) => i.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 필터 바 */}
      <div className="flex items-center gap-2 flex-wrap pb-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="검색..."
            className="h-8 text-sm pl-8 w-[200px]"
            value={state.filters.search}
            onChange={(e) => dispatch({ type: "SET_FILTER", filters: { search: e.target.value } })}
          />
        </div>
        <Select value={state.filters.status} onValueChange={(v) => dispatch({ type: "SET_FILTER", filters: { status: v as any } })}>
          <SelectTrigger className="w-[120px] h-8 text-sm">
            <span className="truncate">{state.filters.status === "전체" ? "상태: 전체" : state.filters.status}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">상태: 전체</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{sorted.length}명</span>
        {!isDefaultSort && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={resetSort}>
            <RotateCcw className="h-3 w-3 mr-1" />정렬 초기화
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleBulkToOutreach}>
                발송 예정으로 ({selected.size})
              </Button>
              <BulkActions selectedIds={Array.from(selected)} onDone={() => setSelected(new Set())} />
              <Button size="sm" variant="outline" className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />삭제 ({selected.size})
              </Button>
            </>
          )}
          <Button onClick={() => setShowForm(true)} size="sm" className="h-8 text-sm">
            <Plus className="h-4 w-4 mr-1" />추가
          </Button>
          <a
            href="/submit"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center h-8 px-3 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4 mr-1" />공개 폼
          </a>
        </div>
      </div>

      {/* 가상화 테이블 */}
      <div ref={scrollRef} className="border rounded flex-1 min-h-0 overflow-auto">
        {/* 헤더 */}
        <div
          className="sticky top-0 z-10 grid items-center bg-[#f8f9fa] border-b text-xs font-semibold text-muted-foreground select-none"
          style={{ gridTemplateColumns: GRID, minWidth: MIN_W }}
        >
          <div className="px-1 flex justify-center border-r border-gray-200 cursor-pointer" onClick={toggleAll}>
            <Checkbox checked={sorted.length > 0 && selected.size === sorted.length} />
          </div>
          <HeaderCell label="상태" col="status" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="분야" col="field" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="찾은 사람" col="assignee" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="이름" col="name" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="참조" />
          <HeaderCell label="강의" col="has_lecture_history" sk={sortKey} sd={sortDir} onSort={handleSort} center />
          <HeaderCell label="플랫폼" col="lecture_platform" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="유튜브" />
          <HeaderCell label="인스타" />
          <HeaderCell label="이메일" col="email" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="비고" />
          <HeaderCell label="출처" col="source" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="등록일" col="created_at" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="사유" last />
        </div>

        {/* 본문 */}
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">데이터가 없습니다.</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", minWidth: MIN_W }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const i = sorted[vRow.index];
              const idx = vRow.index;
              const igUrl = i.instagram ? (i.instagram.startsWith("http") ? i.instagram : `https://instagram.com/${i.instagram}`) : "";
              return (
                <div
                  key={i.id}
                  className={`grid items-center border-b cursor-pointer text-sm ${
                    ROW_BG[i.status] || "bg-white"
                  } ${state.selectedId === i.id ? "!bg-blue-100" : "hover:brightness-95"}`}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: ROW_H, gridTemplateColumns: GRID, transform: `translateY(${vRow.start}px)` }}
                  onClick={() => dispatch({ type: "SELECT_INSTRUCTOR", id: i.id })}
                >
                  <div className="px-1 flex justify-center border-r border-gray-200/60" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggleOne(i.id)} />
                  </div>
                  <div className="px-2 flex items-center border-r border-gray-200/60" onClick={(e) => e.stopPropagation()}>
                    <Badge
                      className={`text-xs px-1.5 py-0 cursor-pointer hover:ring-2 hover:ring-primary/30 transition whitespace-nowrap ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}
                      onClick={(e) => handleStatusClick(e, i)}
                    >
                      {i.status}
                    </Badge>
                  </div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 overflow-hidden"><span className="truncate">{i.field}</span></div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.assignee}</span></div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 font-medium overflow-hidden">
                    <span className="truncate">{i.name}</span>
                    {i.is_banned && <span className="text-red-500 ml-1 text-xs shrink-0">[금지]</span>}
                  </div>
                  <div className="px-2 flex items-center gap-0.5 border-r border-gray-200/60 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    {i.ref_link ? i.ref_link.split(/\s*,\s*/).filter(Boolean).map((link, idx) => (
                      <span key={idx} className="shrink-0">
                        {idx > 0 && <span className="text-muted-foreground text-xs">,</span>}
                        <a href={link.trim()} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">링크{i.ref_link!.split(/\s*,\s*/).filter(Boolean).length > 1 ? idx + 1 : ""}</a>
                      </span>
                    )) : ""}
                  </div>
                  <div className="px-2 flex items-center justify-center border-r border-gray-200/60 text-muted-foreground">{i.has_lecture_history}</div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    {i.lecture_platform_url ? (
                      <a href={i.lecture_platform_url} target="_blank" rel="noopener noreferrer" className="truncate text-blue-600 hover:underline">{i.lecture_platform}</a>
                    ) : (
                      <span className="truncate">{i.lecture_platform}</span>
                    )}
                  </div>
                  <div className="px-2 flex items-center border-r border-gray-200/60" onClick={(e) => e.stopPropagation()}>
                    {i.youtube ? <a href={i.youtube} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">링크</a> : ""}
                  </div>
                  <div className="px-2 flex items-center border-r border-gray-200/60" onClick={(e) => e.stopPropagation()}>
                    {igUrl ? <a href={igUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">링크</a> : ""}
                  </div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.email}</span></div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.notes}</span></div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.source}</span></div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.created_at ? new Date(i.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) : ""}</span></div>
                  <div className="px-2 flex items-center text-muted-foreground overflow-hidden"><span className="truncate" title={
                    i.status === "컨펌 필요" ? (i.confirm_reason || "") :
                    ["제외", "보류", "거절"].includes(i.status) ? (i.exclude_reason || "") : ""
                  }>{
                    i.status === "컨펌 필요" ? (i.confirm_reason || "") :
                    ["제외", "보류", "거절"].includes(i.status) ? (i.exclude_reason || "") : ""
                  }</span></div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {state.selectedId && (
        <InstructorDetail
          instructor={state.instructors.find((i) => i.id === state.selectedId)!}
          onClose={() => dispatch({ type: "SELECT_INSTRUCTOR", id: null })}
        />
      )}
      {showForm && <InstructorForm onClose={() => setShowForm(false)} />}

      {editingStatus && (
        <StatusPopover
          instructor={editingStatus.instructor}
          x={editingStatus.x}
          y={editingStatus.y}
          onConfirm={handleStatusChange}
          onClose={() => setEditingStatus(null)}
        />
      )}
    </div>
  );
}

function HeaderCell({ label, col, sk, sd, onSort, center, last }: {
  label: string; col?: SortKey; sk?: SortKey; sd?: SortDir;
  onSort?: (k: SortKey) => void; center?: boolean; last?: boolean;
}) {
  const active = col && sk === col;
  return (
    <div
      className={`px-2 py-2.5 whitespace-nowrap flex items-center ${!last ? "border-r border-gray-200" : ""} ${center ? "justify-center" : ""} ${col ? "cursor-pointer hover:bg-gray-200/50" : ""}`}
      onClick={() => col && onSort?.(col)}
    >
      {label}
      {active && (sd === "asc" ? <ChevronUp className="h-3.5 w-3.5 ml-0.5" /> : <ChevronDown className="h-3.5 w-3.5 ml-0.5" />)}
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
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPendingStatus(null)}>뒤로</Button>
          </div>
        </div>
      )}
    </div>
  );
}
