"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STATUSES, STATUS_COLORS, ASSIGNEES, SOURCES } from "@/lib/constants";
import type { Instructor, InstructorStatus } from "@/lib/types";
import InstructorDetail from "@/components/instructor-detail";
import InstructorForm from "@/components/instructor-form";
import BulkActions from "@/components/bulk-actions";
import { Plus, Search, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

type SortKey = "name" | "status" | "field" | "assignee" | "source" | "has_lecture_history" | "lecture_platform" | "email";
type SortDir = "asc" | "desc";

const ROW_H = 28;

export default function InstructorsTab() {
  const { state, dispatch, loadInstructors, loadStats } = useOutreach();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    return state.instructors.filter((i) => {
      const f = state.filters;
      if (f.status !== "전체" && i.status !== f.status) return false;
      if (f.assignee && i.assignee !== f.assignee) return false;
      if (f.source !== "전체" && i.source !== f.source) return false;
      if (f.field && !i.field?.includes(f.field)) return false;
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
      const av = (a[sortKey] || "") as string;
      const bv = (b[sortKey] || "") as string;
      const cmp = av.localeCompare(bv, "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

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
    <div className="flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
      {/* 필터 바 */}
      <div className="flex items-center gap-1.5 flex-wrap pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="검색..."
            className="h-7 text-xs pl-7 w-[180px]"
            value={state.filters.search}
            onChange={(e) => dispatch({ type: "SET_FILTER", filters: { search: e.target.value } })}
          />
        </div>
        <Select value={state.filters.status} onValueChange={(v) => dispatch({ type: "SET_FILTER", filters: { status: v as any } })}>
          <SelectTrigger className="w-[90px] h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">상태: 전체</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={state.filters.assignee || "_all"} onValueChange={(v) => dispatch({ type: "SET_FILTER", filters: { assignee: v === "_all" ? "" : v } })}>
          <SelectTrigger className="w-[90px] h-7 text-xs"><SelectValue placeholder="담당자" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">담당자: 전체</SelectItem>
            {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={state.filters.source} onValueChange={(v) => dispatch({ type: "SET_FILTER", filters: { source: v as any } })}>
          <SelectTrigger className="w-[90px] h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">출처: 전체</SelectItem>
            {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-1">{sorted.length}명</span>
        <div className="ml-auto flex items-center gap-1.5">
          {selected.size > 0 && (
            <>
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={handleBulkToOutreach}>
                발송 예정으로 ({selected.size})
              </Button>
              <BulkActions selectedIds={Array.from(selected)} onDone={() => setSelected(new Set())} />
            </>
          )}
          <Button onClick={() => setShowForm(true)} size="sm" className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-0.5" />추가
          </Button>
        </div>
      </div>

      {/* 가상화 테이블 */}
      <div className="border rounded flex-1 min-h-0 flex flex-col">
        {/* 헤더 */}
        <div className="flex bg-[#f8f9fa] border-b shrink-0" style={{ minWidth: 1100 }}>
          <div className="w-8 px-2 py-1.5 border-r flex items-center">
            <Checkbox checked={sorted.length > 0 && selected.size === sorted.length} onCheckedChange={toggleAll} />
          </div>
          <Th label="상태" col="status" sk={sortKey} sd={sortDir} onSort={handleSort} w={72} />
          <Th label="제외사유" w={80} />
          <Th label="분야" col="field" sk={sortKey} sd={sortDir} onSort={handleSort} w={80} />
          <Th label="담당자" col="assignee" sk={sortKey} sd={sortDir} onSort={handleSort} w={60} />
          <Th label="강사이름" col="name" sk={sortKey} sd={sortDir} onSort={handleSort} w={80} />
          <Th label="참조링크" w={56} />
          <Th label="강의이력" col="has_lecture_history" sk={sortKey} sd={sortDir} onSort={handleSort} w={52} />
          <Th label="강의플랫폼" col="lecture_platform" sk={sortKey} sd={sortDir} onSort={handleSort} w={80} />
          <Th label="유튜브" w={56} />
          <Th label="인스타" w={56} />
          <Th label="이메일" col="email" sk={sortKey} sd={sortDir} onSort={handleSort} w={130} />
          <Th label="비고" w={140} />
          <Th label="출처" col="source" sk={sortKey} sd={sortDir} onSort={handleSort} w={60} last />
        </div>

        {/* 가상화 본체 */}
        <div ref={scrollRef} className="flex-1 overflow-auto" style={{ minWidth: 1100 }}>
          {sorted.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">데이터가 없습니다.</div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((vRow) => {
                const i = sorted[vRow.index];
                const idx = vRow.index;
                return (
                  <div
                    key={i.id}
                    className={`flex border-b cursor-pointer text-xs ${
                      i.is_banned ? "bg-red-50/60" : idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]/50"
                    } ${state.selectedId === i.id ? "!bg-blue-50" : "hover:bg-blue-50/40"}`}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, height: ROW_H, transform: `translateY(${vRow.start}px)` }}
                    onClick={() => dispatch({ type: "SELECT_INSTRUCTOR", id: i.id })}
                  >
                    <div className="w-8 px-2 border-r flex items-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggleOne(i.id)} />
                    </div>
                    <Cell w={72}><Badge className={`text-[10px] px-1 py-0 leading-tight ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge></Cell>
                    <Cell w={80} muted truncate>{i.exclude_reason}</Cell>
                    <Cell w={80} truncate>{i.field}</Cell>
                    <Cell w={60}>{i.assignee}</Cell>
                    <Cell w={80} bold>
                      {i.name}
                      {i.is_banned && <span className="text-red-500 ml-0.5 text-[9px]">[금지]</span>}
                    </Cell>
                    <Cell w={56}>
                      {i.ref_link ? <a href={i.ref_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>링크</a> : ""}
                    </Cell>
                    <Cell w={52} center>{i.has_lecture_history}</Cell>
                    <Cell w={80} muted truncate>{i.lecture_platform}</Cell>
                    <Cell w={56}>
                      {i.youtube ? <a href={i.youtube} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>YT</a> : ""}
                    </Cell>
                    <Cell w={56}>
                      {i.instagram ? <a href={i.instagram.startsWith("http") ? i.instagram : `https://instagram.com/${i.instagram}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>IG</a> : ""}
                    </Cell>
                    <Cell w={130} muted truncate>{i.email}</Cell>
                    <Cell w={140} muted truncate>{i.notes}</Cell>
                    <Cell w={60} muted last>{i.source}</Cell>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {state.selectedId && (
        <InstructorDetail
          instructor={state.instructors.find((i) => i.id === state.selectedId)!}
          onClose={() => dispatch({ type: "SELECT_INSTRUCTOR", id: null })}
        />
      )}
      {showForm && <InstructorForm onClose={() => setShowForm(false)} />}
    </div>
  );
}

function Th({ label, col, sk, sd, onSort, w, last }: {
  label: string; col?: SortKey; sk?: SortKey; sd?: SortDir;
  onSort?: (k: SortKey) => void; w: number; last?: boolean;
}) {
  const active = col && sk === col;
  return (
    <div
      className={`px-1.5 py-1.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap select-none flex items-center shrink-0 ${!last ? "border-r" : ""} ${col ? "cursor-pointer hover:bg-gray-200/50" : ""}`}
      style={{ width: w }}
      onClick={() => col && onSort?.(col)}
    >
      {label}
      {active && (sd === "asc" ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />)}
    </div>
  );
}

function Cell({ children, w, muted, bold, truncate, center, last }: {
  children?: React.ReactNode; w: number; muted?: boolean; bold?: boolean;
  truncate?: boolean; center?: boolean; last?: boolean;
}) {
  return (
    <div
      className={`px-1.5 flex items-center shrink-0 overflow-hidden ${!last ? "border-r" : ""} ${muted ? "text-muted-foreground" : ""} ${bold ? "font-medium" : ""} ${truncate ? "truncate" : ""} ${center ? "justify-center" : ""}`}
      style={{ width: w }}
    >
      {truncate ? <span className="truncate">{children}</span> : children}
    </div>
  );
}
