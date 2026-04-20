-- 발송 방식 컬럼 추가 (outreach_waves.send_method)
-- Supabase SQL Editor에서 실행

ALTER TABLE outreach_waves
  ADD COLUMN IF NOT EXISTS send_method TEXT DEFAULT '';

-- 확인
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'outreach_waves'
ORDER BY ordinal_position;
