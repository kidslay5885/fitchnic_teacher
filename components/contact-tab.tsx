"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { STATUS_COLORS, WAVE_RESULTS } from "@/lib/constants";
import type { Instructor, InstructorStatus, OutreachWave } from "@/lib/types";
import { toast } from "sonner";
import { Send, Clock, AlertCircle, Search } from "lucide-react";

const CONTACT_STATUSES: InstructorStatus[] = ["발송 예정", "진행 중", "계약 완료", "보류", "거절"];

type ViewFilter = "all" | "발송 예정" | "진행 중" | "needs_followup" | "계약 완료" | "보류" | "거절";

export default function ContactTab() {
  const { state, dispatch, loadInstructors, loadStats } = useOutreach();
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [search, setSearch] = useState("");
  const [wavesMap, setWavesMap] = useState<Record<string, OutreachWave[]>>({});
  const [loadingWaves, setLoadingWaves] = useState(false);

  // 컨택 대상 강사들
  const contactInstructors = useMemo(() => {
    return state.instructors.filter((i) =>
      CONTACT_STATUSES.includes(i.status as InstructorStatus)
    );
  }, [state.instructors]);

  // 발송 기록 로드
  const loadAllWaves = useCallback(async () => {
    if (contactInstructors.length === 0) return;
    setLoadingWaves(true);
    try {
      const ids = contactInstructors.map((i) => i.id);
      const res = await fetch(`/api/outreach/waves-bulk?ids=${ids.join(",")}`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, OutreachWave[]> = {};
        for (const w of data) {
          if (!map[w.instructor_id]) map[w.instructor_id] = [];
          map[w.instructor_id].push(w);
        }
        setWavesMap(map);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingWaves(false);
    }
  }, [contactInstructors]);

  useEffect(() => {
    loadAllWaves();
  }, [loadAllWaves]);

  // 후속 발송 필요한 강사 (마지막 결과가 무응답이고, 다음 차수 미발송)
  const needsFollowup = useMemo(() => {
    return contactInstructors.filter((i) => {
      if (i.status !== "진행 중") return false;
      const waves = wavesMap[i.id] || [];
      if (waves.length === 0) return true; // 발송 기록 없음
      const lastWave = waves[waves.length - 1];
      return lastWave.result === "무응답" && lastWave.wave_number < 3;
    });
  }, [contactInstructors, wavesMap]);

  // 필터된 결과
  const filtered = useMemo(() => {
    let list = contactInstructors;

    if (viewFilter === "needs_followup") {
      list = needsFollowup;
    } else if (viewFilter !== "all") {
      list = list.filter((i) => i.status === viewFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name?.toLowerCase().includes(q) ||
          i.field?.toLowerCase().includes(q) ||
          i.assignee?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [contactInstructors, viewFilter, search, needsFollowup]);

  // 인라인 발송 업데이트
  const handleWaveUpdate = async (instructorId: string, waveNumber: number, field: string, value: string) => {
    try {
      const existing = (wavesMap[instructorId] || []).find((w) => w.wave_number === waveNumber);
      const body: any = {
        wave_number: waveNumber,
        sent_date: existing?.sent_date || null,
        result: existing?.result || "",
        [field]: value,
      };
      const res = await fetch(`/api/instructors/${instructorId}/waves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      await loadAllWaves();
      toast.success("업데이트 완료");
    } catch {
      toast.error("업데이트 실패");
    }
  };

  // 진행 중으로 변경 + 오늘 1차 발송 자동 생성
  const handleStartOutreach = async (instructor: Instructor) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      // 상태 변경
      const res = await fetch(`/api/instructors/${instructor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "진행 중", _changed_by: instructor.assignee, _reason: "발송 시작" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = await res.json();
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: updated });

      // 1차 발송 기록 자동 생성
      await fetch(`/api/instructors/${instructor.id}/waves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wave_number: 1, sent_date: today, result: "" }),
      });

      await Promise.all([loadAllWaves(), loadStats()]);
      toast.success(`${instructor.name} 발송 시작`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of CONTACT_STATUSES) {
      c[s] = contactInstructors.filter((i) => i.status === s).length;
    }
    c.needs_followup = needsFollowup.length;
    return c;
  }, [contactInstructors, needsFollowup]);

  const getWave = (instructorId: string, n: number) =>
    (wavesMap[instructorId] || []).find((w) => w.wave_number === n);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">컨택관리</h2>

      {/* 뷰 필터 */}
      <div className="flex gap-2 flex-wrap">
        <FilterButton active={viewFilter === "all"} onClick={() => setViewFilter("all")}>
          전체 ({contactInstructors.length})
        </FilterButton>
        <FilterButton active={viewFilter === "발송 예정"} onClick={() => setViewFilter("발송 예정")}>
          <Send className="h-3.5 w-3.5" />
          발송 예정 ({statusCounts["발송 예정"]})
        </FilterButton>
        <FilterButton active={viewFilter === "진행 중"} onClick={() => setViewFilter("진행 중")}>
          <Clock className="h-3.5 w-3.5" />
          진행 중 ({statusCounts["진행 중"]})
        </FilterButton>
        <FilterButton
          active={viewFilter === "needs_followup"}
          onClick={() => setViewFilter("needs_followup")}
          highlight={needsFollowup.length > 0}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          후속 발송 필요 ({needsFollowup.length})
        </FilterButton>
        <FilterButton active={viewFilter === "계약 완료"} onClick={() => setViewFilter("계약 완료")}>
          계약 완료 ({statusCounts["계약 완료"]})
        </FilterButton>
      </div>

      {/* 검색 */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="이름, 분야, 담당자 검색..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <span className="text-sm text-muted-foreground">{filtered.length}명</span>

      {/* 테이블 — 인라인 발송 편집 */}
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>분야</TableHead>
              <TableHead>담당자</TableHead>
              <TableHead className="text-center">1차</TableHead>
              <TableHead className="text-center">2차</TableHead>
              <TableHead className="text-center">3차</TableHead>
              <TableHead>최종</TableHead>
              <TableHead className="w-[80px]">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  해당하는 강사가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((i) => (
                <TableRow key={i.id} className="group">
                  <TableCell
                    className="font-medium cursor-pointer hover:underline"
                    onClick={() => {
                      dispatch({ type: "SET_TAB", tab: "instructors" });
                      setTimeout(() => {
                        dispatch({ type: "SET_FILTER", filters: { status: "전체", search: "" } });
                        dispatch({ type: "SELECT_INSTRUCTOR", id: i.id });
                      }, 50);
                    }}
                  >
                    {i.name}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[i.status as InstructorStatus] || ""}>
                      {i.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{i.field}</TableCell>
                  <TableCell className="text-sm">{i.assignee}</TableCell>

                  {/* 1~3차 인라인 */}
                  {[1, 2, 3].map((n) => {
                    const wave = getWave(i.id, n);
                    return (
                      <TableCell key={n} className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-0.5 items-center">
                          <Input
                            type="date"
                            className="w-[120px] h-7 text-xs"
                            value={wave?.sent_date || ""}
                            onChange={(e) => handleWaveUpdate(i.id, n, "sent_date", e.target.value)}
                          />
                          <Select
                            value={wave?.result || "_none"}
                            onValueChange={(v) => handleWaveUpdate(i.id, n, "result", v === "_none" ? "" : v)}
                          >
                            <SelectTrigger className="w-[90px] h-6 text-xs">
                              <SelectValue placeholder="결과" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">-</SelectItem>
                              {WAVE_RESULTS.map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                    );
                  })}

                  <TableCell className="text-sm">{i.final_status || "-"}</TableCell>
                  <TableCell>
                    {i.status === "발송 예정" && (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleStartOutreach(i)}
                      >
                        <Send className="h-3 w-3 mr-1" />
                        발송
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  highlight,
  onClick,
  children,
}: {
  active: boolean;
  highlight?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary/5 text-foreground"
          : highlight
          ? "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
          : "hover:bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
