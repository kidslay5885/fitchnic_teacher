-- =============================================
-- 김보성 발송 계정 추가 (강의기획팀 발신자명 공유)
-- =============================================
-- - gmail_accounts 에 from_name 컬럼 추가 (받는사람 메일함에 뜨는 발신자 표시명)
--   · 앱 발송계정 드롭다운 = label ("김보성")
--   · 받는사람 메일함 보낸사람 = from_name ("(주)핏크닉 강의기획팀")
--   · from_name 이 NULL 이면 기존처럼 label 사용 (기존 계정 동작 불변)
-- - 김보성 계정 등록 + 자동 후속(2·3차) 발송 대상 지정
-- - 강의기획팀(business.center) 이메일 템플릿을 김보성 계정용으로 복제
--   · 서명 "팀장 정승희" → "파트장 김보성"
--   · 연락처 → 010-5287-4552
-- Supabase SQL Editor 에서 실행
-- =============================================

-- 0. from_name 컬럼 (받는사람에게 보이는 발신자 표시명)
ALTER TABLE gmail_accounts
  ADD COLUMN IF NOT EXISTS from_name TEXT;

-- cron sender 단일 제약이 남아있으면 해제 (여러 자동 발송 계정 허용)
DROP INDEX IF EXISTS gmail_accounts_only_one_cron;

-- 1. 김보성 계정 등록
--    label(드롭다운)=김보성, from_name(받는사람 표시)=강의기획팀, 자동발송 ON
INSERT INTO gmail_accounts (email, label, from_name, is_default, is_cron_sender)
SELECT 'bbosk456@gmail.com', '김보성', '(주)핏크닉 강의기획팀', false, true
WHERE NOT EXISTS (SELECT 1 FROM gmail_accounts WHERE email = 'bbosk456@gmail.com');

-- 이미 존재하면 값 보정 (재실행 안전)
UPDATE gmail_accounts
SET label = '김보성',
    from_name = '(주)핏크닉 강의기획팀',
    is_cron_sender = true,
    updated_at = now()
WHERE email = 'bbosk456@gmail.com';

-- 2. 강의기획팀 이메일 템플릿을 김보성 계정용으로 복제 + 서명/연락처 치환
DO $$
DECLARE
  v_src UUID;  -- 강의기획팀
  v_dst UUID;  -- 김보성
BEGIN
  SELECT id INTO v_src FROM gmail_accounts WHERE email = 'business.center@fitchnic.com';
  SELECT id INTO v_dst FROM gmail_accounts WHERE email = 'bbosk456@gmail.com';
  IF v_src IS NULL THEN
    RAISE EXCEPTION '강의기획팀(business.center) 계정이 gmail_accounts 에 없습니다';
  END IF;
  IF v_dst IS NULL THEN
    RAISE EXCEPTION '김보성(bbosk456) 계정이 gmail_accounts 에 없습니다';
  END IF;

  -- 중복 방지: 김보성 기존 이메일 템플릿 제거 후 재삽입
  DELETE FROM message_templates
  WHERE channel = '이메일' AND sender_account_id = v_dst;

  INSERT INTO message_templates (name, channel, subject, body, variant_label, sender_account_id)
  SELECT
    -- 템플릿 이름 구분용 라벨 치환 (표시 목적)
    replace(replace(name, '팀메일', '김보성'), '강의기획팀', '김보성'),
    channel,
    subject,  -- 제목 동일
    -- 서명 이름/직함 치환 + 연락처 번호 치환 (010-XXXX-XXXX → 010-5287-4552)
    regexp_replace(
      replace(body, '팀장 정승희', '파트장 김보성'),
      '010-\d{3,4}-\d{4}', '010-5287-4552', 'g'
    ),
    variant_label,
    v_dst
  FROM message_templates
  WHERE channel = '이메일' AND sender_account_id = v_src;
END$$;

-- 확인 1) 계정 목록 (드롭다운 label / 받는사람 from_name / 자동발송)
SELECT email, label, from_name, is_default, is_cron_sender,
       (refresh_token IS NOT NULL) AS authenticated
FROM gmail_accounts
ORDER BY is_cron_sender DESC, is_default DESC, created_at ASC;

-- 확인 2) 김보성 이메일 템플릿 (제목/본문 길이)
SELECT t.variant_label, a.label AS sender_dropdown, a.from_name AS sender_shown,
       t.name, t.subject, length(t.body) AS body_len
FROM message_templates t
JOIN gmail_accounts a ON a.id = t.sender_account_id
WHERE a.email = 'bbosk456@gmail.com'
ORDER BY t.variant_label;
