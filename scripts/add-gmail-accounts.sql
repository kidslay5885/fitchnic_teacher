-- =============================================
-- Gmail 다중 계정 지원
-- =============================================
-- - app_secrets 단일 키(gmail_refresh_token) → gmail_accounts 다중 row 로 확장
-- - outreach_waves 에 sender_account_id 추가하여 차수별로 어느 계정에서 발송됐는지 추적
-- - 크론 자동 발송은 1차 sender 가 is_default=true 계정인 경우에만 후속 처리
-- =============================================

-- 1. 발송 계정 테이블
CREATE TABLE IF NOT EXISTS gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,                 -- 표시명 (예: "(주)핏크닉 대표 정승요")
  refresh_token TEXT,                  -- OAuth 재인증 전까지 비어 있을 수 있음
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_cron_sender BOOLEAN NOT NULL DEFAULT false,  -- 크론 자동 발송 시 이 계정으로만 발송
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- is_default 는 동시에 하나만
CREATE UNIQUE INDEX IF NOT EXISTS gmail_accounts_only_one_default
  ON gmail_accounts ((1)) WHERE is_default;

-- is_cron_sender 도 동시에 하나만
CREATE UNIQUE INDEX IF NOT EXISTS gmail_accounts_only_one_cron
  ON gmail_accounts ((1)) WHERE is_cron_sender;

ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;

-- 2. 기존 ceo 계정 seed
--    (refresh_token 은 app_secrets 에서 옮겨오고, 이후 인증 시 자동 갱신)
INSERT INTO gmail_accounts (email, label, refresh_token, is_default, is_cron_sender)
SELECT
  'ceo@fitchnic.com',
  '(주)핏크닉 대표 정승요',
  (SELECT value FROM app_secrets WHERE key = 'gmail_refresh_token'),
  true,
  true
WHERE NOT EXISTS (SELECT 1 FROM gmail_accounts WHERE email = 'ceo@fitchnic.com');

-- 3. 새 계정 슬롯 — refresh_token 은 OAuth 재인증 시 채워짐
INSERT INTO gmail_accounts (email, label, is_default, is_cron_sender)
SELECT 'business.center@fitchnic.com', '(주)핏크닉 콘텐츠개발팀', false, false
WHERE NOT EXISTS (SELECT 1 FROM gmail_accounts WHERE email = 'business.center@fitchnic.com');

-- 4. outreach_waves 에 발송 계정 추적 컬럼 추가
ALTER TABLE outreach_waves
  ADD COLUMN IF NOT EXISTS sender_account_id UUID REFERENCES gmail_accounts(id) ON DELETE SET NULL;

-- 5. 기존 발송 기록은 모두 ceo 계정에서 보낸 것으로 백필
UPDATE outreach_waves
SET sender_account_id = (SELECT id FROM gmail_accounts WHERE email = 'ceo@fitchnic.com')
WHERE sender_account_id IS NULL AND sent_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_waves_sender
  ON outreach_waves(sender_account_id, wave_number);
