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
import { STATUS_COLORS, WAVE_RESULTS } from "@/lib/constants";
import type { Instructor, InstructorStatus, OutreachWave } from "@/lib/types";
import { toast } from "sonner";
import { Send, Clock, AlertCircle, Search } from "lucide-react";

const CONTACT_STATUSES: InstructorStatus[] = ["발송 예정", "진행 중", "계약 완료", "보류", "거절"];
type ViewFilter = "all" | "발송 예정" | "진행 중" | "needs_followup" | "계약 완료" | "보류" | "거절";

const ROW_H = 56;

export default function ContactTab() {
  const { state, dispatch, loadInstructors, loadStats } = useOutreach();
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [search, setSearch] = useState("");
  const [wavesMap, setWavesMap] = useState<Record<string, OutreachWave[]>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 15,
  });

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
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      <div className="shrink-0 space-y-3 pb-3">
        <h2 className="text-lg font-semibold">컨택관리</h2>

        <div className="flex gap-2 flex-wrap">
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
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                viewFilter === f.key
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : f.highlight
                  ? "border-orange-300 bg-orange-50 text-orange-700"
                  : "border-transparent bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.icon && <f.icon className="h-3.5 w-3.5" />}
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

      {/* 가상화 테이블 */}
      <div className="border rounded flex-1 min-h-0 flex flex-col">
        <div className="flex bg-[#f8f9fa] border-b shrink-0 text-xs font-semibold text-muted-foreground" style={{ minWidth: 980 }}>
          <div className="w-[110px] px-2 py-2 border-r">이름</div>
          <div className="w-[80px] px-2 py-2 border-r">상태</div>
          <div className="w-[90px] px-2 py-2 border-r">분야</div>
          <div className="w-[72px] px-2 py-2 border-r">담당자</div>
          <div className="w-[170px] px-2 py-2 border-r text-center">1차</div>
          <div className="w-[170px] px-2 py-2 border-r text-center">2차</div>
          <div className="w-[170px] px-2 py-2 border-r text-center">3차</div>
          <div className="w-[70px] px-2 py-2 border-r">최종</div>
          <div className="w-[60px] px-2 py-2"></div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto" style={{ minWidth: 980 }}>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">해당하는 강사가 없습니다.</div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((vRow) => {
                const i = filtered[vRow.index];
                const idx = vRow.index;
                return (
                  <div
                    key={i.id}
                    className={`flex border-b text-sm ${idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]/50"}`}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, height: ROW_H, transform: `translateY(${vRow.start}px)` }}
                  >
                    <div
                      className="w-[110px] px-2 border-r flex items-center font-medium cursor-pointer hover:underline"
                      onClick={() => {
                        dispatch({ type: "SET_TAB", tab: "instructors" });
                        setTimeout(() => {
                          dispatch({ type: "SET_FILTER", filters: { status: "전체", search: "" } });
                          dispatch({ type: "SELECT_INSTRUCTOR", id: i.id });
                        }, 50);
                      }}
                    >
                      {i.name}
                    </div>
                    <div className="w-[80px] px-2 border-r flex items-center">
                      <Badge className={`text-xs px-1.5 py-0 ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge>
                    </div>
                    <div className="w-[90px] px-2 border-r flex items-center text-muted-foreground truncate">{i.field}</div>
                    <div className="w-[72px] px-2 border-r flex items-center text-muted-foreground">{i.assignee}</div>
                    {[1, 2, 3].map((n) => {
                      const w = getWave(i.id, n);
                      return (
                        <div key={n} className="w-[170px] px-1.5 border-r flex flex-col items-center justify-center gap-1">
                          <Input type="date" className="w-[120px] h-6 text-xs" value={w?.sent_date || ""} onChange={(e) => handleWaveUpdate(i.id, n, "sent_date", e.target.value)} />
                          <Select value={w?.result || "_none"} onValueChange={(v) => handleWaveUpdate(i.id, n, "result", v === "_none" ? "" : v)}>
                            <SelectTrigger className="w-[90px] h-6 text-xs"><SelectValue placeholder="-" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">-</SelectItem>
                              {WAVE_RESULTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                    <div className="w-[70px] px-2 border-r flex items-center text-muted-foreground">{i.final_status || "-"}</div>
                    <div className="w-[60px] px-1.5 flex items-center">
                      {i.status === "발송 예정" && (
                        <Button size="sm" className="h-7 text-xs px-2" onClick={() => handleStartOutreach(i)}>
                          <Send className="h-3 w-3 mr-0.5" />발송
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
