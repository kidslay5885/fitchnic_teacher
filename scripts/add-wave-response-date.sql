-- 발송 상세 모달에서 결과 "응답" 또는 "거절" 선택 시 입력하는 응답일자
-- 차수별로 응답이 들어온 날짜를 기록하기 위해 outreach_waves에 컬럼 추가
ALTER TABLE outreach_waves
  ADD COLUMN IF NOT EXISTS response_date DATE;
