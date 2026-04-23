-- instructors.send_method 컬럼 추가 (강사별 발송 수단: DM / 이메일)
-- 기존 outreach_waves.send_method는 차수별 값이었으나, 강사 레벨 단일 값으로 변경
-- Supabase SQL Editor에서 실행

ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS send_method TEXT DEFAULT '';

-- 기존 데이터 마이그레이션: 강사별 가장 낮은 차수의 send_method 복사
UPDATE instructors AS i
SET send_method = sub.send_method
FROM (
  SELECT DISTINCT ON (instructor_id) instructor_id, send_method
  FROM outreach_waves
  WHERE send_method IS NOT NULL AND send_method <> ''
  ORDER BY instructor_id, wave_number ASC
) AS sub
WHERE i.id = sub.instructor_id
  AND (i.send_method IS NULL OR i.send_method = '');

-- 확인
SELECT send_method, COUNT(*) AS n
FROM instructors
GROUP BY send_method
ORDER BY send_method;
