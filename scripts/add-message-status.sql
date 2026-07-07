-- 미팅 안내 메시지 전송 현황 컬럼 추가
-- JSON 형태로 저장: {"before":bool,"dayBefore":bool,"dayOf":bool,"afterEnd":bool,"rejected":bool,"carNumber":string}
ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS message_status TEXT DEFAULT '';
