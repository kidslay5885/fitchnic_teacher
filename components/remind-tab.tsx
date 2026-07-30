"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { suggestForEvent, type Suggestion } from "@/lib/timetable-match";
import type { Instructor, TimetableEvent } from "@/lib/types";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, RefreshCw, Search, X, UserX, Check, CheckCircle2,
  CalendarClock, Rocket, Phone, AlertTriangle,
} from "lucide-react";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// 리마인드를 표시하지 않는 상태 (다시 연락할 일이 없는 강사) — 미팅관리 탭과 동일 규칙
const REMIND_HIDDEN_STATUSES = ["제외", "거절"];

// 자동 동기화 간격 (마지막 동기화가 이보다 오래됐으면 탭 진입 시 갱신)
const SYNC_STALE_MS = 6 * 60 * 60 * 1000;

type RemindKind = "meeting" | "kickoff" | "followup";

// label: 목록·필터용 짧은 이름 / legend: 캘린더 범례용 (리마인드 시점까지 표기)
const KIND_META: Record<RemindKind, {
  label: string; legend: string; icon: React.ElementType; chip: string; dot: string;
}> = {
  meeting: {
    label: "강사미팅",
    legend: "강사미팅 D-1",
    icon: CalendarClock,
    chip: "bg-sky-100 border-sky-300 text-sky-900 hover:bg-sky-200",
    dot: "bg-sky-200 border-sky-400",
  },
  kickoff: {
    label: "킥오프",
    legend: "킥오프 D-1",
    icon: Rocket,
    chip: "bg-violet-100 border-violet-300 text-violet-900 hover:bg-violet-200",
    dot: "bg-violet-200 border-violet-400",
  },
  followup: {
    label: "재연락",
    legend: "재연락 당일",
    icon: Phone,
    chip: "bg-slate-200 border-slate-400 text-slate-800 hover:bg-slate-300",
    dot: "bg-slate-200 border-slate-400",
  },
};

// 매칭 근거별 설명 (매칭 모달에서 무엇을 근거로 잡혔는지 문장으로 보여준다)
const MATCH_REASON_TEXT: Record<string, string> = {
  "일정+이름": "이름과 미팅일이 모두 일치",
  일정: "미팅일이 일치 — 시간표와 DB의 이름 표기는 다릅니다",
  이름: "이름이 일치",
  자동: "자동으로 매칭",
  수동: "직접 지정한 강사",
};

