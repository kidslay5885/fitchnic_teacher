-- =============================================
-- gmail_accounts.cc — 계정별 고정 CC(참조) 수신자
-- =============================================
-- 발송 시 해당 계정의 cc 배열에 들어있는 모든 주소가 Cc 헤더로 추가된다.
-- (BCC 와 달리 받는사람에게 참조 주소가 보인다)
-- 비어있으면 CC 없이 발송. 김보성 계정에만 강의기획팀 메일을 참조로 추가.
-- ※ 코드 배포 전에 먼저 실행할 것 (cc 컬럼이 없으면 발송 계정 조회가 실패함)
-- Supabase SQL Editor 에서 실행
-- =============================================

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS cc TEXT[] NOT NULL DEFAULT '{}';

UPDATE gmail_accounts
SET cc = ARRAY['business.center@fitchnic.com'], updated_at = now()
WHERE email = 'bbosk456@gmail.com';

-- 확인
SELECT email, label, cc, bcc FROM gmail_accounts ORDER BY is_default DESC, created_at ASC;
