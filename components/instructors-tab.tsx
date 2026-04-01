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
import type { Instructor, InstructorStatus } from "@/lib/types";
import InstructorDetail from "@/components/instructor-detail";
import InstructorForm from "@/components/instructor-form";
import BulkActions from "@/components/bulk-actions";
import { Plus, Search } from "lucide-react";

export default function InstructorsTab() {
  const { state, dispatch } = useOutreach();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);

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
          i.instagram?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state.instructors, state.filters]);

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => i.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      {/* 필터바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름, 이메일, 분야 검색..."
            className="pl-9"
            value={state.filters.search}
            onChange={(e) =>
              dispatch({ type: "SET_FILTER", filters: { search: e.target.value } })
            }
          />
        </div>
        <Select
          value={state.filters.status}
          onValueChange={(v) =>
            dispatch({ type: "SET_FILTER", filters: { status: v as InstructorStatus | "전체" } })
          }
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">전체 상태</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state.filters.assignee || "_all"}
          onValueChange={(v) =>
            dispatch({ type: "SET_FILTER", filters: { assignee: v === "_all" ? "" : v } })
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="담당자" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">전체 담당자</SelectItem>
            {ASSIGNEES.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state.filters.source}
          onValueChange={(v) =>
            dispatch({ type: "SET_FILTER", filters: { source: v as any } })
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="출처" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">전체 출처</SelectItem>
            {SOURCES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          강사 추가
        </Button>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>총 {filtered.length}명</span>
        {selected.size > 0 && (
          <BulkActions
            selectedIds={Array.from(selected)}
            onDone={() => setSelected(new Set())}
          />
        )}
      </div>

      {/* 테이블 */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>이름</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>분야</TableHead>
              <TableHead>담당자</TableHead>
              <TableHead>연락처</TableHead>
              <TableHead>출처</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  데이터가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((i) => (
                <TableRow
                  key={i.id}
                  className={`cursor-pointer hover:bg-muted/50 ${
                    i.is_banned ? "bg-red-50" : ""
                  } ${state.selectedId === i.id ? "bg-muted" : ""}`}
                  onClick={() => dispatch({ type: "SELECT_INSTRUCTOR", id: i.id })}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(i.id)}
                      onCheckedChange={() => toggleOne(i.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {i.name}
                    {i.is_banned && (
                      <Badge variant="destructive" className="ml-1 text-xs">
                        금지
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[i.status as InstructorStatus] || ""}>
                      {i.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{i.field}</TableCell>
                  <TableCell className="text-sm">{i.assignee}</TableCell>
                  <TableCell className="text-sm">
                    {[i.instagram && "IG", i.youtube && "YT", i.email && "E"]
                      .filter(Boolean)
                      .join(" / ") || "-"}
                  </TableCell>
                  <TableCell className="text-sm">{i.source}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 상세 패널 */}
      {state.selectedId && (
        <InstructorDetail
          instructor={state.instructors.find((i) => i.id === state.selectedId)!}
          onClose={() => dispatch({ type: "SELECT_INSTRUCTOR", id: null })}
        />
      )}

      {/* 추가 폼 */}
      {showForm && <InstructorForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