interface RemindItem {
  key: string;
  kind: RemindKind;
  remindDate: string;      // 리마인드할 날짜 (미팅 전날 / 재연락 예정일)
  targetDate: string;      // 원래 일정 날짜
  time: string;
  name: string;            // 화면 표시 이름
  instructorId: string | null;
  instructor?: Instructor;
  done: boolean;
  event?: TimetableEvent;  // 시간표에서 온 항목
  note: string;            // 부가 정보 (대면/줌, 의전 등)
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseIso = (s: string): Date | null => {
  const m = (s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
/**
 * 리마인드 날짜 = 일정 전날.
 * 단 전날이 일요일이면(= 월요일 일정) 연락이 안 되므로 직전 금요일로 당긴다.
 */
const remindDateFor = (iso: string) => {
  const d = parseIso(iso);
  if (!d) return "";
  d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  return toIso(d);
};
const formatDay = (iso: string) => {
  const d = parseIso(iso);
  if (!d) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
};

/** 미팅관리 리마인드 기본 날짜: 미팅일 1달 후, 주말이면 금요일로 — 미팅관리 탭과 동일 */
const calcFollowupDate = (meetingDate: string) => {
  const m = (meetingDate || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  d.setMonth(d.getMonth() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  return toIso(d);
};

export default function RemindTab() {
  const { state, dispatch } = useOutreach();
  const [events, setEvents] = useState<TimetableEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [showDone, setShowDone] = useState(false);
  const [kinds, setKinds] = useState<RemindKind[]>(["meeting", "kickoff", "followup"]);
  const [matchTarget, setMatchTarget] = useState<TimetableEvent | null>(null);
  const [outsideGrid, setOutsideGrid] = useState<{ sheet: string; cell: string; text: string }[]>([]);
  const [infoModal, setInfoModal] = useState<"outside" | "unmatched" | null>(null);
  const didInit = useRef(false);

  const now = useMemo(() => new Date(), []);
  const todayIso = toIso(now);

  const loadEvents = useCallback(async () => {
    const res = await fetch("/api/timetable/events");
    if (!res.ok) throw new Error("일정 조회 실패");
    setEvents(await res.json());
  }, []);

  const runSync = useCallback(async (silent: boolean) => {
    setSyncing(true);
    try {
      const res = await fetch("/api/timetable/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "동기화 실패");
      setLastSync(data.last_sync);
      await loadEvents();
      // 주간 표 바깥에 적힌 강사미팅은 날짜를 알 수 없어 못 가져온다 → 시트 확인 안내
      const outside: { sheet: string; cell: string; text: string }[] = data.outside_grid || [];
      setOutsideGrid(outside);
      if (outside.length > 0) {
        toast.warning(
          `시간표 표 바깥에 적힌 강사미팅 ${outside.length}건은 날짜를 알 수 없어 제외했습니다`,
          { description: outside.map((o) => `${o.sheet} ${o.cell}: ${o.text}`).join("\n") },
        );
      }
      if (!silent) {
        const r = data.by_reason || {};
        const detail = [
          r["이름"] ? `이름 ${r["이름"]}` : "",
          r["일정+이름"] ? `일정+이름 ${r["일정+이름"]}` : "",
          r["일정"] ? `일정 ${r["일정"]}` : "",
        ].filter(Boolean).join(", ");
        toast.success(
          `시간표 ${data.synced}건 · 매칭 ${data.matched}(${detail || "-"}) / 미매칭 ${data.unmatched}`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  }, [loadEvents]);

  // 탭 진입 시: 일정 로드 + 마지막 동기화가 6시간 이상 지났으면 자동 갱신
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      try {
        await loadEvents();
        const res = await fetch("/api/timetable/sync");
        const { last_sync } = await res.json();
        setLastSync(last_sync);
        const stale = !last_sync || Date.now() - new Date(last_sync).getTime() > SYNC_STALE_MS;
        if (stale) await runSync(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "불러오기 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadEvents, runSync]);

  const instructorById = useMemo(
    () => new Map(state.instructors.map((i) => [i.id, i])),
    [state.instructors],
  );

  // ── 3종류 리마인드를 하나의 목록으로 합치기 ──
  const allItems = useMemo(() => {
    const items: RemindItem[] = [];

    for (const ev of events) {
      const inst = ev.instructor_id ? instructorById.get(ev.instructor_id) : undefined;
      // 매칭된 강사가 제외/거절이면 리마인드 대상이 아니다
      if (inst && REMIND_HIDDEN_STATUSES.includes(inst.status)) continue;
      const note = [ev.meeting_mode, ev.protocol ? `의전${ev.protocol}` : ""].filter(Boolean).join(" · ");
      items.push({
        key: `ev-${ev.id}`,
        kind: ev.event_type === "킥오프" ? "kickoff" : "meeting",
        remindDate: remindDateFor(ev.event_date),
        targetDate: ev.event_date,
        time: ev.event_time,
        name: inst?.name || ev.display_name || ev.raw_text,
        instructorId: ev.instructor_id,
        instructor: inst,
        done: ev.remind_done,
        event: ev,
        note,
      });
    }

    for (const i of state.instructors) {
      if (REMIND_HIDDEN_STATUSES.includes(i.status)) continue;
      if (i.remind_disabled) continue;
      const date = i.remind_date || calcFollowupDate(i.meeting_date || "");
      if (!date) continue;
      items.push({
        key: `fu-${i.id}`,
        kind: "followup",
        remindDate: date,
        targetDate: (i.meeting_date || "").slice(0, 10),
        time: (i.meeting_date || "").match(/\d{1,2}:\d{2}/)?.[0] || "",
        name: i.name,
        instructorId: i.id,
        instructor: i,
        done: !!i.remind_done,
        note: i.meeting_type || "",
      });
    }

    return items.sort((a, b) => (a.remindDate + a.time).localeCompare(b.remindDate + b.time));
  }, [events, state.instructors, instructorById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((it) => {
      if (!kinds.includes(it.kind)) return false;
      if (!showDone && it.done) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.event?.raw_text || "").toLowerCase().includes(q) ||
        (it.instructor?.field || "").toLowerCase().includes(q)
      );
    });
  }, [allItems, kinds, showDone, search]);

  // 지난 / 오늘 / 예정
  const overdue = filtered.filter((it) => it.remindDate < todayIso && !it.done);
  const today = filtered.filter((it) => it.remindDate === todayIso);
  const upcoming = filtered.filter((it) => it.remindDate > todayIso);

  const unmatched = useMemo(
    () => events.filter((e) => e.match_type === "미매칭"),
    [events],
  );

  // ── 완료 토글 ──
  const toggleDone = async (it: RemindItem) => {
    try {
      if (it.event) {
        const res = await fetch("/api/timetable/events", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: it.event.id, remind_done: !it.done }),
        });
        if (!res.ok) throw new Error();
        const updated: TimetableEvent = await res.json();
        setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      } else if (it.instructorId) {
        const res = await fetch(`/api/instructors/${it.instructorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remind_done: !it.done }),
        });
        if (!res.ok) throw new Error();
        dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      }
    } catch {
      toast.error("저장 실패");
    }
  };

  // ── 달력 ──
  const viewDate = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return d;
  }, [now, monthOffset]);
  const monthLabel = `${viewDate.getFullYear()}년 ${viewDate.getMonth() + 1}월`;

  const calendarDays = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return { date: d, iso: toIso(d), inMonth: d.getMonth() === viewDate.getMonth() };
    });
  }, [viewDate]);

  const byDate = useMemo(() => {
    const map: Record<string, RemindItem[]> = {};
    for (const it of filtered) {
      if (!it.remindDate) continue;
      (map[it.remindDate] ||= []).push(it);
    }
    return map;
  }, [filtered]);

  const toggleKind = (k: RemindKind) =>
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const syncLabel = lastSync
    ? (() => {
        const diff = Date.now() - new Date(lastSync).getTime();
        const h = Math.floor(diff / 3600000);
        const m = Math.floor(diff / 60000);
        return h >= 1 ? `${h}시간 전 동기화` : `${m}분 전 동기화`;
      })()
    : "동기화 안 됨";

  const renderRows = (items: RemindItem[]) =>
    items.map((it) => {
      const meta = KIND_META[it.kind];
      const needMatch = it.event && it.event.match_type === "미매칭";
      return (
        <tr key={it.key} className={`border-b hover:bg-muted/40 ${it.done ? "opacity-55" : ""}`}>
          <td className="px-3 py-2 border-r border-gray-200/60 whitespace-nowrap font-medium">
            {formatDay(it.remindDate)}
          </td>
          <td className="px-2 py-2 border-r border-gray-200/60 whitespace-nowrap">
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] border ${meta.chip}`}>
              {/* 재연락만 아이콘 유지 (미팅관리 탭 캘린더의 📞 표기와 맞춤) */}
              {it.kind === "followup" && <meta.icon className="h-3 w-3" />}
              {meta.label}
            </span>
          </td>
          <td className="px-3 py-2 border-r border-gray-200/60 max-w-[220px]">
            {/* 시간표에서 온 일정은 이름을 눌러 매칭 모달을 연다 (재연락은 매칭 대상이 아님) */}
            {it.event ? (
              <button
                onClick={() => setMatchTarget(it.event!)}
                className="flex items-center gap-1.5 w-full text-left hover:underline decoration-dotted underline-offset-2"
                title={`${it.event.raw_text}\n(클릭: 강사 매칭 확인·변경)`}
              >
                <span className={`truncate ${it.done ? "line-through" : ""}`}>{it.name}</span>
                {needMatch && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] bg-amber-100 border border-amber-300 text-amber-800">
                    <AlertTriangle className="h-2.5 w-2.5" />미매칭
                  </span>
                )}
              </button>
            ) : (
              <span className={`block truncate ${it.done ? "line-through" : ""}`} title={it.name}>
                {it.name}
              </span>
            )}
          </td>
          <td className="px-3 py-2 border-r border-gray-200/60 whitespace-nowrap text-muted-foreground hidden sm:table-cell">
            {it.targetDate ? `${formatDay(it.targetDate)}${it.time ? ` ${it.time}` : ""}` : "-"}
          </td>
          <td className="px-3 py-2 border-r border-gray-200/60 text-muted-foreground truncate max-w-[140px] hidden md:table-cell">
            {it.note || "-"}
          </td>
          <td className="px-2 py-2 text-center whitespace-nowrap">
            <button
              onClick={() => toggleDone(it)}
              className={`h-6 w-6 inline-flex items-center justify-center rounded border transition-colors ${
                it.done
                  ? "bg-green-100 border-green-300 text-green-700"
                  : "bg-white border-gray-300 text-transparent hover:border-gray-400"
              }`}
              title={it.done ? "완료 해제" : "리마인드 완료"}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </td>
        </tr>
      );
    });

  const sectionHeader = (label: string, count: number, cls: string) => (
    <tr>
      <td colSpan={6} className={`px-3 py-1.5 text-xs font-semibold border-b ${cls}`}>
        {label} ({count})
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4" style={{ height: "calc(100vh - 56px)" }}>
      {/* ── 좌측: 리마인드 목록 ── */}
      <div className="flex flex-col w-full lg:flex-1 lg:min-w-[750px]">
        <div className="shrink-0 space-y-3 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">리마인드</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{syncLabel}</span>
              <Button
                size="sm" variant="outline" className="h-8 text-sm"
                onClick={() => runSync(false)} disabled={syncing}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
                시간표 동기화
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="강사명, 시간표 원문..."
              className="h-8 text-sm pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap text-sm">
            {(Object.keys(KIND_META) as RemindKind[]).map((k) => {
              const meta = KIND_META[k];
              const on = kinds.includes(k);
              const count = allItems.filter((it) => it.kind === k && (showDone || !it.done)).length;
              return (
                <button
                  key={k}
                  onClick={() => toggleKind(k)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border transition-colors ${
                    on ? meta.chip : "bg-white border-gray-200 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {k === "followup" && <meta.icon className="h-3 w-3" />}
                  {meta.label} {count}
                </button>
              );
            })}
            <button
              onClick={() => setShowDone(!showDone)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border transition-colors ${
                showDone ? "bg-green-100 border-green-300 text-green-800" : "bg-white border-gray-200 text-muted-foreground hover:bg-muted"
              }`}
            >
              <Check className="h-3 w-3" />완료 포함
            </button>
            <span className="ml-auto flex items-center gap-3">
              {outsideGrid.length > 0 && (
                <button
                  onClick={() => setInfoModal("outside")}
                  className="inline-flex items-center gap-1 text-xs text-orange-700 hover:underline"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />표 바깥 일정 {outsideGrid.length}건 (날짜 불명)
                </button>
              )}
              {unmatched.length > 0 && (
                <button
                  onClick={() => setInfoModal("unmatched")}
                  className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />수동 매칭 필요 {unmatched.length}건
                </button>
              )}
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#f8f9fa] text-xs font-semibold text-muted-foreground">
              <tr className="border-b">
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">리마인드일</th>
                <th className="text-left px-2 py-2 border-r border-gray-200 whitespace-nowrap">종류</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">강사</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap hidden sm:table-cell">미팅 일시</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap hidden md:table-cell">정보</th>
                <th className="text-center px-2 py-2 whitespace-nowrap">완료</th>
              </tr>
            </thead>
            <tbody>
              {overdue.length > 0 && (
                <>
                  {sectionHeader("지난 리마인드", overdue.length, "bg-red-50 text-red-700")}
                  {renderRows(overdue)}
                </>
              )}
              {today.length > 0 && (
                <>
                  {sectionHeader("오늘", today.length, "bg-blue-50 text-blue-700")}
                  {renderRows(today)}
                </>
              )}
              {upcoming.length > 0 && (
                <>
                  {sectionHeader("예정", upcoming.length, "bg-gray-100 text-gray-600")}
                  {renderRows(upcoming)}
                </>
              )}
            </tbody>
          </table>
          {loading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">표시할 리마인드가 없습니다.</div>
          ) : null}
        </div>
      </div>

      {/* ── 우측: 캘린더 ── */}
      <div className="flex flex-col w-full lg:w-[calc(100vw-1022px)] lg:min-w-[380px] lg:max-w-[900px] lg:shrink-0 min-h-[400px]">
        <div className="shrink-0 flex items-center gap-2 sm:gap-3 pb-3 pt-3 lg:pt-9">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setMonthOffset(monthOffset - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[100px] text-center">{monthLabel}</span>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setMonthOffset(monthOffset + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {monthOffset !== 0 && (
            <Button size="sm" variant="ghost" className="h-8 text-sm" onClick={() => setMonthOffset(0)}>이번 달</Button>
          )}
          <span className="ml-2 text-2xl font-bold tracking-tight whitespace-nowrap">D-1 리마인드 일정</span>
          <div className="ml-auto flex items-center flex-wrap justify-end gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {(Object.keys(KIND_META) as RemindKind[]).map((k) => (
              <span key={k} className="flex items-center gap-1 whitespace-nowrap">
                <span className={`h-2.5 w-2.5 rounded-sm border ${KIND_META[k].dot}`} />
                {KIND_META[k].legend}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
          <div className="grid grid-cols-7 bg-[#f8f9fa] border-b shrink-0">
            {DAY_NAMES.map((d, i) => (
              <div
                key={d}
                className={`text-center text-xs font-semibold py-2 ${
                  i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted-foreground"
                } ${i < 6 ? "border-r border-gray-200" : ""}`}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="flex-1 grid grid-rows-6">
            {Array.from({ length: 6 }, (_, week) => (
              <div key={week} className={`grid grid-cols-7 ${week < 5 ? "border-b" : ""}`}>
                {calendarDays.slice(week * 7, week * 7 + 7).map((cell, ci) => {
                  const dayItems = cell.inMonth ? byDate[cell.iso] || [] : [];
                  const isToday = cell.iso === todayIso;
                  return (
                    <div
                      key={ci}
                      className={`p-1 overflow-hidden ${ci < 6 ? "border-r border-gray-200" : ""} ${
                        !cell.inMonth ? "bg-gray-50/50" : isToday ? "bg-primary/5" : "bg-white"
                      }`}
                    >
                      {cell.inMonth && (
                        <>
                          <div className={`text-xs mb-0.5 ${
                            isToday ? "text-primary font-bold" : ci === 0 ? "text-red-400" : ci === 6 ? "text-blue-400" : "text-muted-foreground"
                          }`}>
                            {cell.date.getDate()}
                          </div>
                          <div className="space-y-0.5">
                            {dayItems.map((it) => {
                              const meta = KIND_META[it.kind];
                              const Icon = meta.icon;
                              return (
                                <button
                                  key={it.key}
                                  onClick={() => toggleDone(it)}
                                  className={`w-full text-left rounded px-1.5 py-0.5 text-[11px] transition-colors truncate border ${
                                    it.done ? "bg-green-50 border-green-200 text-green-700" : meta.chip
                                  }`}
                                  title={`${meta.label} · ${it.name}${it.time ? ` (${formatDay(it.targetDate)} ${it.time})` : ""}${it.event ? `\n${it.event.raw_text}` : ""}`}
                                >
                                  <span className={`font-medium inline-flex items-center gap-0.5 ${it.done ? "line-through" : ""}`}>
                                    {/* 완료 체크는 항상, 종류 아이콘은 재연락만 (강사미팅·킥오프는 색으로 구분) */}
                                    {it.done
                                      ? <Check className="h-2.5 w-2.5" />
                                      : it.kind === "followup" && <Icon className="h-2.5 w-2.5" />}
                                    {it.name}
                                  </span>
                                  {it.time && <span className="ml-1 opacity-60">{it.time}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 표 바깥 일정 / 수동 매칭 필요 목록 모달 ── */}
      {infoModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setInfoModal(null)}>
          <Card className="w-full max-w-[560px] max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-4 space-y-3 overflow-y-auto">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold">
                    {infoModal === "outside"
                      ? `표 바깥 일정 ${outsideGrid.length}건`
                      : `수동 매칭 필요 ${unmatched.length}건`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {infoModal === "outside"
                      ? "주간 표 오른쪽 여백에 적혀 있어 날짜를 확정할 수 없는 강사미팅입니다."
                      : "이름과 미팅일로 강사를 찾지 못한 일정입니다."}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setInfoModal(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {infoModal === "outside" ? (
                <>
                  <div className="rounded-lg border border-l-4 border-l-orange-500 bg-orange-50 px-3 py-2.5 text-xs text-orange-800">
                    시간표에서 해당 셀을 <strong>표 안쪽 날짜 칸으로 옮기면</strong> 다음 동기화에 자동으로 들어옵니다.
                  </div>
                  <div className="space-y-1.5">
                    {outsideGrid.map((o) => (
                      <div key={`${o.sheet}-${o.cell}`} className="rounded border px-2.5 py-2">
                        <p className="text-xs font-medium text-muted-foreground">{o.sheet} · {o.cell}</p>
                        <p className="mt-0.5 text-sm break-words">{o.text}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  {unmatched.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => { setMatchTarget(ev); setInfoModal(null); }}
                      className="w-full text-left rounded border px-2.5 py-2 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {formatDay(ev.event_date)} {ev.event_time}
                        </span>
                        <span className={`rounded px-1 py-0.5 text-[10px] border ${
                          KIND_META[ev.event_type === "킥오프" ? "kickoff" : "meeting"].chip
                        }`}>
                          {ev.event_type}
                        </span>
                        <span className="ml-auto text-[11px]">{ev.sheet} · {ev.cell}</span>
                      </div>
                      <p className="mt-1 text-sm break-words">{ev.raw_text}</p>
                      <p className="mt-0.5 text-xs text-primary">클릭하면 강사를 지정할 수 있습니다</p>
                    </button>
                  ))}
                  {unmatched.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">미매칭 일정이 없습니다.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 수동 매칭 모달 ── */}
      {matchTarget && (
        <MatchModal
          event={matchTarget}
          instructors={state.instructors}
          onClose={() => setMatchTarget(null)}
          onSaved={(updated, affected) => {
            setEvents((prev) =>
              prev.map((e) => {
                if (e.id === updated.id) return updated;
                if (affected.has(e.id)) {
                  return { ...e, instructor_id: updated.instructor_id, match_type: updated.match_type };
                }
                return e;
              }),
            );
            setMatchTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ── 강사 수동 매칭 모달 ──
function MatchModal({
  event, instructors, onClose, onSaved,
}: {
  event: TimetableEvent;
  instructors: Instructor[];
  onClose: () => void;
  onSaved: (updated: TimetableEvent, affectedIds: Set<string>) => void;
}) {
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  // 자동 매칭과 같은 로직으로 후보 추천 (이름 + 미팅일 대조)
  const suggestions = useMemo(
    () => suggestForEvent(event, instructors),
    [event, instructors],
  );
  const instructorById = useMemo(
    () => new Map(instructors.map((i) => [i.id, i])),
    [instructors],
  );

  // 현재 매칭된 강사와 그 근거 (자동은 근거를, 수동은 '수동'을 라벨로 쓴다)
  const matched = event.instructor_id ? instructorById.get(event.instructor_id) : undefined;
  const matchLabel = event.match_type === "자동"
    ? (event.match_reason || "자동")
    : event.match_type;

  const results = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return [];
    return instructors
      .filter((i) => i.name.toLowerCase().includes(key))
      .slice(0, 30);
  }, [q, instructors]);

  const save = async (instructorId: string | null) => {
    setSaving(true);
    try {
      const res = await fetch("/api/timetable/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, instructor_id: instructorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      toast.success(instructorId ? "강사 매칭 완료" : "강사 아님으로 표시");
      onSaved(data, new Set<string>());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const row = (i: Instructor, reason?: Suggestion["reason"]) => (
    <button
      key={i.id}
      disabled={saving}
      onClick={() => save(i.id)}
      className={`w-full text-left px-2.5 py-1.5 rounded border text-sm transition-colors hover:bg-muted ${
        i.id === event.instructor_id ? "border-primary bg-primary/5" : "border-gray-200"
      }`}
    >
      <span className="font-medium">{i.name}</span>
      {reason && reason !== "이름" && (
        <span className="ml-1.5 text-xs font-medium text-indigo-600">
          {reason === "일정" ? "미팅일 일치" : "이름·미팅일 일치"}
        </span>
      )}
      <span className="ml-2 text-xs text-muted-foreground">
        {i.status}{i.field ? ` · ${i.field}` : ""}
        {i.meeting_date ? ` · 미팅 ${i.meeting_date}` : ""}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-[520px] max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-4 space-y-3 overflow-y-auto">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-base font-semibold">강사 수동 매칭</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {event.event_date} {event.event_time} · {event.event_type}
              </p>
            </div>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded border bg-gray-50 px-2.5 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">시간표 원문</span>
            <p className="mt-0.5 break-words">{event.raw_text}</p>
          </div>

          {/* 현재 매칭 상태 — 어떤 강사에 어떤 근거로 붙었는지 한눈에 보이게 */}
          {matched ? (
            <div className="rounded-lg border border-l-4 border-l-emerald-500 bg-emerald-50/60 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-semibold">매칭됨</span>
              </div>
              <p className="mt-1 text-base font-semibold text-foreground break-words">{matched.name}</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                {MATCH_REASON_TEXT[matchLabel] ?? matchLabel}
              </p>
              <div className="mt-2 pt-2 border-t border-emerald-200/70 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                <span className="text-muted-foreground">시간표 일정</span>
                <span className="text-foreground">{event.event_date} {event.event_time}</span>
                <span className="text-muted-foreground">DB 미팅일</span>
                <span className={matched.meeting_date ? "text-foreground" : "text-muted-foreground"}>
                  {matched.meeting_date || "없음"}
                </span>
                <span className="text-muted-foreground">상태</span>
                <span className="text-foreground">{matched.status}</span>
              </div>
            </div>
          ) : event.match_type === "해당없음" ? (
            <div className="rounded-lg border border-l-4 border-l-gray-400 bg-gray-50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-gray-600">
                <UserX className="h-4 w-4" />
                <span className="text-xs font-semibold">강사 아님으로 표시됨</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                이 일정은 강사 매칭 대상이 아닙니다. 아래에서 강사를 지정하면 해제됩니다.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-l-4 border-l-amber-500 bg-amber-50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-semibold">미매칭</span>
              </div>
              <p className="mt-1 text-xs text-amber-800">
                이름과 미팅일로 강사를 찾지 못했습니다. 아래에서 직접 지정해주세요.
              </p>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">추천 후보</p>
              <div className="space-y-1">
                {suggestions.map((s) => {
                  const inst = instructorById.get(s.instructorId);
                  return inst ? row(inst, s.reason) : null;
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">직접 검색</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="강사명 검색..."
                className="h-8 text-sm pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="space-y-1 max-h-[220px] overflow-y-auto">
              {results.map((i) => row(i))}
              {q.trim() && results.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 text-center">검색 결과가 없습니다.</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1 border-t">
            <Button
              size="sm" variant="outline" className="h-8 text-sm flex-1"
              disabled={saving}
              onClick={() => save(null)}
            >
              <UserX className="h-3.5 w-3.5 mr-1" />강사 아님 (매칭 제외)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
