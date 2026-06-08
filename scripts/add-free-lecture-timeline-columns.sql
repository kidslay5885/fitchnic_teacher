-- 무료강의 타임라인: instructors 테이블에 무료강의일 컬럼 추가
-- Supabase SQL Editor에서 실행

ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS free_lecture_date TEXT DEFAULT '';   -- 무료강의일 (촬영/리허설/킥오프 등 모든 마일스톤 기준)
