-- 내일 자동 발송 대상 미리보기
-- cron이 내일 KST 10:06에 실행될 때의 cutoff(sent_date <= 내일 - 7일 = 오늘 - 6일) 기준
-- app/api/cron/auto-send-followups/route.ts 의 발송/스킵 로직과 일치

WITH targets AS (
  -- 1차 → 2차 대상
  SELECT ow.instructor_id,
         2 AS wave_number,
         ow.sent_date AS prev_sent_date,
         NULL::text   AS wave1_result
  FROM outreach_waves ow
  WHERE ow.wave_number = 1
    AND ow.result = '체크필요'
    AND ow.sent_date <= CURRENT_DATE - INTERVAL '6 days'
    AND NOT EXISTS (
      SELECT 1 FROM outreach_waves w2
      WHERE w2.instructor_id = ow.instructor_id AND w2.wave_number = 2
    )
  UNION ALL
  -- 2차 → 3차 대상 (1차 result 함께 조회)
  SELECT ow.instructor_id,
         3 AS wave_number,
         ow.sent_date AS prev_sent_date,
         w1.result    AS wave1_result
  FROM outreach_waves ow
  LEFT JOIN outreach_waves w1
    ON w1.instructor_id = ow.instructor_id AND w1.wave_number = 1
  WHERE ow.wave_number = 2
    AND ow.result = '체크필요'
    AND ow.sent_date <= CURRENT_DATE - INTERVAL '6 days'
    AND NOT EXISTS (
      SELECT 1 FROM outreach_waves w3
      WHERE w3.instructor_id = ow.instructor_id AND w3.wave_number = 3
    )
)
SELECT
  t.wave_number AS "차수",
  i.name        AS "이름",
  i.field       AS "분야",
  i.email       AS "이메일",
  COALESCE(NULLIF(i.send_method, ''), '(미지정)') AS "발송수단",
  COALESCE(i.status, '(없음)')                    AS "상태",
  t.prev_sent_date                                AS "이전차수 발송일",
  CASE
    WHEN i.is_banned                                  THEN '스킵 — 연락 금지'
    WHEN i.status IS DISTINCT FROM '진행 중'          THEN '스킵 — 상태 ' || COALESCE(i.status, '(없음)')
    WHEN i.email IS NULL OR TRIM(i.email) = ''        THEN '스킵 — 이메일 없음'
    WHEN COALESCE(i.send_method, '') <> '이메일'      THEN '스킵 — 발송 수단 ' || COALESCE(NULLIF(i.send_method, ''), '(미지정)')
    WHEN t.wave_number = 3
         AND t.wave1_result IS NOT NULL
         AND t.wave1_result <> '무응답'               THEN '스킵 — 1차 응답 ' || t.wave1_result
    ELSE '발송 예정'
  END AS "처리"
FROM targets t
JOIN instructors i ON i.id = t.instructor_id
ORDER BY
  CASE
    WHEN i.is_banned THEN 1
    WHEN i.status IS DISTINCT FROM '진행 중' THEN 1
    WHEN i.email IS NULL OR TRIM(i.email) = '' THEN 1
    WHEN COALESCE(i.send_method, '') <> '이메일' THEN 1
    WHEN t.wave_number = 3 AND t.wave1_result IS NOT NULL AND t.wave1_result <> '무응답' THEN 1
    ELSE 0
  END,
  t.wave_number,
  i.name;

-- 요약 카운트
WITH targets AS (
  SELECT ow.instructor_id,
         2 AS wave_number,
         NULL::text AS wave1_result
  FROM outreach_waves ow
  WHERE ow.wave_number = 1
    AND ow.result = '체크필요'
    AND ow.sent_date <= CURRENT_DATE - INTERVAL '6 days'
    AND NOT EXISTS (
      SELECT 1 FROM outreach_waves w2
      WHERE w2.instructor_id = ow.instructor_id AND w2.wave_number = 2
    )
  UNION ALL
  SELECT ow.instructor_id,
         3 AS wave_number,
         w1.result AS wave1_result
  FROM outreach_waves ow
  LEFT JOIN outreach_waves w1
    ON w1.instructor_id = ow.instructor_id AND w1.wave_number = 1
  WHERE ow.wave_number = 2
    AND ow.result = '체크필요'
    AND ow.sent_date <= CURRENT_DATE - INTERVAL '6 days'
    AND NOT EXISTS (
      SELECT 1 FROM outreach_waves w3
      WHERE w3.instructor_id = ow.instructor_id AND w3.wave_number = 3
    )
)
SELECT
  t.wave_number AS "차수",
  COUNT(*) FILTER (
    WHERE NOT i.is_banned
      AND i.status = '진행 중'
      AND i.email IS NOT NULL AND TRIM(i.email) <> ''
      AND COALESCE(i.send_method, '') = '이메일'
      AND NOT (t.wave_number = 3 AND t.wave1_result IS NOT NULL AND t.wave1_result <> '무응답')
  ) AS "발송 예정",
  string_agg(i.name || ' <' || COALESCE(i.email, '') || '>', E'\n' ORDER BY i.name) FILTER (
    WHERE NOT i.is_banned
      AND i.status = '진행 중'
      AND i.email IS NOT NULL AND TRIM(i.email) <> ''
      AND COALESCE(i.send_method, '') = '이메일'
      AND NOT (t.wave_number = 3 AND t.wave1_result IS NOT NULL AND t.wave1_result <> '무응답')
  ) AS "발송 강사",
  COUNT(*) FILTER (
    WHERE i.is_banned
      OR i.status IS DISTINCT FROM '진행 중'
      OR i.email IS NULL OR TRIM(i.email) = ''
      OR COALESCE(i.send_method, '') <> '이메일'
      OR (t.wave_number = 3 AND t.wave1_result IS NOT NULL AND t.wave1_result <> '무응답')
  ) AS "스킵",
  COUNT(*) AS "전체"
FROM targets t
JOIN instructors i ON i.id = t.instructor_id
GROUP BY t.wave_number
ORDER BY t.wave_number;
