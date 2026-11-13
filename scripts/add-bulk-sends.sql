-- =============================================
-- 발송 탭 — 이메일 목록 일괄 발송 기록 + 강사 발송 뱃지
-- =============================================
-- 1·2·3차(outreach_waves)와는 별개의 발송.
-- 발송 1건(발송명·제목·문구·계정) = bulk_sends 1행
-- 입력한 이메일별 처리 결과 = bulk_send_recipients
-- 강사 이름 옆 뱃지 = instructors.send_badges (발송명 배열, 여러 개 가능)
-- Supabase SQL Editor 에서 실행
-- =============================================

-- 1) 발송 기록
CREATE TABLE IF NOT EXISTS bulk_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                        -- 발송명 (= 뱃지 이름)
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  sender_account_id UUID,
  sender_email TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) 이메일별 처리 결과
--   result: 발송 | 실패 | 미등록 | 연락금지 | 상태제외 | 대기
CREATE TABLE IF NOT EXISTS bulk_send_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_send_id UUID NOT NULL REFERENCES bulk_sends(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
  instructor_name TEXT NOT NULL DEFAULT '',
  prev_status TEXT NOT NULL DEFAULT '',      -- 발송 전 강사 상태
  result TEXT NOT NULL DEFAULT '대기',
  reason TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_send_recipients_send ON bulk_send_recipients(bulk_send_id);
CREATE INDEX IF NOT EXISTS idx_bulk_send_recipients_instructor ON bulk_send_recipients(instructor_id);

-- RLS는 켜두고 정책 미부여 → service_role 키(서버)만 접근 가능
ALTER TABLE bulk_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_send_recipients ENABLE ROW LEVEL SECURITY;

-- 3) 강사 발송 뱃지 (발송명 배열)
ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS send_badges TEXT[] NOT NULL DEFAULT '{}';
