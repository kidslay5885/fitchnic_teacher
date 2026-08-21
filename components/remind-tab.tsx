"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { suggestForEvent, type Suggestion } from "@/lib/timetable-match";
import {
  TAGS, TAG_COLORS, DONE_STYLE, MEETING_TAGS, KICKOFF_TAGS, LEGEND_TAGS,
  remindDateFor, isAllChecked, toIso, parseIso, type RemindTag,
} from "@/lib/remind-checklist";
import { STATUS_COLORS } from "@/lib/constants";
import type { Instructor, InstructorStatus, TimetableEvent } from "@/lib/types";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, RefreshCw, Search, X, UserX, Check, CheckCircle2,
  AlertTriangle, Trash2, ExternalLink,
} from "lucide-react";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// 리마인드를 표시하지 않는 상태 (다시 연락할 일이 없는 강사) — 미팅관리 탭과 동일 규칙
const REMIND_HIDDEN_STATUSES = ["제외", "거절"];

// 자동 동기화 간격 (마지막 동기화가 이보다 오래됐으면 탭 진입 시 갱신)
const SYNC_STALE_MS = 6 * 60 * 60 * 1000;

// 매칭 근거별 설명 (매칭 모달에서 무엇을 근거로 잡혔는지 문장으로 보여준다)
const MATCH_REASON_TEXT: Record<string, string> = {
  "일정+이름": "이름과 미팅일이 모두 일치",
  일정: "미팅일이 일치 — 시간표와 DB의 이름 표기는 다릅니다",
  이름: "이름이 일치",
  자동: "자동으로 매칭",
  수동: "직접 지정한 강사",
};

/** 캘린더에 놓이는 리마인드 1건 = 일정 하나에서 파생된 (대상 × 태그) */
interface RemindItem {
  key: string;                      // ref_type:ref_id:tag
  refType: "event" | "instructor";
  refId: string;
  tag: RemindTag;
  remindDate: string;               // 리마인드할 날짜 (캘린더에 놓이는 위치)
  eventDate: string;                // 원래 일정 날짜
  time: string;
  name: string;
  instructor?: Instructor;
  event?: TimetableEvent;
  note: string;                     // 대면/줌 · 의전
  checked: string[];
  done: boolean;                    // 체크리스트 전부 체크됨
}

const formatDay = (iso: string) => {
  const d = parseIso(iso);
  return d ? `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})` : iso;
};

