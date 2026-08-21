-- =============================================
-- 리마인드 탭 개편 — 리마인드별 체크리스트 상태 저장
-- =============================================
--
-- 하나의 일정에서 여러 리마인드가 파생된다.
--   강사미팅 → 미팅 D-1 / 미팅 당일
--   킥오프   → 킥오프 D-3 / D-1 / 당일
-- 그래서 기존 timetable_events.remind_done(불리언 1개)로는 담을 수 없고,
-- (대상 × 태그) 한 줄에 체크된 항목 키 배열을 저장한다.
--
-- ref_type = 'event'      → ref_id = timetable_events.id
-- ref_type = 'instructor' → ref_id = instructors.id   (재연락)
CREATE TABLE IF NOT EXISTS remind_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_type TEXT NOT NULL,                    -- 'event' | 'instructor'
  ref_id UUID NOT NULL,
  tag TEXT NOT NULL,                         -- meeting_d1 | meeting_day | kickoff_d3 | kickoff_d1 | kickoff_day | followup ...
  checked_items TEXT[] NOT NULL DEFAULT '{}',-- 체크된 항목 키 목록
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ref_type, ref_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_remind_checklists_ref ON remind_checklists(ref_type, ref_id);

-- RLS는 켜두고 정책 미부여 → service_role 키(서버)만 접근 가능
ALTER TABLE remind_checklists ENABLE ROW LEVEL SECURITY;
