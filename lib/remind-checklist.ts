// 리마인드 태그 정의 + 체크리스트 항목
//
// 하나의 일정에서 여러 리마인드가 파생된다.
//   강사미팅 → 미팅 D-1 / 미팅 당일
//   킥오프   → 킥오프 D-3 / D-1 / 당일
//   재연락   → 재연락 당일 (미팅관리에서 잡은 날짜)
//
// 항목 키(key)는 DB(remind_checklists.checked_items)에 그대로 저장되므로 바꾸지 않는다.
// label 은 우측 상세 패널용 전체 문구, short 는 캘린더 카드용 축약 표기.

export type RemindTag =
  | "meeting_d1"
  | "meeting_day"
  | "kickoff_d3"
  | "kickoff_d1"
  | "kickoff_day"
  | "followup"
  // 아래 둘은 표시 방법 미정이라 아직 캘린더에 생성하지 않는다 (정의만 보유)
  | "phone_day"
  | "kickoff_room";

export interface ChecklistItem {
  key: string;
  label: string;
  short: string;
}

export interface TagMeta {
  tag: RemindTag;
  label: string;                     // 캘린더 배지 문구
  group: "meeting" | "kickoff" | "followup";
  /** 기준 일정으로부터 며칠 전인지 (0 = 당일) */
  offset: number;
  /** 주말에 걸리면 직전 금요일로 당길지 — 당일 리마인드는 당기지 않는다 */
  shiftWeekend: boolean;
  items: ChecklistItem[];
}

/** 태그 색상 — 강사미팅 하늘색 / 킥오프 보라색 / 재연락 회색 */
export const TAG_COLORS: Record<TagMeta["group"], { chip: string; card: string; dot: string }> = {
  meeting: {
    chip: "bg-sky-100 border-sky-300 text-sky-900",
    card: "border-sky-200 bg-sky-50/40",
    dot: "bg-sky-200 border-sky-400",
  },
  kickoff: {
    chip: "bg-violet-100 border-violet-300 text-violet-900",
    card: "border-violet-200 bg-violet-50/40",
    dot: "bg-violet-200 border-violet-400",
  },
  followup: {
    chip: "bg-slate-100 border-slate-300 text-slate-700",
    card: "border-slate-200 bg-slate-50/40",
    dot: "bg-slate-200 border-slate-400",
  },
};

/** 전부 체크된 리마인드 — 재연락보다 더 연하게, 취소선 없이 회색으로만 */
export const DONE_STYLE = {
  chip: "bg-gray-100 border-gray-200 text-gray-400",
  card: "border-gray-200 bg-gray-50/60 text-gray-400",
};

