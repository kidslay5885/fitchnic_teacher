-- applications 테이블에 핏크닉메타 전용 필드 추가
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS lecture_format text DEFAULT '',
  ADD COLUMN IF NOT EXISTS sns_types text DEFAULT '';
