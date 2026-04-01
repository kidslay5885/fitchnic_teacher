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
import { Send, Clock, AlertCircle, Search, X } from "lucide-react";

const CONTACT_STATUSES: InstructorStatus[] = ["발송 예정", "진행 중", "계약 완료", "보류", "거절"];
type ViewFilter = "all" | "발송 예정" | "진행 중" | "needs_followup" | "계약 완료" | "보류" | "거절";

const ROW_H = 36;

// 컬럼 정의 — 헤더/본문 동일하게 사용
const COL = {
  name: 120,
  status: 80,
  field: 140,
  assignee: 80,
  wave: 130,
  final: 80,
  action: 64,
} as const;
const TABLE_W = COL.name + COL.status + COL.field + COL.assignee + COL.wave * 3 + COL.final + COL.action;

export default function ContactTab() {
  const { state, dispatch, loadStats } = useOutreach();
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [search, setSearch] = useState("");
  const [wavesMap, setWavesMap] = useState<Record<string, OutreachWave[]>>({});
  const [editingWave, setEditingWave] = useState<{ instructorId: string; wave: number; x: number; y: number } | null>(null);
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
    overscan: 20,
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

  const formatWave = (w: OutreachWave | undefined) => {
    if (!w || (!w.sent_date && !w.result)) return "-";
    const d = w.sent_date ? (() => { const p = w.sent_date.split("-"); return `${parseInt(p[1])}/${parseInt(p[2])}`; })() : "";
    const r = w.result || "";
    if (d && r) return `${d} · ${r}`;
    if (d) return d;
    return r;
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

      {/* 테이블: 헤더+본문 같은 스크롤 영역 */}
      <div ref={scrollRef} className="border rounded flex-1 min-h-0 overflow-auto">
        {/* 헤더 — 본문과 동일한 flex 구조 사용 */}
        <div className="sticky top-0 z-10 flex bg-[#f8f9fa] border-b text-xs font-semibold text-muted-foreground" style={{ width: TABLE_W, minWidth: TABLE_W }}>
          <div className="px-3 py-2 border-r" style={{ width: COL.name }}>이름</div>
          <div className="px-2 py-2 border-r" style={{ width: COL.status }}>상태</div>
          <div className="px-2 py-2 border-r" style={{ width: COL.field }}>분야</div>
          <div className="px-2 py-2 border-r" style={{ width: COL.assignee }}>담당자</div>
          <div className="px-2 py-2 border-r text-center" style={{ width: COL.wave }}>1차</div>
          <div className="px-2 py-2 border-r text-center" style={{ width: COL.wave }}>2차</div>
          <div className="px-2 py-2 border-r text-center" style={{ width: COL.wave }}>3차</div>
          <div className="px-2 py-2 border-r" style={{ width: COL.final }}>최종</div>
          <div className="px-2 py-2" style={{ width: COL.action }}></div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">해당하는 강사가 없습니다.</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: TABLE_W, minWidth: TABLE_W }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const i = filtered[vRow.index];
              const idx = vRow.index;
              return (
                <div
                  key={i.id}
                  className={`flex border-b text-sm ${idx % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]/50"}`}
                  style={{ position: "absolute", top: 0, left: 0, height: ROW_H, width: TABLE_W, transform: `translateY(${vRow.start}px)` }}
                >
                  <div
                    className="px-3 border-r flex items-center font-medium cursor-pointer hover:underline"
                    style={{ width: COL.name }}
                    onClick={() => {
                      dispatch({ type: "SET_TAB", tab: "instructors" });
                      setTimeout(() => {
                        dispatch({ type: "SET_FILTER", filters: { status: "전체", search: "" } });
                        dispatch({ type: "SELECT_INSTRUCTOR", id: i.id });
                      }, 50);
                    }}
                  >
                    <span className="truncate">{i.name}</span>
                  </div>
                  <div className="px-2 border-r flex items-center" style={{ width: COL.status }}>
                    <Badge className={`text-xs px-1.5 py-0 whitespace-nowrap ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>{i.status}</Badge>
                  </div>
                  <div className="px-2 border-r flex items-center text-muted-foreground" style={{ width: COL.field }}>
                    <span className="truncate">{i.field || ""}</span>
                  </div>
                  <div className="px-2 border-r flex items-center text-muted-foreground" style={{ width: COL.assignee }}>
                    <span className="truncate">{i.assignee || ""}</span>
                  </div>
                  {[1, 2, 3].map((n) => {
                    const w = getWave(i.id, n);
                    const text = formatWave(w);
                    const color = waveColor(w);
                    return (
                      <div
                        key={n}
                        className={`px-2 border-r flex items-center justify-center cursor-pointer hover:bg-blue-50/60 transition-colors ${color}`}
                        style={{ width: COL.wave }}
                        onClick={(e) => handleCellClick(e, i.id, n)}
                      >
                        <span className="text-sm whitespace-nowrap">{text}</span>
                      </div>
                    );
                  })}
                  <div className="px-2 border-r flex items-center text-muted-foreground" style={{ width: COL.final }}>
                    <span className="truncate">{i.final_status || "-"}</span>
                  </div>
                  <div className="px-1.5 flex items-center justify-center" style={{ width: COL.action }}>
                    {i.status === "발송 예정" && (
                      <Button size="sm" className="h-7 text-xs px-2" onClick={() => handleStartOutreach(i)}>발송</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 발송 편집 팝오버 */}
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
    </div>
  );
}

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const popW = 260;
  const popH = 180;
  const adjustedX = Math.min(x, window.innerWidth - popW - 16);
  const adjustedY = y + popH > window.innerHeight ? y - popH - ROW_H - 8 : y;

  const handleSave = async (field: string, value: string) => {
    setSaving(true);
    await onUpdate(field, value);
    setSaving(false);
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
