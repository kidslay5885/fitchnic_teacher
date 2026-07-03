-- =============================================
-- 콘텐츠개발팀 계정 표시명(label) 변경
--   (주)핏크닉 콘텐츠개발팀 → (주)핏크닉 강의기획팀
-- =============================================
-- 발송 메일의 보낸사람 이름은 gmail_accounts.label 을 그대로 사용한다
-- (lib/gmail.ts). email 은 그대로 두고 label 만 변경.
-- =============================================

UPDATE gmail_accounts
SET label = '(주)핏크닉 강의기획팀', updated_at = now()
WHERE email = 'business.center@fitchnic.com';

-- 이메일 템플릿 본문/이름의 서명도 함께 변경
--   "콘텐츠개발팀" → "강의기획팀" (본문 서명 2곳, 템플릿 이름 포함)
UPDATE message_templates
SET name = REPLACE(name, '콘텐츠개발팀', '강의기획팀'),
    body = REPLACE(body, '콘텐츠개발팀', '강의기획팀')
WHERE body LIKE '%콘텐츠개발팀%' OR name LIKE '%콘텐츠개발팀%';

-- 확인
SELECT email, label, is_default, is_cron_sender
FROM gmail_accounts
ORDER BY is_default DESC, created_at ASC;

SELECT id, name, variant_label
FROM message_templates
WHERE body LIKE '%강의기획팀%' OR name LIKE '%강의기획팀%';
