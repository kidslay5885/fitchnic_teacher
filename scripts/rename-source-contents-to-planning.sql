-- 출처 값 '콘텐츠팀' → '강의기획팀' 일괄 변경
-- Supabase SQL Editor에서 실행

UPDATE instructors
SET source = '강의기획팀'
WHERE source = '콘텐츠팀';

-- 확인용
SELECT source, COUNT(*) FROM instructors GROUP BY source ORDER BY source;
