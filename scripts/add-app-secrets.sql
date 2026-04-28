-- =============================================
-- 앱 전역 비밀값 보관용 key-value 테이블
-- (Gmail OAuth refresh_token 등)
-- =============================================

CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS는 켜두고 정책 미부여 → service_role 키만 접근 가능
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- 기존 환경변수에 있던 GMAIL_REFRESH_TOKEN 을 한번 옮겨 넣기
-- (env에서 직접 INSERT는 불가하므로, 최초 1회만 콘솔에서 수동 실행)
-- INSERT INTO app_secrets (key, value)
-- VALUES ('gmail_refresh_token', '여기에_기존_refresh_token_붙여넣기')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
