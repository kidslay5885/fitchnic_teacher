-- 사유 통합 마이그레이션 2단계: 기존 confirm_reason / exclude_reason 컬럼 제거
-- 반드시 코드 배포(컬럼 참조 전부 reason으로 교체)가 끝난 뒤에 실행한다.
-- 이력은 status_history.reason에 보존되어 있으므로 안전하게 제거 가능.

ALTER TABLE instructors
  DROP COLUMN IF EXISTS confirm_reason,
  DROP COLUMN IF EXISTS exclude_reason;
