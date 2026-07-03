-- =============================================
-- 팀메일(강의기획팀) 2·3차 자동 발송 활성화
-- =============================================
-- 1) is_cron_sender "동시에 1개만" 제약(unique index) 제거 → 여러 계정 자동 발송 허용
-- 2) 팀메일(business.center@fitchnic.com) 계정을 자동 발송 계정으로 지정
-- 3) 팀메일 전용 1·2·3차 템플릿 등록 (1차 교체 / 2·3차 신규)
--    조회 우선순위: 계정 전용(sender_account_id) > 공용(NULL)
-- Supabase SQL Editor 에서 실행
-- =============================================

-- 1. cron sender 단일 제약 해제 (대표 + 팀메일 등 복수 자동 발송 계정 허용)
DROP INDEX IF EXISTS gmail_accounts_only_one_cron;

-- 2. 팀메일 계정을 자동 후속 발송 대상으로 지정 + 템플릿 등록
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

  -- 자동 후속(2·3차) 발송 대상으로 지정
  UPDATE gmail_accounts
  SET is_cron_sender = true, updated_at = now()
  WHERE id = v_account_id;

  -- 기존 팀메일 전용 1·2·3차 템플릿 제거 후 재삽입
  DELETE FROM message_templates
  WHERE channel = '이메일'
    AND variant_label IN ('1차', '2차', '3차')
    AND sender_account_id = v_account_id;

  -- ----- 1차 -----
  INSERT INTO message_templates (name, channel, subject, body, variant_label, sender_account_id)
  VALUES (
    '이메일 1차 (팀메일)',
    '이메일',
    $tpl$(주)핏크닉_안녕하세요. '채널이름' 대표님께 한 가지 제안을 드립니다.$tpl$,
$tpl$안녕하세요, '채널이름' 대표님
(주)핏크닉 강의기획팀 팀장 정승희입니다.

대표님의 '채널분야' 콘텐츠를 보고 꼭 한번 이야기를 나눠보고 싶어 메일을 드렸습니다.

원래 이런 연락을 자주 드리지 않습니다만,
대표님이 가진 노하우와 콘텐츠를 보면서
대표님과 함께 의미 있는 협업을 할 수 있겠다는 생각이 들어 연락을 드렸습니다.

먼저 저희 핏크닉 소개를 간단하게 드리겠습니다. :)

핏크닉은 온, 오프라인 강의 플랫폼으로 41명의 강사님과 함께하고 있습니다.
핏크닉이 추구하는 가장 중요한 가치는 '성장'입니다.
이 성장을 숫자로 표현하면 다음과 같습니다.

- 평균 강사 기수 : 4기수↑
- 강의 만족도 : 8.6 / 10점
- 강의 추천 의향 : 84.7%
(설문 참여 인원 : 1,084명)

숫자가 전부를 말해주진 않지만,
핏크닉이 강사님과 수강생의 성장을 얼마나 중요하게 생각하는지는 확인할 수 있다고 생각합니다.

대표님께서 핏크닉과 함께하신다면,
가지신 노하우와 가치를 더 많은 사람들에게 전달할 수 있을 뿐만 아니라,
그 과정에서 대표님의 브랜드와 전문성이 자연스럽게 쌓이는 경험을 제공해드릴 수 있습니다.

관련하여 가볍게 커피챗하면서 이야기를 나눠보는건 어떠신가요?
물론 부담을 가지실 필요는 전혀 없습니다.
커피 한 잔하며 서로의 인사이트와 방향성을 공유하는 시간이라고 생각해주시면 좋을 것 같습니다. ^^

아래 제 연락처를 첨부하오니 편한 시간에 연락 한 번 부탁드리겠습니다.
좋은 인연이 될 수 있길 기원하겠습니다.

감사합니다. ^^


(주)핏크닉 강의기획팀 팀장 정승희 드림

