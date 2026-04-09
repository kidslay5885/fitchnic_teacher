"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { RefreshCw } from "lucide-react";

interface Lecture {
  platform: string;
  instructor: string;
  content: string;
  time: string;
}

interface DaySchedule {
  day: string;
  date: string;
  lectures: Lecture[];
}

interface WeekSchedule {
  days: DaySchedule[];
}

interface ScheduleData {
  sheetName: string;
  sheets: string[];
  weeks: WeekSchedule[];
}

// 플랫폼별 색상
const PLATFORM_COLORS: Record<string, string> = {
  "핏크닉": "bg-blue-100 text-blue-800",
  "코주부클래스": "bg-purple-100 text-purple-800",
  "인베이더스쿨": "bg-green-100 text-green-800",
  "타이탄클래스": "bg-orange-100 text-orange-800",
  "사이클해커스": "bg-red-100 text-red-800",
  "N잡연구소": "bg-yellow-100 text-yellow-800",
  "아이비클래스": "bg-teal-100 text-teal-800",
  "돈클": "bg-pink-100 text-pink-800",
  "인사이트머니랩": "bg-indigo-100 text-indigo-800",
  "디하클": "bg-cyan-100 text-cyan-800",
  "긱스쿨": "bg-emerald-100 text-emerald-800",
  "하이클래스": "bg-violet-100 text-violet-800",
};

const DAY_LABELS: Record<string, string> = {
  SUN: "일", MON: "월", TUE: "화", WED: "수", THU: "목", FRI: "금", SAT: "토",
};

const DAY_COLORS: Record<string, string> = {
  SUN: "text-red-500", SAT: "text-blue-500",
};

function getPlatformColor(platform: string) {
  return PLATFORM_COLORS[platform] || "bg-gray-100 text-gray-700";
}

// 오늘 날짜인지 확인 (4/9 형식 비교)
function isToday(dateStr: string) {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return dateStr === `${m}/${d}`;
}

export default function ScheduleTab() {
  const { state } = useOutreach();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // 미팅관리 탭에 표시되는 강사명 Set (미팅 확정 + 미팅 예정 + 응답 강사)
  const meetingNames = useMemo(() => {
    const exclude = ["거절", "제외", "보류"];
    const names = new Set<string>();
    for (const inst of state.instructors) {
      if (exclude.includes(inst.status)) continue;
      if (inst.meeting_date || inst.meeting_confirmed || inst.has_response) {
        names.add(inst.name.trim());
      }
    }
    return names;
  }, [state.instructors]);

  const fetchData = useCallback(async (sheet?: string) => {
    try {
      setLoading(true);
      setError(null);
      const params = sheet ? `?sheet=${encodeURIComponent(sheet)}` : "";
      const res = await fetch(`/api/schedule${params}`);
      if (!res.ok) throw new Error("데이터를 불러올 수 없습니다");
      const json = await res.json();
      setData(json);
      setSelectedSheet(json.sheetName);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 로딩 + 자동 갱신 (60초)
  useEffect(() => {
    // 현재 월에 해당하는 시트로 초기 로딩
    const now = new Date();
    const monthName = `${now.getMonth() + 1}월`;
    fetchData(monthName);

    const interval = setInterval(() => {
      if (selectedSheet) fetchData(selectedSheet);
    }, 60_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        구글 시트 데이터 로딩 중...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-500 mb-2">{error}</p>
        <button onClick={() => fetchData()} className="text-sm text-blue-500 hover:underline">
          다시 시도
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">플랫폼 별 무료 강의 현황</h2>
          {/* 월 선택 */}
          <select
            value={selectedSheet || ""}
            onChange={(e) => {
              setSelectedSheet(e.target.value);
              fetchData(e.target.value);
            }}
            className="text-sm border rounded-md px-2 py-1 bg-white"
          >
            {data.sheets.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lastUpdated && (
            <span>마지막 갱신: {lastUpdated.toLocaleTimeString("ko-KR")}</span>
          )}
          <button
            onClick={() => fetchData(selectedSheet || undefined)}
            disabled={loading}
            className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* 주간 캘린더 */}
      {data.weeks.map((week, wi) => (
        <WeekCard key={wi} week={week} meetingNames={meetingNames} />
      ))}
    </div>
  );
}

const ALL_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function WeekCard({ week, meetingNames }: { week: WeekSchedule; meetingNames: Set<string> }) {
  // 이번 주에 오늘이 포함되어 있는지
  const hasToday = week.days.some(d => isToday(d.date));

  // 항상 7열 고정 — 데이터가 없는 요일은 빈 칸
  const dayMap = new Map(week.days.map(d => [d.day, d]));
  const fullWeek: (DaySchedule | null)[] = ALL_DAYS.map(d => dayMap.get(d) || null);

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${hasToday ? "ring-2 ring-blue-300" : ""}`}>
      <div className="grid grid-cols-7">
        {fullWeek.map((day, i) => {
          const dayName = ALL_DAYS[i];
          const today = day ? isToday(day.date) : false;
          return (
            <div key={dayName} className={`border-r last:border-r-0 ${today ? "bg-blue-50/50" : ""}`}>
              {/* 요일 + 날짜 헤더 */}
              <div className={`px-3 py-2 border-b text-center ${today ? "bg-blue-100" : day ? "bg-gray-50" : ""}`}>
                {day ? (
                  <div className={`text-sm font-bold ${today ? "text-blue-700" : ""}`}>
                    {day.date}<span className={`font-medium ${DAY_COLORS[dayName] || "text-gray-500"}`}>({DAY_LABELS[dayName]})</span>
                  </div>
                ) : (
                  <div className="h-[20px]" />
                )}
              </div>

              {/* 강의 목록 */}
              <div className="p-2 space-y-1.5 min-h-[100px]">
                {!day ? null : day.lectures.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4">-</div>
                ) : (
                  day.lectures.map((lec, li) => (
                    <LectureCard key={li} lecture={lec} isMeeting={meetingNames.has(lec.instructor)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LectureCard({ lecture, isMeeting }: { lecture: Lecture; isMeeting: boolean }) {
  return (
    <div className={`rounded-lg border-2 px-2.5 py-2 text-xs hover:shadow-sm transition-shadow ${isMeeting ? "border-red-500 bg-red-50 ring-2 ring-red-300" : "border-transparent border border-gray-200"}`}>
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight ${getPlatformColor(lecture.platform)}`}>
          {lecture.platform}
        </span>
        <div className="flex items-center gap-1">
          {isMeeting && (
            <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">미팅했던 강사</span>
          )}
          {lecture.time && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{lecture.time}</span>
          )}
        </div>
      </div>
      <div className={`font-semibold leading-snug ${isMeeting ? "text-red-800" : "text-foreground"}`}>
        {lecture.instructor}
      </div>
      {lecture.content && (
        <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{lecture.content}</div>
      )}
    </div>
  );
}
