-- =============================================
-- 리마인드 탭 — 강의실 시간표(구글 드라이브 xlsx)에서 가져온 강사미팅/킥오프 일정
-- =============================================

-- 1. 시간표 일정
--    동기화할 때마다 source_key 기준으로 upsert 하므로
--    remind_done(리마인드 완료 체크)은 유지된다.
CREATE TABLE IF NOT EXISTS timetable_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT UNIQUE NOT NULL,          -- '2026년 7월!H26' — 시트명+셀 좌표
  sheet TEXT NOT NULL,                      -- 시트명 (예: 2026년 7월)
  cell TEXT NOT NULL,                       -- 셀 좌표
  event_date DATE NOT NULL,                 -- 일정 날짜
  event_time TEXT DEFAULT '',               -- 시간대 시작 시각 (예: 14:00)
  event_type TEXT NOT NULL,                 -- '강사미팅' | '킥오프'
  meeting_mode TEXT DEFAULT '',             -- '대면' | '줌' | ''
  protocol TEXT DEFAULT '',                 -- 의전: 'O' | 'X' | ''
  display_name TEXT DEFAULT '',             -- 시간표에 적힌 강사 표기
  raw_text TEXT NOT NULL,                   -- 셀 원문 (매칭 확인용)
  instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
  match_type TEXT DEFAULT '미매칭',          -- '자동' | '수동' | '미매칭' | '해당없음'
  match_reason TEXT DEFAULT '',             -- 자동매칭 근거: '이름' | '일정+이름' | '일정'
  remind_done BOOLEAN DEFAULT false,        -- 전날 리마인드 완료 체크
  synced_at TIMESTAMPTZ DEFAULT now(),      -- 마지막 동기화 시각 (스테일 판정용)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timetable_events_date ON timetable_events(event_date);
CREATE INDEX IF NOT EXISTS idx_timetable_events_instructor ON timetable_events(instructor_id);

-- 2. 수동 매칭 결과 보존용 이름 매핑
--    시간표 셀이 이동/수정돼도 수동으로 지정한 강사 연결이 유지되도록
--    정규화한 표기명 → 강사 id 를 따로 저장한다.
--    instructor_id 가 NULL 이면 '해당없음'(강사 아님) 으로 표시한 것.
CREATE TABLE IF NOT EXISTS timetable_name_map (
  norm_name TEXT PRIMARY KEY,               -- 정규화한 표기명 (공백/기호 제거, 소문자)
  display_name TEXT NOT NULL,               -- 원래 표기 (화면 표시용)
  instructor_id UUID REFERENCES instructors(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS는 켜두고 정책 미부여 → service_role 키(서버)만 접근 가능
ALTER TABLE timetable_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_name_map ENABLE ROW LEVEL SECURITY;

-- 이미 테이블을 만든 뒤라면 아래 한 줄만 추가로 실행
ALTER TABLE timetable_events ADD COLUMN IF NOT EXISTS match_reason TEXT DEFAULT '';

-- 마지막 동기화 시각은 기존 app_secrets 테이블에 저장한다 (key: timetable_last_sync)
