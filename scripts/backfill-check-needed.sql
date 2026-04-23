-- 발송일은 있지만 응답여부(result)가 비어 있는 기존 기록을 "체크필요"로 일괄 보정
-- 이후 새로 저장되는 기록은 API에서 자동 처리됨
-- Supabase SQL Editor에서 실행

UPDATE outreach_waves
SET result = '체크필요'
WHERE sent_date IS NOT NULL
  AND (result IS NULL OR result = '');

-- 확인
SELECT result, COUNT(*) AS n
FROM outreach_waves
GROUP BY result
ORDER BY result;
