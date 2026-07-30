// 시간표 일정 ↔ DB 강사 매칭
//
// 이름만으로는 한계가 크다. 시간표는 "유병관", "임형근" 처럼 본명으로 적고
// DB는 "차익프로", "몽땅골프 채널" 처럼 활동명으로 저장된 경우가 많다.
// 이럴 때 결정적인 단서는 미팅 일정이다 — 같은 날 같은 시각을 가리키면 동일인이다.
// 그래서 (이름 유사도 + 미팅일 일치) 두 신호를 함께 본다.

import { AUTO_MATCH_THRESHOLD, matchInstructor, toCandidates, type MatchCandidate } from "./instructor-match";

export interface MatchableInstructor {
  id: string;
  name: string;
  meeting_date?: string | null;
}

export interface MatchableEvent {
  event_date: string;   // YYYY-MM-DD
  event_time: string;   // HH:MM
  event_type: string;   // 강사미팅 | 킥오프
  raw_text: string;
}

export type MatchReason = "이름" | "일정+이름" | "일정" | "";

export interface EventMatch {
  instructorId: string | null;
  reason: MatchReason;
}

// 일정 단서만으로 매칭할 때, 이름이 전혀 안 맞아도 인정할 최소 조건은
// "그 날짜에 미팅이 있는 강사가 유일" + "시각까지 일치" 다.
// 시각이 다르면 최소한 이름이 어느 정도는 겹쳐야 한다.
const NAME_HINT_THRESHOLD = 40;
const NAME_WITH_DATE_THRESHOLD = 70;

interface Prepared {
  cand: MatchCandidate;
  date: string;   // 미팅 날짜 (YYYY-MM-DD), 없으면 ''
  time: string;   // 미팅 시각 (HH:MM), 없으면 ''
}

function prepare(instructors: MatchableInstructor[]): { cands: MatchCandidate[]; byId: Map<string, Prepared> } {
  const cands = toCandidates(instructors.map((i) => ({ id: i.id, name: i.name })));
  const meta = new Map(instructors.map((i) => {
    const md = (i.meeting_date || "").trim();
    const d = md.match(/(\d{4})-(\d{2})-(\d{2})/);
    const t = md.match(/(\d{1,2}):(\d{2})/);
    return [i.id, {
      date: d ? d[0] : "",
      time: t ? `${String(+t[1]).padStart(2, "0")}:${t[2]}` : "",
    }];
  }));
  const byId = new Map<string, Prepared>();
  for (const cand of cands) {
    const m = meta.get(cand.id);
    byId.set(cand.id, { cand, date: m?.date || "", time: m?.time || "" });
  }
  return { cands, byId };
}

export interface Suggestion {
  instructorId: string;
  name: string;
  nameScore: number;
  reason: MatchReason;
}

/** 한 일정에 대한 강사 후보를 신뢰도 순으로 반환 (수동 매칭 모달의 '추천 후보') */
export function suggestForEvent(
  event: MatchableEvent,
  instructors: MatchableInstructor[],
): Suggestion[] {
  const { cands, byId } = prepare(instructors);
  const nameHits = matchInstructor(event.raw_text, cands);
  const nameScoreById = new Map(nameHits.map((h) => [h.candidate.id, h.score]));

  const scheduleHit = findScheduleMatch(event, byId);

  const merged = new Map<string, Suggestion>();
  for (const h of nameHits) {
    merged.set(h.candidate.id, {
      instructorId: h.candidate.id,
      name: h.candidate.name,
      nameScore: h.score,
      reason: scheduleHit?.cand.id === h.candidate.id ? "일정+이름" : "이름",
    });
  }
  if (scheduleHit && !merged.has(scheduleHit.cand.id)) {
    merged.set(scheduleHit.cand.id, {
      instructorId: scheduleHit.cand.id,
      name: scheduleHit.cand.name,
      nameScore: nameScoreById.get(scheduleHit.cand.id) ?? 0,
      reason: "일정",
    });
  }

  // 일정이 맞는 후보를 맨 앞으로, 그 다음 이름 점수순
  return [...merged.values()].sort((a, b) => {
    const rank = (r: MatchReason) => (r === "일정+이름" ? 0 : r === "일정" ? 1 : 2);
    return rank(a.reason) - rank(b.reason) || b.nameScore - a.nameScore;
  }).slice(0, 6);
}

/**
 * 일정 단서로 후보 찾기.
 * 킥오프는 첫 미팅과 날짜가 다르므로(DB meeting_date 는 첫 미팅일) 대상에서 제외한다.
 */
function findScheduleMatch(event: MatchableEvent, byId: Map<string, Prepared>): Prepared | null {
  if (event.event_type === "킥오프") return null;
  if (!event.event_date) return null;

  const sameDate = [...byId.values()].filter((p) => p.date === event.event_date);
  if (sameDate.length === 0) return null;
  if (sameDate.length === 1) return sameDate[0];

  // 같은 날 미팅이 여럿이면 시각으로 좁힌다
  const sameTime = sameDate.filter((p) => p.time && event.event_time && p.time === event.event_time);
  return sameTime.length === 1 ? sameTime[0] : null;
}

/** 일정 목록 전체를 매칭 (동기화에서 사용) */
export function matchEvents(
  events: MatchableEvent[],
  instructors: MatchableInstructor[],
): EventMatch[] {
  const { cands, byId } = prepare(instructors);

  return events.map((ev) => {
    const nameHits = matchInstructor(ev.raw_text, cands);
    const bestName = nameHits[0];
    const sched = findScheduleMatch(ev, byId);
    const schedNameScore = sched
      ? nameHits.find((h) => h.candidate.id === sched.cand.id)?.score ?? 0
      : 0;

    // 1) 날짜와 시각이 모두 같은 강사 — 가장 구체적인 단서라 이름보다 우선한다.
    //    '머스크랩(이동훈)' 이 이름만으로는 '이동훈의 루트AI' 에 걸리지만
    //    7/23 14:00 슬롯을 가진 'MuskLab 채널' 이 실제 상대다.
    if (sched && sched.time && ev.event_time && sched.time === ev.event_time) {
      return {
        instructorId: sched.cand.id,
        reason: (schedNameScore > 0 ? "일정+이름" : "일정") as MatchReason,
      };
    }

    // 2) 이름만으로 충분히 확실한 경우
    if (bestName && bestName.score >= AUTO_MATCH_THRESHOLD) {
      return { instructorId: bestName.candidate.id, reason: "이름" as MatchReason };
    }

    // 3) 날짜만 같은 경우 — 이름 단서가 어느 정도 있어야 인정
    if (sched) {
      if (schedNameScore >= NAME_WITH_DATE_THRESHOLD) {
        return { instructorId: sched.cand.id, reason: "일정+이름" as MatchReason };
      }
      // DB에 시각이 없어 비교할 수 없으면 약한 이름 단서까지 허용
      if (schedNameScore >= NAME_HINT_THRESHOLD && sched.time === "") {
        return { instructorId: sched.cand.id, reason: "일정+이름" as MatchReason };
      }
    }

    return { instructorId: null, reason: "" as MatchReason };
  });
}
