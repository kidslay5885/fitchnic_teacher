-- 사유 통합 마이그레이션 1단계: reason 컬럼 추가 + 백필
-- 기존 confirm_reason / exclude_reason 두 컬럼을 단일 reason으로 통합.
-- 강사 상태와 무관하게 평상시에도 사유 편집이 가능하도록 모델을 단순화.
--
-- 백필 정책: 강사찾기 페이지에서 현재 화면에 보이는 사유를 그대로 reason으로 옮긴다.
--   - status = '컨펌 필요'  → confirm_reason 우선, 비었으면 exclude_reason
--   - 그 외 상태            → exclude_reason 우선, 비었으면 confirm_reason
-- 이 정책으로 시각적 변화 없이 모든 값이 보존된다.
--
-- 주의: 코드가 아직 confirm_reason / exclude_reason 컬럼을 참조하므로
--       이 단계에서는 기존 두 컬럼을 DROP하지 않는다. 코드 배포 후 step2에서 제거.

ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT '';

UPDATE instructors
SET reason = CASE
  WHEN status = '컨펌 필요' THEN COALESCE(NULLIF(confirm_reason, ''), exclude_reason, '')
  ELSE COALESCE(NULLIF(exclude_reason, ''), confirm_reason, '')
END;
