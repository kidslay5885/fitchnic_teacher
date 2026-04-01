"use client";

import { useState, useMemo, useCallback } from "react";
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

type SortKey = "name" | "status" | "field" | "assignee" | "source" | "has_lecture_history" | "lecture_platform" | "email" | "youtube" | "instagram";
type SortDir = "asc" | "desc";

export default function InstructorsTab() {
  const { state, dispatch, loadInstructors, loadStats } = useOutreach();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
    } catch (e: any) {
      toast.error(e.message);
    }
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

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
  };

  return (
    <div className="space-y-2">
      {/* 필터 바 — 스프레드시트 상단 필터처럼 한 줄로 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="검색..."
            className="h-7 text-xs pl-7 w-[180px]"
            value={state.filters.search}
            onChange={(e) => dispatch({ type: "SET_FILTER", filters: { search: e.target.value } })}
          />
        </div>
        <Select
          value={state.filters.status}
          onValueChange={(v) => dispatch({ type: "SET_FILTER", filters: { status: v as any } })}
        >
          <SelectTrigger className="w-[90px] h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">상태: 전체</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={state.filters.assignee || "_all"}
          onValueChange={(v) => dispatch({ type: "SET_FILTER", filters: { assignee: v === "_all" ? "" : v } })}
        >
          <SelectTrigger className="w-[90px] h-7 text-xs"><SelectValue placeholder="담당자" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">담당자: 전체</SelectItem>
            {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={state.filters.source}
          onValueChange={(v) => dispatch({ type: "SET_FILTER", filters: { source: v as any } })}
        >
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

      {/* 스프레드시트 테이블 */}
      <div className="border rounded overflow-auto" style={{ maxHeight: "calc(100vh - 130px)" }}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#f8f9fa] border-b">
              <th className="w-8 px-2 py-1.5 border-r bg-[#f8f9fa]">
                <Checkbox checked={sorted.length > 0 && selected.size === sorted.length} onCheckedChange={toggleAll} />
              </th>
              <Th label="상태" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="w-[72px]" />
              <Th label="제외사유" w="w-[80px]" />
              <Th label="분야" col="field" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="w-[80px]" />
              <Th label="담당자" col="assignee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="w-[60px]" />
              <Th label="강사이름" col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="w-[80px]" />
              <Th label="참조링크" w="w-[60px]" />
              <Th label="강의이력" col="has_lecture_history" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="w-[52px]" />
              <Th label="강의플랫폼" col="lecture_platform" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="w-[80px]" />
              <Th label="유튜브" w="w-[60px]" />
              <Th label="인스타" w="w-[60px]" />
              <Th label="이메일" col="email" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="w-[120px]" />
              <Th label="비고" w="w-[120px]" />
              <Th label="출처" col="source" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} w="w-[60px]" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={14} className="text-center py-8 text-muted-foreground">데이터가 없습니다.</td></tr>
            ) : (
              sorted.map((i, idx) => (
                <tr
                  key={i.id}
                  className={`border-b cursor-pointer transition-colors ${
                    i.is_banned ? "bg-red-50/60" : idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]/50"
                  } ${state.selectedId === i.id ? "!bg-blue-50" : "hover:bg-blue-50/40"}`}
                  onClick={() => dispatch({ type: "SELECT_INSTRUCTOR", id: i.id })}
                >
                  <td className="px-2 py-[3px] border-r" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggleOne(i.id)} />
                  </td>
                  <td className="px-1.5 py-[3px] border-r">
                    <Badge className={`text-[10px] px-1 py-0 leading-tight ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge>
                  </td>
                  <td className="px-1.5 py-[3px] border-r text-muted-foreground truncate max-w-[80px]">{i.exclude_reason || ""}</td>
                  <td className="px-1.5 py-[3px] border-r truncate max-w-[80px]">{i.field || ""}</td>
                  <td className="px-1.5 py-[3px] border-r">{i.assignee || ""}</td>
                  <td className="px-1.5 py-[3px] border-r font-medium whitespace-nowrap">
                    {i.name}
                    {i.is_banned && <span className="text-red-500 ml-0.5 text-[9px]">[금지]</span>}
                  </td>
                  <td className="px-1.5 py-[3px] border-r">
                    {i.ref_link ? <a href={i.ref_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>링크</a> : ""}
                  </td>
                  <td className="px-1.5 py-[3px] border-r text-center">{i.has_lecture_history || ""}</td>
                  <td className="px-1.5 py-[3px] border-r text-muted-foreground truncate max-w-[80px]">{i.lecture_platform || ""}</td>
                  <td className="px-1.5 py-[3px] border-r">
                    {i.youtube ? <a href={i.youtube} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>YT</a> : ""}
                  </td>
                  <td className="px-1.5 py-[3px] border-r">
                    {i.instagram ? <a href={i.instagram.startsWith("http") ? i.instagram : `https://instagram.com/${i.instagram}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>IG</a> : ""}
                  </td>
                  <td className="px-1.5 py-[3px] border-r text-muted-foreground truncate max-w-[120px]">{i.email || ""}</td>
                  <td className="px-1.5 py-[3px] border-r text-muted-foreground truncate max-w-[120px]">{i.notes || ""}</td>
                  <td className="px-1.5 py-[3px] text-muted-foreground">{i.source || ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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

/* 정렬 가능 헤더 셀 */
function Th({ label, col, sortKey, sortDir, onSort, w }: {
  label: string; col?: SortKey; sortKey?: SortKey; sortDir?: SortDir;
  onSort?: (k: SortKey) => void; w?: string;
}) {
  const active = col && sortKey === col;
  return (
    <th
      className={`px-1.5 py-1.5 border-r text-left font-medium text-[11px] text-muted-foreground whitespace-nowrap bg-[#f8f9fa] ${w || ""} ${col ? "cursor-pointer hover:bg-gray-200/50 select-none" : ""}`}
      onClick={() => col && onSort?.(col)}
    >
      {label}
      {active && (sortDir === "asc" ? <ChevronUp className="h-3 w-3 inline ml-0.5 -mt-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5 -mt-0.5" />)}
    </th>
  );
}
