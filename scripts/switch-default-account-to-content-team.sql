-- =============================================
-- 발송 모달 기본 선택 계정을 강의기획팀으로 전환
-- =============================================
-- is_default 는 unique partial index 가 걸려 있어 두 row를 동시에 true 로 두면
-- 위반이 발생할 수 있으므로 트랜잭션으로 ceo를 먼저 false, 그 다음 강의기획팀을 true.
-- is_cron_sender(=ceo) 는 그대로 유지되므로 자동 발송(2·3차)은 영향 없음.
-- =============================================

BEGIN;

UPDATE gmail_accounts
SET is_default = false, updated_at = now()
WHERE email = 'ceo@fitchnic.com';

UPDATE gmail_accounts
SET is_default = true, updated_at = now()
WHERE email = 'business.center@fitchnic.com';

COMMIT;

-- 확인
SELECT email, label, is_default, is_cron_sender
FROM gmail_accounts
ORDER BY is_default DESC, created_at ASC;
