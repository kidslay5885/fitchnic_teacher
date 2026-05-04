-- 리마인드 명시적 삭제 플래그 추가
-- true면 자동 계산도 무시하고 달력/모달에서 리마인드 비표시
ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS remind_disabled boolean DEFAULT false;