/** 미팅관리 재연락 기본 날짜: 미팅일 1달 후, 주말이면 금요일로 — 미팅관리 탭과 동일 */
const calcFollowupDate = (meetingDate: string) => {
  const d = parseIso((meetingDate || "").slice(0, 10));
  if (!d) return "";
  d.setMonth(d.getMonth() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  return toIso(d);
};

export default function RemindTab() {
  const { state, dispatch } = useOutreach();
  const [events, setEvents] = useState<TimetableEvent[]>([]);
  const [checks, setChecks] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [matchTarget, setMatchTarget] = useState<TimetableEvent | null>(null);
  const [followupTarget, setFollowupTarget] = useState<Instructor | null>(null);
  const [outsideGrid, setOutsideGrid] = useState<{ sheet: string; cell: string; text: string }[]>([]);
  const [infoModal, setInfoModal] = useState<"outside" | "unmatched" | null>(null);
  const didInit = useRef(false);

  const now = useMemo(() => new Date(), []);
  const todayIso = toIso(now);

  // ── 데이터 로드 ──
  const loadEvents = useCallback(async () => {
    const res = await fetch("/api/timetable/events");
    if (!res.ok) throw new Error("일정 조회 실패");
    setEvents(await res.json());
  }, []);

  const loadChecks = useCallback(async () => {
    const res = await fetch("/api/remind-checks");
    if (!res.ok) throw new Error("체크 상태 조회 실패");
    const rows: { ref_type: string; ref_id: string; tag: string; checked_items: string[] }[] = await res.json();
    const map: Record<string, string[]> = {};
    for (const r of rows) map[`${r.ref_type}:${r.ref_id}:${r.tag}`] = r.checked_items || [];
    setChecks(map);
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
        toast.success(`시간표 ${data.synced}건 · 매칭 ${data.matched} / 미매칭 ${data.unmatched}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  }, [loadEvents]);

  // 탭 진입 시: 일정·체크상태 로드 + 마지막 동기화가 6시간 이상 지났으면 자동 갱신
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      try {
        await Promise.all([loadEvents(), loadChecks()]);
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
  }, [loadEvents, loadChecks, runSync]);

  const instructorById = useMemo(
    () => new Map(state.instructors.map((i) => [i.id, i])),
    [state.instructors],
  );

  // ── 일정 → 리마인드 파생 ──
  const allItems = useMemo(() => {
    const items: RemindItem[] = [];

    const push = (
      refType: RemindItem["refType"], refId: string, tag: RemindTag,
      base: Omit<RemindItem, "key" | "refType" | "refId" | "tag" | "remindDate" | "checked" | "done">,
      checkedOverride?: string[],
    ) => {
      const key = `${refType}:${refId}:${tag}`;
      const checked = checkedOverride ?? checks[key] ?? [];
      items.push({
        ...base,
        key, refType, refId, tag,
        remindDate: remindDateFor(base.eventDate, tag),
        checked,
        done: isAllChecked(tag, checked),
      });
    };

    for (const ev of events) {
      const inst = ev.instructor_id ? instructorById.get(ev.instructor_id) : undefined;
      // 매칭된 강사가 제외/거절이면 리마인드 대상이 아니다
      if (inst && REMIND_HIDDEN_STATUSES.includes(inst.status)) continue;
      const base = {
        eventDate: ev.event_date,
        time: ev.event_time,
        name: inst?.name || ev.display_name || ev.raw_text,
        instructor: inst,
        event: ev,
        note: [ev.meeting_mode, ev.protocol ? `의전 ${ev.protocol}` : ""].filter(Boolean).join(", "),
      };
      const tags = ev.event_type === "킥오프" ? KICKOFF_TAGS : MEETING_TAGS;
      for (const tag of tags) push("event", ev.id, tag, base);
    }

    for (const i of state.instructors) {
      if (REMIND_HIDDEN_STATUSES.includes(i.status)) continue;
      if (i.remind_disabled) continue;
      const date = i.remind_date || calcFollowupDate(i.meeting_date || "");
      if (!date) continue;
      push("instructor", i.id, "followup", {
        eventDate: date,
        time: "",
        name: i.name,
        instructor: i,
        // 재연락은 미팅 방식보다 지금 강사 상태가 궁금하다
        note: i.status || "",
      // 재연락 완료는 미팅관리와 같은 필드(instructors.remind_done)를 쓴다
      }, i.remind_done ? ["contact"] : []);
    }

    return items.sort((a, b) => (a.remindDate + a.time).localeCompare(b.remindDate + b.time));
  }, [events, state.instructors, instructorById, checks]);

  const byDate = useMemo(() => {
    const map: Record<string, RemindItem[]> = {};
    for (const it of allItems) {
      if (!it.remindDate) continue;
      (map[it.remindDate] ||= []).push(it);
    }
    return map;
  }, [allItems]);

  /** 강사 레코드 수정 — 미팅관리와 같은 store 를 갱신해 양쪽이 함께 반영된다 */
  const patchInstructor = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/instructors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("저장 실패");
    dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
  };

  /** 재연락 삭제 — 미팅관리의 재연락 삭제와 동일하게 처리한다 */
  const deleteFollowup = async (item: RemindItem) => {
    if (!confirm(`${item.name} 재연락을 삭제하시겠습니까?`)) return;
    try {
      await patchInstructor(item.refId, { remind_date: null, remind_done: false, remind_disabled: true });
      setFollowupTarget(null);
      toast.success("재연락 삭제 완료");
    } catch {
      toast.error("삭제 실패");
    }
  };

  // ── 체크 토글 (낙관적 반영 후 저장) ──
  const toggleItem = async (item: RemindItem, itemKey: string) => {
    const next = item.checked.includes(itemKey)
      ? item.checked.filter((k) => k !== itemKey)
      : [...item.checked, itemKey];

    // 재연락 완료는 미팅관리와 연동되도록 강사 레코드에 저장한다
    if (item.tag === "followup") {
      try {
        await patchInstructor(item.refId, { remind_done: next.includes("contact") });
      } catch {
        toast.error("저장 실패");
      }
      return;
    }

    const prev = checks[item.key];
    setChecks((c) => ({ ...c, [item.key]: next }));
    try {
      const res = await fetch("/api/remind-checks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref_type: item.refType, ref_id: item.refId, tag: item.tag, checked_items: next,
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setChecks((c) => ({ ...c, [item.key]: prev || [] }));
      toast.error("저장 실패");
    }
  };

  // ── 달력 — 이번주·다음주 2주만 펼쳐 보여준다 ──
  const weeks = useMemo(() => {
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() - base.getDay() + weekOffset * 7); // 기준 주의 일요일
    return [0, 1].map((w) => {
      const start = new Date(base);
      start.setDate(start.getDate() + w * 7);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return { date: d, iso: toIso(d) };
      });
    });
  }, [now, weekOffset]);

  const rangeLabel = useMemo(() => {
    const a = weeks[0][0].date, b = weeks[1][6].date;
    return a.getMonth() === b.getMonth()
      ? `${a.getFullYear()}년 ${a.getMonth() + 1}월 ${a.getDate()}~${b.getDate()}일`
      : `${a.getMonth() + 1}월 ${a.getDate()}일 ~ ${b.getMonth() + 1}월 ${b.getDate()}일`;
  }, [weeks]);

  const unmatched = useMemo(() => events.filter((e) => e.match_type === "미매칭"), [events]);

  const syncLabel = lastSync
    ? (() => {
        const diff = Date.now() - new Date(lastSync).getTime();
        const h = Math.floor(diff / 3600000);
        return h >= 1 ? `${h}시간 전 동기화` : `${Math.floor(diff / 60000)}분 전 동기화`;
      })()
    : "동기화 안 됨";

  /** 체크박스 한 줄 — 캘린더 카드(짧은 라벨) / 우측 패널(전체 라벨) 공용 */
  const checkRow = (item: RemindItem, itemKey: string, label: string, compact: boolean) => {
    const on = item.checked.includes(itemKey);
    return (
      <button
        key={itemKey}
        onClick={(e) => { e.stopPropagation(); toggleItem(item, itemKey); }}
        className={`flex items-start gap-1.5 w-full text-left transition-colors ${
          compact ? "text-[13px] leading-snug" : "text-sm"
        } ${on ? "text-muted-foreground" : "hover:text-primary"}`}
      >
        <span
          className={`mt-[1px] shrink-0 inline-flex items-center justify-center rounded border ${
            compact ? "h-3.5 w-3.5" : "h-4 w-4"
          } ${on ? "bg-primary border-primary text-white" : "bg-white border-gray-300 text-transparent"}`}
        >
          <Check className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
        </span>
        <span className={compact ? "truncate" : ""}>{label}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="shrink-0 flex items-center gap-2 sm:gap-3 pb-3">
          <h2 className="text-lg font-semibold whitespace-nowrap">리마인드</h2>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setWeekOffset(weekOffset - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[150px] text-center whitespace-nowrap">{rangeLabel}</span>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setWeekOffset(weekOffset + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button size="sm" variant="ghost" className="h-8 text-sm" onClick={() => setWeekOffset(0)}>이번 주</Button>
          )}

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {outsideGrid.length > 0 && (
              <button onClick={() => setInfoModal("outside")} className="inline-flex items-center gap-1 text-xs text-orange-700 hover:underline">
                <AlertTriangle className="h-3.5 w-3.5" />표 바깥 {outsideGrid.length}건
              </button>
            )}
            {unmatched.length > 0 && (
              <button onClick={() => setInfoModal("unmatched")} className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline">
                <AlertTriangle className="h-3.5 w-3.5" />미매칭 {unmatched.length}건
              </button>
            )}
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {loading ? "불러오는 중..." : syncLabel}
            </span>
            <Button size="sm" variant="outline" className="h-8 text-sm" onClick={() => runSync(false)} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />동기화
            </Button>
          </div>
        </div>

        {/* 범례 */}
        <div className="shrink-0 flex items-center flex-wrap gap-x-3 gap-y-1 pb-2 text-[11px] text-muted-foreground">
          {LEGEND_TAGS.map((t) => (
            <span key={t} className="flex items-center gap-1 whitespace-nowrap">
              <span className={`h-2.5 w-2.5 rounded-sm border ${TAG_COLORS[TAGS[t].group].dot}`} />
              {TAGS[t].label}
            </span>
          ))}
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="h-2.5 w-2.5 rounded-sm border bg-gray-100 border-gray-300" />
            완료
          </span>
        </div>

        <div className="flex-1 min-h-0 border rounded-lg overflow-hidden flex flex-col">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 bg-[#f8f9fa] border-b shrink-0">
            {DAY_NAMES.map((d, i) => (
              <div
                key={d}
                className={`text-center text-sm font-semibold py-2 ${
                  i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted-foreground"
                } ${i < 6 ? "border-r border-gray-200" : ""}`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 이번주 · 다음주 */}
          <div className="flex-1 grid grid-rows-2 min-h-0">
            {weeks.map((week, wi) => (
              <div key={wi} className={`grid grid-cols-7 min-h-0 ${wi < 1 ? "border-b" : ""}`}>
                {week.map((cell, ci) => {
                  const dayItems = byDate[cell.iso] || [];
                  const isToday = cell.iso === todayIso;
                  const firstOfMonth = cell.date.getDate() === 1;
                  return (
                    <div
                      key={cell.iso}
                      className={`flex flex-col min-h-0 min-w-0 bg-white ${ci < 6 ? "border-r border-gray-200" : ""}`}
                    >
                      <div className="shrink-0 px-1.5 py-1">
                        <span
                          className={`inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full text-xs ${
                            isToday
                              ? "bg-primary text-white font-bold"
                              : ci === 0 ? "text-red-400" : ci === 6 ? "text-blue-400" : "text-muted-foreground"
                          }`}
                        >
                          {firstOfMonth ? `${cell.date.getMonth() + 1}/${cell.date.getDate()}` : cell.date.getDate()}
                        </span>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-1 space-y-1">
                        {dayItems.map((it) => {
                          const meta = TAGS[it.tag];
                          const color = TAG_COLORS[meta.group];
                          return (
                            <div
                              key={it.key}
                              className={`rounded border px-2 py-1.5 ${it.done ? DONE_STYLE.card : color.card}`}
                            >
                              <div className="flex items-start gap-1">
                                {it.done && <Check className="h-3.5 w-3.5 mt-[3px] shrink-0" />}
                                {/* 시간표 일정은 이름을 눌러 강사 매칭을, 재연락은 사전 정보를 연다 */}
                                {it.event ? (
                                  <button
                                    onClick={() => setMatchTarget(it.event!)}
                                    className={`text-left text-sm font-semibold leading-tight break-all hover:underline decoration-dotted underline-offset-2 ${
                                      it.done ? "" : "text-foreground"
                                    }`}
                                    title={`${it.event.raw_text}
(클릭: 강사 매칭 확인·변경)`}
                                  >
                                    {it.name}
                                    {it.note && <span className="ml-1 font-normal opacity-70">({it.note})</span>}
                                  </button>
                                ) : it.instructor ? (
                                  <button
                                    onClick={() => setFollowupTarget(it.instructor!)}
                                    className={`text-left text-sm font-semibold leading-tight break-all hover:underline decoration-dotted underline-offset-2 ${
                                      it.done ? "" : "text-foreground"
                                    }`}
                                    title="클릭: 재연락 사전 정보 보기"
                                  >
                                    {it.name}
                                    {it.note && <span className="ml-1 font-normal opacity-70">({it.note})</span>}
                                  </button>
                                ) : (
                                  <span className={`text-sm font-semibold leading-tight break-all ${it.done ? "" : "text-foreground"}`}>
                                    {it.name}
                                    {it.note && <span className="ml-1 font-normal opacity-70">({it.note})</span>}
                                  </span>
                                )}
                                {it.tag === "followup" && (
                                  <button
                                    onClick={() => deleteFollowup(it)}
                                    className="ml-auto shrink-0 text-gray-300 hover:text-red-600 transition-colors"
                                    title="재연락 삭제 (미팅관리에서도 삭제됩니다)"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-1 flex-wrap">
                                <span className={`inline-block rounded px-1.5 py-[1px] text-[11px] border ${it.done ? DONE_STYLE.chip : color.chip}`}>
                                  {meta.label}
                                </span>
                                {it.event?.match_type === "미매칭" && (
                                  <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-[1px] text-[11px] bg-amber-100 border border-amber-300 text-amber-800">
                                    <AlertTriangle className="h-2.5 w-2.5" />미매칭
                                  </span>
                                )}
                              </div>
                              <div className="mt-3 space-y-1">
                                {meta.items.map((ci2) => checkRow(it, ci2.key, ci2.short, true))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
                    {infoModal === "outside" ? `표 바깥 일정 ${outsideGrid.length}건` : `수동 매칭 필요 ${unmatched.length}건`}
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
                        <span className="font-medium text-foreground">{formatDay(ev.event_date)} {ev.event_time}</span>
                        <span className={`rounded px-1 py-0.5 text-[10px] border ${
                          TAG_COLORS[ev.event_type === "킥오프" ? "kickoff" : "meeting"].chip
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

      {/* ── 재연락 사전 정보 모달 ── */}
      {followupTarget && (() => {
        // 모달을 연 채 체크를 바꿔도 최신 값이 보이도록 store 에서 다시 읽는다
        const inst = instructorById.get(followupTarget.id) || followupTarget;
        const item = allItems.find((x) => x.refType === "instructor" && x.refId === inst.id);
        return (
          <FollowupModal
            instructor={inst}
            done={!!inst.remind_done}
            remindDate={item?.remindDate || inst.remind_date || ""}
            onToggleDone={() => item && toggleItem(item, "contact")}
            onDelete={() => item && deleteFollowup(item)}
            onClose={() => setFollowupTarget(null)}
          />
        );
      })()}

      {/* ── 수동 매칭 모달 ── */}
      {matchTarget && (
        <MatchModal
          event={matchTarget}
          instructors={state.instructors}
          onClose={() => setMatchTarget(null)}
          onSaved={(updated) => {
            setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setMatchTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ── 재연락 사전 정보 모달 ──
// 완료 체크·삭제 모두 미팅관리와 같은 강사 레코드를 고치므로 양쪽이 함께 반영된다.
function FollowupModal({
  instructor, done, remindDate, onToggleDone, onDelete, onClose,
}: {
  instructor: Instructor;
  done: boolean;
  remindDate: string;
  onToggleDone: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const igUrl = instructor.instagram
    ? (instructor.instagram.startsWith("http") ? instructor.instagram : `https://instagram.com/${instructor.instagram}`)
    : "";

  // 사후 정보는 JSON({special, positive, negative}) 또는 옛 방식의 평문으로 들어온다
  const post = (() => {
    try {
      const p = JSON.parse(instructor.post_info || "");
      return { special: p.special || "", positive: p.positive || "", negative: p.negative || "" };
    } catch {
      return { special: instructor.post_info || "", positive: "", negative: "" };
    }
  })();

  const infoRow = (label: string, value: string) => (
    <div className="flex gap-3 text-sm">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <span className="break-words">{value || "-"}</span>
    </div>
  );

  const textBlock = (label: string, value: string) =>
    value ? (
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
        <p className="text-sm whitespace-pre-wrap break-words rounded border bg-gray-50/60 px-2.5 py-2">{value}</p>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-[480px] max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-4 space-y-3.5 overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-orange-600">📞</span>
              <p className="text-base font-semibold truncate">{instructor.name} 재연락</p>
              <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${STATUS_COLORS[instructor.status as InstructorStatus] || ""}`}>
                {instructor.status}
              </Badge>
            </div>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* 연락처 */}
          <div className="border rounded-lg p-3 space-y-2 bg-gray-50/50">
            <p className="text-xs font-semibold text-muted-foreground">연락처</p>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground w-16 shrink-0">전화</span>
              {instructor.phone
                ? <a href={`tel:${instructor.phone}`} className="text-blue-600 hover:underline font-medium">{instructor.phone}</a>
                : <span className="text-muted-foreground">-</span>}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground w-16 shrink-0">이메일</span>
              {instructor.email
                ? <a href={`mailto:${instructor.email}`} className="text-blue-600 hover:underline font-medium break-all">{instructor.email}</a>
                : <span className="text-muted-foreground">-</span>}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground w-16 shrink-0">유튜브</span>
              {instructor.youtube
                ? <a href={instructor.youtube} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5">링크<ExternalLink className="h-3 w-3" /></a>
                : <span className="text-muted-foreground">-</span>}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground w-16 shrink-0">인스타</span>
              {igUrl
                ? <a href={igUrl} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline flex items-center gap-0.5">링크<ExternalLink className="h-3 w-3" /></a>
                : <span className="text-muted-foreground">-</span>}
            </div>
          </div>

          {/* 기본 정보 */}
          <div className="space-y-1.5">
            {infoRow("분야", instructor.field)}
            {infoRow("담당자", instructor.assignee)}
            {infoRow("미팅일", instructor.meeting_date)}
            {infoRow("미팅방식", instructor.meeting_type)}
            {infoRow("재연락일", remindDate ? formatDay(remindDate) : "")}
          </div>

          {/* 사전 · 사후 정보 */}
          {textBlock("사전 정보", instructor.pre_info)}
          {textBlock("미팅 메모", instructor.meeting_memo)}
          {textBlock("특이사항", post.special)}
          {textBlock("긍정적 요소", post.positive)}
          {textBlock("부정적 요소", post.negative)}

          {/* 완료 체크 */}
          <button
            onClick={onToggleDone}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
              done ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200 hover:bg-muted"
            }`}
          >
            <span className={`inline-flex items-center justify-center h-4 w-4 rounded border ${
              done ? "bg-green-600 border-green-600 text-white" : "bg-white border-gray-300 text-transparent"
            }`}>
              <Check className="h-3 w-3" />
            </span>
            <span className={`text-sm font-medium ${done ? "text-green-800" : "text-gray-500"}`}>재연락 완료</span>
          </button>

          <div className="flex gap-2 pt-1 border-t">
            <Button
              size="sm" variant="outline"
              className="h-9 text-sm flex-1 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />재연락 삭제
            </Button>
            <Button size="sm" variant="outline" className="h-9 text-sm" onClick={onClose}>닫기</Button>
          </div>
        </CardContent>
      </Card>
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
  onSaved: (updated: TimetableEvent) => void;
}) {
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  // 자동 매칭과 같은 로직으로 후보 추천 (이름 + 미팅일 대조)
  const suggestions = useMemo(() => suggestForEvent(event, instructors), [event, instructors]);
  const instructorById = useMemo(() => new Map(instructors.map((i) => [i.id, i])), [instructors]);

  // 현재 매칭된 강사와 그 근거 (자동은 근거를, 수동은 '수동'을 라벨로 쓴다)
  const matched = event.instructor_id ? instructorById.get(event.instructor_id) : undefined;
  const matchLabel = event.match_type === "자동" ? (event.match_reason || "자동") : event.match_type;

  const results = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return [];
    return instructors.filter((i) => i.name.toLowerCase().includes(key)).slice(0, 30);
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
      onSaved(data);
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
              <p className="mt-0.5 text-xs text-emerald-800">{MATCH_REASON_TEXT[matchLabel] ?? matchLabel}</p>
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
            <Button size="sm" variant="outline" className="h-8 text-sm flex-1" disabled={saving} onClick={() => save(null)}>
              <UserX className="h-3.5 w-3.5 mr-1" />강사 아님 (매칭 제외)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
