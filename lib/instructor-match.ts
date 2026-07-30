// 시간표에 적힌 강사 표기 ↔ DB 강사명 자동 매칭
//
// 시간표는 "머스크랩(이동훈)", "승리쌤", "원폰맨(차상우)" 처럼 활동명·본명이 섞여 있고
// DB는 "MuskLab 채널", "부업하는승리쌤" 처럼 표기가 달라서 완전일치로는 거의 안 잡힌다.
// 표기에서 라벨/부가정보를 걷어내고 토큰 단위로 비교한다.

// 셀 텍스트에서 걷어낼 라벨·부가정보
const NOISE =
  /강사미팅|코치님미팅|대표님미팅|줌미팅|줌 미팅|미팅|의전\s*[OXＯＸ오엑]|대면|줌|킥오프|확정|미정|전화|주차권|소회의실|회의실|별관|\d+층|예정|방문|대기중|온라인|오프라인|PM|PD|AI|\d{1,2}:\d{2}|\d+시|\d+/g;

// 사람을 특정하지 못하는 일반 명사 (토큰에서 제외)
const STOP = new Set([
  "채널", "대표", "대표님", "코치", "코치님", "강사", "강사님", "선생", "선생님", "쌤",
  "팀장", "회의", "유튜브", "유튜버", "스튜디오", "리허설", "촬영", "숏폼", "롱폼",
  "광고", "무료강의", "기획", "개발", "개발자", "면접", "출근", "방문", "온백",
  "핏크닉", "커머스팀", "손님",
]);

/** 비교용 정규화: 한글/영숫자만 남기고 소문자화 */
export function normalizeName(s: string): string {
  return (s || "").normalize("NFC").replace(/[^0-9A-Za-z가-힣]/g, "").toLowerCase();
}

/** 텍스트에서 사람 이름 후보 토큰 추출 */
export function nameTokens(text: string): string[] {
  const cleaned = (text || "").normalize("NFC").replace(NOISE, " ");
  return cleaned
    .split(/[^0-9A-Za-z가-힣]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** 시간표 셀에서 화면에 보여줄 강사 표기 추출 (토큰을 원래 순서로 합침) */
export function extractDisplayName(text: string): string {
  const toks = nameTokens(text);
  return toks.slice(0, 3).join(" ");
}

// 두 문자열의 유사도 (0~1) — 편집거리 기반
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

export interface MatchCandidate {
  id: string;
  name: string;
  norm: string;
  tokens: string[];
}

// '이준희(승리쌤 수강생)', '김주리 - 셀링남님 제자' 처럼 다른 사람과의 관계가 적힌 이름.
// 이 경우 본인을 가리키는 건 맨 앞 토큰뿐이고, 뒤에 붙은 이름은 남의 이름이다.
const RELATION = /수강생|제자|지인|추천인|소개/;

/** DB 강사 목록을 매칭용 형태로 변환 */
export function toCandidates(rows: { id: string; name: string }[]): MatchCandidate[] {
  return rows
    .map((r) => {
      const toks = nameTokens(r.name).map(normalizeName);
      return {
        id: r.id,
        name: r.name,
        norm: normalizeName(r.name),
        // 관계 표기가 있으면 첫 토큰(본인)만 매칭에 쓴다
        tokens: RELATION.test(r.name) ? toks.slice(0, 1) : toks,
      };
    })
    // 1글자로 줄어드는 이름은 아무 텍스트에나 걸려서 오매칭을 만든다 → 제외
    .filter((c) => c.norm.length >= 2);
}

export interface MatchResult {
  candidate: MatchCandidate;
  score: number;
}

/**
 * 시간표 셀 텍스트에 해당하는 강사 후보를 점수순으로 반환.
 * 점수 100=완전일치, 95=토큰 완전일치, 80~90=포함관계, 70=유사(오타 허용)
 */
export function matchInstructor(text: string, candidates: MatchCandidate[]): MatchResult[] {
  const toks = nameTokens(text).map(normalizeName).filter((t) => t.length >= 2);
  if (toks.length === 0) return [];

  const results: MatchResult[] = [];
  for (const c of candidates) {
    let best = 0;
    for (const t of toks) {
      // 규칙을 순서대로 걸러내면(else if) 약한 신호가 먼저 걸려 강한 신호를 가린다.
      // 예: '엄필승' vs '엄필승,나홀로 AI' → 전체이름 부분일치(83)에서 멈춰
      //     토큰 완전일치(95)를 놓친다. 그래서 모든 규칙을 평가해 최고점을 쓴다.
      if (c.norm === t) best = Math.max(best, 100);
      if (c.norm.includes(t) || t.includes(c.norm)) {
        best = Math.max(best, 80 + Math.min(t.length, 10));
      }
      for (const ct of c.tokens) {
        if (ct.length < 2) continue;
        if (ct === t) {
          best = Math.max(best, 95);
        } else if (ct.includes(t) || t.includes(ct)) {
          // '부업하는승리쌤' ⊃ '승리쌤' 처럼 활동명에 수식어가 붙은 경우.
          // 2글자 토큰은 우연히 겹칠 수 있어 점수를 낮게 준다.
          best = Math.max(best, Math.min(t.length, ct.length) >= 3 ? 88 : 78);
        } else if (t.length >= 3 && ct.length >= 3 && similarity(t, ct) >= 0.8) {
          best = Math.max(best, 70);
        }
      }
    }
    if (best > 0) results.push({ candidate: c, score: best });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

// 자동 매칭으로 인정할 최소 점수 (이 아래는 미매칭으로 두고 수동 매칭에 맡긴다)
export const AUTO_MATCH_THRESHOLD = 85;