-
연락처 : 010-2240-3559
홈페이지 : fitchnic.com$tpl$,
    '1차',
    v_account_id
  );

  -- ----- 2차 -----
  INSERT INTO message_templates (name, channel, subject, body, variant_label, sender_account_id)
  VALUES (
    '이메일 2차 (팀메일)',
    '이메일',
    $tpl$(주)핏크닉_안녕하세요 대표님, 다시 한 번 연락드립니다.$tpl$,
$tpl$안녕하세요, '채널이름' 대표님.
(주)핏크닉 강의기획팀 팀장 정승희입니다.

지난번 메일에서 핏크닉 소개가 조금 부족했던 것 같아 이렇게 다시 한번 연락드립니다.

처음 강의 연락을 받으셨을 때, 아마 이런 생각을 하셨을 것 같습니다.

'내가 강의를 잘 만들 수 있을까?'
'기획이나 마케팅을 해준다고 하는데, 실제로 얼마나 해줄까?'
'혼자 해도 되는데 굳이 같이 해야 할 이유가 있을까?'

그동안 많은 강사님들과 함께 강의를 만들어 온 만큼
강사님들의 고충을 누구보다 잘 알고 있다고 생각하는데요. ㅎㅎ

수강생 모집, CS, 과제 관리, 질의응답까지 강의 하나에 들어가는 일이 생각보다 많습니다.
수강생 모집 단계에서 막히는 경우도 대부분이고요.
결국 강사님께서 돈, 시간만 낭비하는 경우를 정말 많이 봐왔습니다.

핏크닉 강사님들께서 핏크닉과 오래 함께하시는 이유가 바로 여기에 있습니다.
저희는 강의 기획부터 마케팅, 촬영, 운영까지 전 과정을 함께해드리고 있습니다.
담당 PM, PD, CS팀이 배정되어 강사님께서 오롯이 강의에만 몰입하실 수 있는 환경을 만들어드립니다.

'강의에 온전히 집중하고, 수강생을 케어하며 압도적인 성장을 하고 싶다'라는 니즈가 있으시다면
핏크닉이 정답이 되리라고 확신합니다.

커피챗 및 미팅은 담당부서인 강의기획팀에서 직접 진행하고 있으며,
아래 첨부된 제 연락처로 편히 연락주시면 감사하겠습니다. ^^

(주)핏크닉 강의기획팀 팀장 정승희 드림

-
연락처 : 010-2240-3559
홈페이지 : fitchnic.com$tpl$,
    '2차',
    v_account_id
  );

  -- ----- 3차 -----
  INSERT INTO message_templates (name, channel, subject, body, variant_label, sender_account_id)
  VALUES (
    '이메일 3차 (팀메일)',
    '이메일',
    $tpl$(주)핏크닉_안녕하세요 대표님, 마지막으로 인사드립니다. :)$tpl$,
$tpl$안녕하세요, 대표님.
(주)핏크닉 강의기획팀 팀장 정승희입니다.

이전에 두 번 정도 메일을 드렸는데,
이번이 마지막 메일이 될 것 같습니다.

바쁘셔서 못 보셨을 수도 있고,
지금 당장 관심이 없으실 수도 있다고 생각합니다.
어떤 이유든 충분히 이해합니다.

다만 한 가지만 말씀드리고 싶습니다.

강의는 타이밍이 중요합니다.
시장이 원하는 타이밍에 시작하는 강의와
그 타이밍을 놓친 강의는 결과가 크게 달라집니다.

추후 긍정적인 생각이 드셨을 때,
핏크닉과 대표님이 함께할 수 있으면 좋겠습니다.

언제든 편하게 연락 주세요.

앞으로도 대표님의 성장과 성공을 늘 응원하겠습니다.

감사합니다. ^^

(주)핏크닉 강의기획팀 팀장 정승희 드림

-
연락처 : 010-2240-3559
홈페이지 : fitchnic.com$tpl$,
    '3차',
    v_account_id
  );
END$$;

-- 확인 1) 자동 발송 계정 목록
SELECT email, label, is_default, is_cron_sender
FROM gmail_accounts
ORDER BY is_cron_sender DESC, is_default DESC, created_at ASC;

-- 확인 2) 이메일 템플릿 목록 (계정 전용 / 공용)
SELECT
  t.variant_label,
  COALESCE(a.email, '공용') AS sender_email,
  t.name,
  length(t.body) AS body_len
FROM message_templates t
LEFT JOIN gmail_accounts a ON a.id = t.sender_account_id
WHERE t.channel = '이메일'
ORDER BY t.variant_label, sender_email NULLS FIRST;
