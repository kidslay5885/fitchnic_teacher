-- =============================================
-- gmail_accounts.bcc — 계정별 고정 BCC(숨은참조) 수신자
-- =============================================
-- 발송 시 해당 계정의 bcc 배열에 들어있는 모든 주소가 Bcc 헤더로 추가된다.
-- 비어있으면 BCC 없이 발송. 콘텐츠개발팀 계정에만 두 명을 추가.
-- =============================================

ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS bcc TEXT[] NOT NULL DEFAULT '{}';

UPDATE gmail_accounts
SET bcc = ARRAY['kidslay@naver.com', 'bbosk456@gmail.com']
WHERE email = 'business.center@fitchnic.com';

-- 확인
SELECT email, label, bcc FROM gmail_accounts ORDER BY is_default DESC, created_at ASC;
