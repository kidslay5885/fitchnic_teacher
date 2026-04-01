"use client";

import { useState, useMemo } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUSES, STATUS_COLORS, ASSIGNEES, SOURCES } from "@/lib/constants";
import type { InstructorStatus } from "@/lib/types";
import InstructorDetail from "@/components/instructor-detail";
import InstructorForm from "@/components/instructor-form";
import BulkActions from "@/components/bulk-actions";
import { Plus, Search, Eye } from "lucide-react";
import { toast } from "sonner";

const REVIEW_STATUSES: InstructorStatus[] = ["미검토", "컨펌 필요", "발송 예정"];

export default function InstructorsTab() {
  const { state, dispatch, loadInstructors, loadStats } = useOutreach();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    return state.instructors.filter((i) => {
      const f = state.filters;
      if (!showAll && f.status === "전체") {
        if (!REVIEW_STATUSES.includes(i.status as InstructorStatus)) return false;
      }
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
          i.instagram?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state.instructors, state.filters, showAll]);

  const reviewCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of REVIEW_STATUSES) {
      counts[s] = state.instructors.filter((i) => i.status === s).length;
    }
    return counts;
  }, [state.instructors]);

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
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((i) => i.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">강사 DB</h2>
        <Button onClick={() => setShowForm(true)} size="sm" className="h-7 text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" />
          강사 추가
        </Button>
      </div>

      {/* 상태 필터 칩 */}
      <div className="flex gap-1.5 flex-wrap">
        {REVIEW_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setShowAll(false); dispatch({ type: "SET_FILTER", filters: { status: s } }); }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              !showAll && state.filters.status === s
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-transparent bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
            <span className="font-bold">{reviewCounts[s]}</span>
          </button>
        ))}
        <button
          onClick={() => { setShowAll(!showAll); dispatch({ type: "SET_FILTER", filters: { status: "전체" } }); }}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            showAll
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-transparent bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eye className="h-3 w-3" />
          전체
        </button>
      </div>

      {/* 필터바 */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="이름, 이메일, 분야 검색..."
            className="h-7 text-xs pl-7"
            value={state.filters.search}
            onChange={(e) => dispatch({ type: "SET_FILTER", filters: { search: e.target.value } })}
          />
        </div>
        <Select
          value={state.filters.assignee || "_all"}
          onValueChange={(v) => dispatch({ type: "SET_FILTER", filters: { assignee: v === "_all" ? "" : v } })}
        >
          <SelectTrigger className="w-[100px] h-7 text-xs"><SelectValue placeholder="담당자" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">전체</SelectItem>
            {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={state.filters.source}
          onValueChange={(v) => dispatch({ type: "SET_FILTER", filters: { source: v as any } })}
        >
          <SelectTrigger className="w-[90px] h-7 text-xs"><SelectValue placeholder="출처" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">전체</SelectItem>
            {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* 카운트 + 일괄 액션 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{filtered.length}명</span>
        {selected.size > 0 && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleBulkToOutreach}>
              발송 예정으로 ({selected.size})
            </Button>
            <BulkActions selectedIds={Array.from(selected)} onDone={() => setSelected(new Set())} />
          </div>
        )}
      </div>

      {/* 테이블 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8 py-1.5">
                <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead className="py-1.5 text-xs">이름</TableHead>
              <TableHead className="py-1.5 text-xs">상태</TableHead>
              <TableHead className="py-1.5 text-xs">분야</TableHead>
              <TableHead className="py-1.5 text-xs">담당자</TableHead>
              <TableHead className="py-1.5 text-xs">연락처</TableHead>
              <TableHead className="py-1.5 text-xs">출처</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                  데이터가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((i, idx) => (
                <TableRow
                  key={i.id}
                  className={`cursor-pointer transition-colors ${
                    i.is_banned ? "bg-red-50/50" : idx % 2 === 1 ? "bg-muted/20" : ""
                  } ${state.selectedId === i.id ? "bg-primary/5" : "hover:bg-muted/40"}`}
                  onClick={() => dispatch({ type: "SELECT_INSTRUCTOR", id: i.id })}
                >
                  <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggleOne(i.id)} />
                  </TableCell>
                  <TableCell className="py-1 text-xs font-medium">
                    {i.name}
                    {i.is_banned && <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0">금지</Badge>}
                  </TableCell>
                  <TableCell className="py-1">
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>
                      {i.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">{i.field}</TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">{i.assignee}</TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">
                    {[i.instagram && "IG", i.youtube && "YT", i.email && "E"].filter(Boolean).join("/") || "-"}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">{i.source}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
