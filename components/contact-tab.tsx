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

  const contactInstructors = useMemo(() =>
    state.instructors.filter((i) => CONTACT_STATUSES.includes(i.status as InstructorStatus)),
  [state.instructors]);

  const loadAllWaves = useCallback(async () => {
    if (contactInstructors.length === 0) return;
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
    } catch {}
  }, [contactInstructors]);

  useEffect(() => { loadAllWaves(); }, [loadAllWaves]);

  const needsFollowup = useMemo(() =>
    contactInstructors.filter((i) => {
      if (i.status !== "진행 중") return false;
      const waves = wavesMap[i.id] || [];
      if (waves.length === 0) return true;
      const last = waves[waves.length - 1];
      return last.result === "무응답" && last.wave_number < 3;
    }),
  [contactInstructors, wavesMap]);

  const filtered = useMemo(() => {
    let list = contactInstructors;
    if (viewFilter === "needs_followup") list = needsFollowup;
    else if (viewFilter !== "all") list = list.filter((i) => i.status === viewFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name?.toLowerCase().includes(q) || i.field?.toLowerCase().includes(q) || i.assignee?.toLowerCase().includes(q));
    }
    return list;
  }, [contactInstructors, viewFilter, search, needsFollowup]);

  const handleWaveUpdate = async (instructorId: string, waveNumber: number, field: string, value: string) => {
    try {
      const existing = (wavesMap[instructorId] || []).find((w) => w.wave_number === waveNumber);
      const body: any = { wave_number: waveNumber, sent_date: existing?.sent_date || null, result: existing?.result || "", [field]: value };
      await fetch(`/api/instructors/${instructorId}/waves`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await loadAllWaves();
    } catch { toast.error("업데이트 실패"); }
  };

  const handleStartOutreach = async (i: Instructor) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/instructors/${i.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "진행 중", _changed_by: i.assignee, _reason: "발송 시작" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = await res.json();
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: updated });
      await fetch(`/api/instructors/${i.id}/waves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wave_number: 1, sent_date: today, result: "" }),
      });
      await Promise.all([loadAllWaves(), loadStats()]);
      toast.success(`${i.name} 발송 시작`);
    } catch (e: any) { toast.error(e.message); }
  };

  const cnt = (s: string) => contactInstructors.filter((i) => i.status === s).length;
  const getWave = (id: string, n: number) => (wavesMap[id] || []).find((w) => w.wave_number === n);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">컨택관리</h2>

      {/* 필터 칩 */}
      <div className="flex gap-1.5 flex-wrap">
        {([
          { key: "all" as ViewFilter, label: `전체 (${contactInstructors.length})` },
          { key: "발송 예정" as ViewFilter, label: `발송 예정 (${cnt("발송 예정")})`, icon: Send },
          { key: "진행 중" as ViewFilter, label: `진행 중 (${cnt("진행 중")})`, icon: Clock },
          { key: "needs_followup" as ViewFilter, label: `후속 필요 (${needsFollowup.length})`, icon: AlertCircle, highlight: needsFollowup.length > 0 },
          { key: "계약 완료" as ViewFilter, label: `계약 (${cnt("계약 완료")})` },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => setViewFilter(f.key)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              viewFilter === f.key
                ? "border-primary/50 bg-primary/10 text-primary"
                : f.highlight
                ? "border-orange-300 bg-orange-50 text-orange-700"
                : "border-transparent bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.icon && <f.icon className="h-3 w-3" />}
            {f.label}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="이름, 분야, 담당자..." className="h-7 text-xs pl-7" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <span className="text-xs text-muted-foreground">{filtered.length}명</span>

      {/* 테이블 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="py-1.5 text-xs">이름</TableHead>
              <TableHead className="py-1.5 text-xs">상태</TableHead>
              <TableHead className="py-1.5 text-xs">분야</TableHead>
              <TableHead className="py-1.5 text-xs">담당자</TableHead>
              <TableHead className="py-1.5 text-xs text-center">1차</TableHead>
              <TableHead className="py-1.5 text-xs text-center">2차</TableHead>
              <TableHead className="py-1.5 text-xs text-center">3차</TableHead>
              <TableHead className="py-1.5 text-xs">최종</TableHead>
              <TableHead className="py-1.5 text-xs w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-6 text-xs text-muted-foreground">해당하는 강사가 없습니다.</TableCell>
              </TableRow>
            ) : (
              filtered.map((i, idx) => (
                <TableRow key={i.id} className={idx % 2 === 1 ? "bg-muted/20" : ""}>
                  <TableCell
                    className="py-1 text-xs font-medium cursor-pointer hover:underline"
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
                  <TableCell className="py-1">
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge>
                  </TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">{i.field}</TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">{i.assignee}</TableCell>
                  {[1, 2, 3].map((n) => {
                    const w = getWave(i.id, n);
                    return (
                      <TableCell key={n} className="py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-center gap-0.5">
                          <Input type="date" className="w-[110px] h-6 text-[10px]" value={w?.sent_date || ""} onChange={(e) => handleWaveUpdate(i.id, n, "sent_date", e.target.value)} />
                          <Select value={w?.result || "_none"} onValueChange={(v) => handleWaveUpdate(i.id, n, "result", v === "_none" ? "" : v)}>
                            <SelectTrigger className="w-[80px] h-5 text-[10px]"><SelectValue placeholder="-" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">-</SelectItem>
                              {WAVE_RESULTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell className="py-1 text-xs text-muted-foreground">{i.final_status || "-"}</TableCell>
                  <TableCell className="py-1">
                    {i.status === "발송 예정" && (
                      <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => handleStartOutreach(i)}>
                        <Send className="h-3 w-3 mr-0.5" />발송
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
