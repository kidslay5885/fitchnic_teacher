-- 발송 상세 모달에서 결과 "거절" 선택 시 입력하는 사유
-- 차수별로 다른 거절 사유를 보관하기 위해 outreach_waves에 컬럼 추가
-- 강사 단위 사유는 instructors.exclude_reason(기존)을 그대로 사용하며,
-- result="거절" 저장 시 reject_reason 값을 exclude_reason에도 반영한다.
ALTER TABLE outreach_waves
  ADD COLUMN IF NOT EXISTS reject_reason text;