export const TAGS: Record<RemindTag, TagMeta> = {
  meeting_d1: {
    tag: "meeting_d1",
    label: "미팅 D-1",
    group: "meeting",
    offset: 1,
    shiftWeekend: true,
    items: [
      { key: "sms", label: "전날 리마인드 문자 발송", short: "문자발송" },
      { key: "team", label: "강의기획팀 리마인드", short: "기획팀" },
    ],
  },
  meeting_day: {
    tag: "meeting_day",
    label: "미팅 당일",
    group: "meeting",
    offset: 0,
    shiftWeekend: false,
    items: [
      { key: "setup", label: "의전 세팅 (또는 줌 세팅, 링크 전달)", short: "의전세팅" },
      { key: "parking", label: "주차 등록", short: "주차등록" },
      { key: "closing_sms", label: "미팅 종료 문자 발송", short: "종료문자" },
    ],
  },
  kickoff_d3: {
    tag: "kickoff_d3",
    label: "킥오프 D-3",
    group: "kickoff",
    offset: 3,
    shiftWeekend: true,
    items: [
      { key: "pm", label: "담당자 확정 여부 확인 (특히 PM)", short: "담당자확정" },
      { key: "survey", label: "사전설문 작성 리마인드", short: "설문리마인드" },
    ],
  },
  kickoff_d1: {
    tag: "kickoff_d1",
    label: "킥오프 D-1",
    group: "kickoff",
    offset: 1,
    shiftWeekend: true,
    items: [
      { key: "pm", label: "담당자 확정 여부 확인 (특히 PM)", short: "담당자확정" },
      { key: "sms", label: "전날 리마인드 문자 발송 (오시는 길 포함)", short: "문자발송" },
      { key: "team_room", label: "강의팀 톡방에 리마인드", short: "톡방리마인드" },
    ],
  },
  kickoff_day: {
    tag: "kickoff_day",
    label: "킥오프 당일",
    group: "kickoff",
    offset: 0,
    shiftWeekend: false,
    items: [
      { key: "team_room", label: "강의팀 톡방에 리마인드", short: "톡방리마인드" },
      { key: "setup", label: "의전 세팅 (또는 줌 세팅, 링크 전달)", short: "의전세팅" },
      { key: "parking", label: "주차 등록", short: "주차등록" },
    ],
  },
  followup: {
    tag: "followup",
    label: "재연락",
    group: "followup",
    offset: 0,
    shiftWeekend: false,
    items: [
      { key: "contact", label: "재연락", short: "재연락" },
    ],
  },

  // ── 표시 방법 미정 — 캘린더 생성 대상에서 제외 ──
  phone_day: {
    tag: "phone_day",
    label: "전화미팅 당일",
    group: "meeting",
    offset: 0,
    shiftWeekend: false,
    items: [
      { key: "confirm_sms", label: "미팅 확정 문자 발송 (오시는 길 포함)", short: "확정문자" },
      { key: "team", label: "강의기획팀 공유", short: "기획팀공유" },
    ],
  },
  kickoff_room: {
    tag: "kickoff_room",
    label: "카톡방 생성",
    group: "kickoff",
    offset: 0,
    shiftWeekend: false,
    items: [
      { key: "fix_date", label: "킥오프 미팅 날짜 확정 (무료강의 50~60일 전)", short: "킥오프날짜" },
      { key: "schedule", label: "일정표 전달", short: "일정표" },
      { key: "survey_req", label: "사전설문 작성 요청 · 드라이브 링크 공지 등록", short: "설문요청" },
      { key: "card", label: "킥오프 날, 강사카드 강의팀 공유", short: "강사카드" },
    ],
  },
};

/** 강사미팅 일정에서 만들 리마인드 */
export const MEETING_TAGS: RemindTag[] = ["meeting_d1", "meeting_day"];
/** 킥오프 일정에서 만들 리마인드 */
export const KICKOFF_TAGS: RemindTag[] = ["kickoff_d3", "kickoff_d1", "kickoff_day"];

/** 캘린더 범례 순서 */
export const LEGEND_TAGS: RemindTag[] = [
  "meeting_d1", "meeting_day", "kickoff_d3", "kickoff_d1", "kickoff_day", "followup",
];

const pad2 = (n: number) => String(n).padStart(2, "0");
export const toIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseIso = (s: string): Date | null => {
  const m = (s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

/**
 * 리마인드 날짜 계산 — 일정 날짜에서 offset 일 전.
 * 주말에 걸리면 연락이 안 되므로 직전 금요일로 당긴다 (당일 리마인드는 그대로).
 */
export function remindDateFor(eventDate: string, tag: RemindTag): string {
  const meta = TAGS[tag];
  const d = parseIso(eventDate);
  if (!d) return "";
  d.setDate(d.getDate() - meta.offset);
  if (meta.shiftWeekend) {
    if (d.getDay() === 6) d.setDate(d.getDate() - 1); // 토 → 금
    if (d.getDay() === 0) d.setDate(d.getDate() - 2); // 일 → 금
  }
  return toIso(d);
}

/** 전부 체크됐는지 */
export function isAllChecked(tag: RemindTag, checked: string[]): boolean {
  const items = TAGS[tag].items;
  return items.length > 0 && items.every((it) => checked.includes(it.key));
}
