-- =============================================
-- 계정별 메시지 템플릿 지원
-- =============================================
-- message_templates 에 sender_account_id 추가 → 같은 차수에 대해
-- 발송 계정마다 다른 제목/본문을 가질 수 있도록.
-- 조회 시 sender_account_id 매치 우선, 없으면 sender_account_id IS NULL 인 공용 템플릿 fallback.
-- =============================================

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS sender_account_id UUID
  REFERENCES gmail_accounts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_message_templates_sender
  ON message_templates(channel, variant_label, sender_account_id);

-- 콘텐츠개발팀 (business.center@fitchnic.com) 1차 전용 템플릿
-- 기존 동일 row 가 있으면 갱신, 없으면 삽입
DO $$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT id INTO v_account_id
  FROM gmail_accounts
  WHERE email = 'business.center@fitchnic.com';

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'business.center@fitchnic.com 계정이 gmail_accounts 에 없습니다 — add-gmail-accounts.sql 먼저 실행하세요';
  END IF;

  -- 이미 존재하면 제거 후 새로 삽입
  DELETE FROM message_templates
  WHERE channel = '이메일'
    AND variant_label = '1차'
    AND sender_account_id = v_account_id;

  INSERT INTO message_templates (name, channel, subject, body, variant_label, sender_account_id)
  VALUES (
    '이메일 1차 (콘텐츠개발팀)',
    '이메일',
    $tpl$[(주)핏크닉] 안녕하세요. '채널이름' 대표님께 한 가지 제안드립니다.$tpl$,
$tpl$안녕하세요, 대표님.
(주)핏크닉 콘텐츠개발팀 팀장 정승희입니다.

대표님의 '채널분야' 콘텐츠를 감명깊게 보고 연락을 드렸습니다.


핏크닉은 온, 오프라인 강의 플랫폼으로
이커머스, 마케팅, 디자인 등 다양한 분야의 수익화 강의를 제공하고 있습니다.

대표님이 가지신 인사이트와 노하우를 통해
더 큰 부가가치를 만들어낼 수 있을 것 같다는 생각을 했습니다. ㅎㅎ

저희 플랫폼이 어떤 곳이고, 어떻게 강의를 만들어가는지,
대표님과 어떤 부분이 잘 맞을 수 있을지 가볍게 말씀 나눠보고 싶습니다.


편하신 시간에 짧게 통화 한번 어떠신가요? ^^

아래에 제 연락처를 첨부드립니다.

통화 가능하신 요일과 시간을 알려주시면
그에 맞춰 연락드리겠습니다.

감사합니다.


(주)핏크닉 콘텐츠개발팀 팀장 정승희 드림


연락처: 010-7540-9761
홈페이지: fitchnic.com$tpl$,
    '1차',
    v_account_id
  );
END$$;

-- 확인
SELECT
  t.id,
  t.name,
  t.channel,
  t.variant_label,
  COALESCE(a.email, '공용') AS sender_email,
  length(t.body) AS body_len
FROM message_templates t
LEFT JOIN gmail_accounts a ON a.id = t.sender_account_id
WHERE t.channel = '이메일'
ORDER BY t.variant_label, sender_email NULLS FIRST;
