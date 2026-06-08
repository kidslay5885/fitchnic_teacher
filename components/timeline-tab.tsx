"use client";

import { useMemo, useState, useEffect } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { STATUS_COLORS } from "@/lib/constants";
import type { Instructor, InstructorStatus } from "@/lib/types";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Save, Search, X, CalendarClock, Pencil, Trash2,
} from "lucide-react";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// 무료강의일 기준 마일스톤 (offsetDays: 음수 = 그만큼 전)
const MILESTONES: { label: string; offsetDays: number; kind: "시작" | "완료" }[] = [
  { label: "광고촬영", offsetDays: -42, kind: "시작" },        // 6주 전 시작
  { label: "인터뷰 촬영", offsetDays: -42, kind: "시작" },     // 6주 전 시작
  { label: "현장 리허설", offsetDays: -21, kind: "시작" },     // 3주 전 시작
  { label: "PPT 세일즈 파트", offsetDays: -14, kind: "시작" }, // 2주 전 시작
  { label: "PPT 강의 파트", offsetDays: -7, kind: "완료" },    // 1주 전 까지 완료
  { label: "인터뷰 수강생 확정", offsetDays: -3, kind: "완료" }, // 3일 전 까지 완료
];

// 칩 색상 (시작=초록, 완료=빨강, 강의=보라, 킥오프=주황)
const KIND_STYLE: Record<string, string> = {
  "시작": "bg-green-100 border-green-200 text-green-800",
  "완료": "bg-rose-100 border-rose-200 text-rose-800",
  "강의": "bg-purple-100 border-purple-300 text-purple-900 font-semibold",
};

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s: string): Date | null => {
  const m = s?.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const mondayOf = (d: Date) => {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
  return r;
};

type DayEvent = { iso: string; label: string; kind: "시작" | "완료" | "강의" };

export default function TimelineTab() {
  const { state, dispatch } = useOutreach();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ instructor: Instructor; lectureDate: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const now = new Date();

  // 계약 완료 강사만
  const contracted = useMemo(
    () => state.instructors.filter((i) => i.status === "계약 완료"),
    [state.instructors]
  );

  // 검색 필터
  const filtered = useMemo(() => {
    const base = search
      ? contracted.filter((i) => {
          const q = search.toLowerCase();
          return i.name?.toLowerCase().includes(q) || i.field?.toLowerCase().includes(q);
        })
      : contracted;
    // 무료강의일 있는 강사 먼저(오름차순), 미등록은 뒤로
    return [...base].sort((a, b) => {
      const da = a.free_lecture_date || "";
      const db = b.free_lecture_date || "";
      if (da && db) return da.localeCompare(db);
      if (da) return -1;
      if (db) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [contracted, search]);

  const selected = useMemo(
    () => state.instructors.find((i) => i.id === selectedId) || null,
    [state.instructors, selectedId]
  );

  // 강사 변경 시 달력 위치 초기화
  useEffect(() => { setMonthOffset(0); }, [selectedId]);

  // 선택 강사의 일정 → ISO별 이벤트 맵 + 킥오프 주간
  const { eventsByIso, kickoffWeek, kickoffMonday } = useMemo(() => {
    const map: Record<string, DayEvent[]> = {};
    const week = new Set<string>();
    let monday: string | null = null;
    if (selected) {
      const lecture = parseIso(selected.free_lecture_date);
      if (lecture) {
        const push = (iso: string, label: string, kind: DayEvent["kind"]) => {
          (map[iso] ||= []).push({ iso, label, kind });
        };
        push(toIso(lecture), "무료강의", "강의");
        for (const m of MILESTONES) push(toIso(addDays(lecture, m.offsetDays)), m.label, m.kind);
        // 킥오프 미팅 예정 주간: 무료강의일 8주 전이 속한 주(월~일)
        const mon = mondayOf(addDays(lecture, -56));
        monday = toIso(mon);
        for (let i = 0; i < 7; i++) week.add(toIso(addDays(mon, i)));
      }
    }
    return { eventsByIso: map, kickoffWeek: week, kickoffMonday: monday };
  }, [selected]);

  // 달력 기준월: 무료강의일이 있으면 강의월 -1 (전 일정 + 강의일이 함께 보이도록)
  const baseMonth = useMemo(() => {
    const anchor = selected ? parseIso(selected.free_lecture_date) : null;
    return anchor
      ? new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const leftMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + monthOffset, 1);
  const rightMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + monthOffset + 1, 1);

  const formatDate = (iso: string) => {
    const d = parseIso(iso);
    if (!d) return "-";
    return `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
  };

  const openEdit = (i: Instructor) => {
    setSelectedId(i.id);
    setEditing({
      instructor: i,
      lectureDate: parseIso(i.free_lecture_date) ? toIso(parseIso(i.free_lecture_date)!) : "",
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/instructors/${editing.instructor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          free_lecture_date: editing.lectureDate,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      toast.success(`${editing.instructor.name} 일정 저장 완료`);
      setEditing(null);
    } catch {
      toast.error("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  // 한 달 달력 렌더링
  const renderCalendar = (monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstOffset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length < 42) cells.push(null);

    return (
      <div className="flex-1 min-w-0 border rounded-lg overflow-hidden flex flex-col">
        <div className="bg-[#f8f9fa] border-b py-1.5 text-center text-sm font-semibold shrink-0">
          {year}년 {month + 1}월
        </div>
        <div className="grid grid-cols-7 bg-[#f8f9fa] border-b shrink-0">
          {DAY_NAMES.map((d, i) => (
            <div key={d} className={`text-center text-[11px] font-semibold py-1 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted-foreground"} ${i < 6 ? "border-r border-gray-200" : ""}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="flex-1 grid grid-rows-6">
          {Array.from({ length: 6 }, (_, week) => (
            <div key={week} className={`grid grid-cols-7 ${week < 5 ? "border-b" : ""}`}>
              {cells.slice(week * 7, week * 7 + 7).map((date, ci) => {
                const iso = date ? toIso(date) : "";
                const isToday = date?.toDateString() === now.toDateString();
                const inKickoff = iso && kickoffWeek.has(iso);
                const dayEvents = iso ? eventsByIso[iso] || [] : [];
                return (
                  <div
                    key={ci}
                    className={`p-1 overflow-hidden min-h-[64px] ${ci < 6 ? "border-r border-gray-200" : ""} ${
                      !date ? "bg-gray-50/50" : inKickoff ? "bg-amber-50" : isToday ? "bg-primary/5" : "bg-white"
                    }`}
                  >
                    {date && (
                      <>
                        <div className={`text-[11px] mb-0.5 ${isToday ? "text-primary font-bold" : ci === 0 ? "text-red-400" : ci === 6 ? "text-blue-400" : "text-muted-foreground"}`}>
                          {date.getDate()}
                        </div>
                        <div className="space-y-0.5">
                          {iso === kickoffMonday && (
                            <div className="rounded px-1 py-0.5 text-[10px] border bg-amber-100 border-amber-300 text-amber-900 font-medium truncate" title="킥오프 미팅 예정 주간">
                              킥오프 미팅 주간
                            </div>
                          )}
                          {dayEvents.map((ev, i) => (
                            <div
                              key={i}
                              className={`rounded px-1 py-0.5 text-[10px] border truncate ${KIND_STYLE[ev.kind]}`}
                              title={`${ev.label}${ev.kind !== "강의" ? ` ${ev.kind}` : ""}`}
                            >
                              {ev.kind === "강의" ? "🎤 " : ""}{ev.label}
                              {ev.kind === "완료" && <span className="opacity-70"> 완료</span>}
                            </div>
                          ))}
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
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4" style={{ height: "calc(100vh - 56px)" }}>
      {/* ── 좌측: 계약 완료 강사 목록 ── */}
      <div className="flex flex-col w-full lg:w-[420px] shrink-0">
        <div className="shrink-0 space-y-3 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />무료강의 타임라인
            </h2>
            <span className="text-sm text-muted-foreground">계약 완료 {contracted.length}명</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름, 분야..."
              className="h-8 text-sm pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#f8f9fa] text-xs font-semibold text-muted-foreground">
              <tr className="border-b">
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">이름</th>
                <th className="text-left px-3 py-2 border-r border-gray-200 whitespace-nowrap">무료강의일</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i, idx) => (
                <tr
                  key={i.id}
                  className={`border-b cursor-pointer ${
                    selectedId === i.id ? "bg-purple-50 ring-1 ring-purple-200" : idx % 2 === 0 ? "bg-white hover:bg-blue-50/40" : "bg-[#fafafa] hover:bg-blue-50/40"
                  }`}
                  onClick={() => setSelectedId(i.id)}
                >
                  <td className="px-3 py-2 border-r border-gray-200/60 font-medium whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      {i.name}
                      <span className="text-muted-foreground text-xs truncate max-w-[90px]">{i.field}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 border-r border-gray-200/60 whitespace-nowrap font-medium">
                    {i.free_lecture_date
                      ? <span className="text-purple-700">{formatDate(i.free_lecture_date)}</span>
                      : <span className="text-red-400 text-xs">미등록</span>}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(i); }}
                      className="text-muted-foreground hover:text-primary"
                      title="일정 등록/수정"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">계약 완료된 강사가 없습니다.</div>
          )}
        </div>
      </div>

      {/* ── 우측: 달력 2개 ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-[400px]">
        <div className="shrink-0 flex items-center gap-2 pb-3">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setMonthOffset(monthOffset - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setMonthOffset(monthOffset + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {monthOffset !== 0 && (
            <Button size="sm" variant="ghost" className="h-8 text-sm" onClick={() => setMonthOffset(0)}>기준으로</Button>
          )}
          {selected ? (
            <span className="text-sm font-medium ml-2 flex items-center gap-2">
              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS["계약 완료" as InstructorStatus] || ""}`}>{selected.name}</Badge>
              {selected.free_lecture_date
                ? <span className="text-purple-700">무료강의 {formatDate(selected.free_lecture_date)}</span>
                : <span className="text-red-500">무료강의일 미등록 — 우측 연필 버튼으로 등록</span>}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground ml-2">좌측에서 강사를 선택하세요.</span>
          )}

          {/* 범례 */}
          <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-purple-200 border border-purple-300" />무료강의</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-green-200 border border-green-300" />시작</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-200 border border-rose-300" />완료</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-200 border border-amber-300" />킥오프</span>
          </div>
        </div>

        <div className="flex-1 flex gap-3 min-h-0">
          {renderCalendar(leftMonth)}
          {renderCalendar(rightMonth)}
        </div>
      </div>

      {/* ── 일정 등록 모달 ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <Card className="w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-5 space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold">{editing.instructor.name} 일정 등록</p>
                <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">무료강의일 <span className="text-purple-600">(모든 일정의 기준)</span></label>
                <Input
                  type="date" className="h-9 text-sm"
                  value={editing.lectureDate}
                  onChange={(e) => setEditing({ ...editing, lectureDate: e.target.value })}
                />
              </div>

              {/* 미리보기 */}
              {parseIso(editing.lectureDate) && (
                <div className="border rounded-lg p-3 bg-gray-50/50 text-xs space-y-1">
                  <p className="font-semibold text-muted-foreground mb-1.5">자동 계산 일정</p>
                  <div className="flex justify-between">
                    <span className="text-amber-700">킥오프 미팅 주간 (8주 전)</span>
                    <span className="text-muted-foreground">{formatDate(toIso(mondayOf(addDays(parseIso(editing.lectureDate)!, -56))))} ~</span>
                  </div>
                  {MILESTONES.map((m) => {
                    const d = addDays(parseIso(editing.lectureDate)!, m.offsetDays);
                    return (
                      <div key={m.label} className="flex justify-between">
                        <span className={m.kind === "완료" ? "text-rose-700" : "text-green-700"}>{m.label} {m.kind}</span>
                        <span className="text-muted-foreground">{formatDate(toIso(d))}</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between pt-1 border-t mt-1">
                    <span className="text-purple-700 font-semibold">🎤 무료강의</span>
                    <span className="text-muted-foreground">{formatDate(editing.lectureDate)}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" className="h-9 text-sm flex-1" onClick={handleSave} disabled={saving}>
                  <Save className="h-3.5 w-3.5 mr-1" />{saving ? "저장 중..." : "저장"}
                </Button>
                {editing.instructor.free_lecture_date && (
                  <Button
                    size="sm" variant="outline"
                    className="h-9 text-sm text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setEditing({ ...editing, lectureDate: "" })}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />비우기
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => setEditing(null)}>닫기</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
