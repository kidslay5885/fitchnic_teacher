-- 문자·MMS 자동발송 게이트웨이용 테이블
-- 폰 게이트웨이 앱이 sms_queue를 폴링해 발송하고 결과를 기록

-- 게이트웨이 폰 (1대만 등록)
CREATE TABLE IF NOT EXISTS sms_device (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT DEFAULT '',              -- 기기 별칭
  token TEXT NOT NULL,              -- 폰 인증 토큰 (폴링/결과통보 시 사용)
  pairing_code TEXT DEFAULT '',     -- 페어링용 코드 (폰에서 입력)
  paired BOOLEAN DEFAULT false,     -- 페어링 완료 여부
  phone_number TEXT DEFAULT '',     -- 등록된 폰 번호 (참고)
  last_seen TIMESTAMPTZ,            -- 마지막 폴링 시각
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 발송 큐
CREATE TABLE IF NOT EXISTS sms_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
  instructor_name TEXT DEFAULT '',
  phone TEXT NOT NULL,              -- 받는 번호
  stage TEXT DEFAULT '',            -- before/dayBefore/dayOf/afterEnd/rejected
  body TEXT DEFAULT '',             -- 메시지 본문
  images TEXT DEFAULT '',           -- 첨부 이미지 키 (예: 'transit,car', 없으면 빈값)
  scheduled_at TIMESTAMPTZ DEFAULT now(), -- 예약 발송 시각 (즉시=now)
  status TEXT DEFAULT 'pending',    -- pending/sent/failed/canceled
  result TEXT DEFAULT '',           -- 결과/오류 코드
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sms_queue_pending ON sms_queue (status, scheduled_at);
