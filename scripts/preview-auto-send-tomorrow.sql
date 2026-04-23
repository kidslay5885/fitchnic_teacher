-- 내일 자동 발송 대상 미리보기
-- cron이 내일 실행될 때 sent_date <= (내일 - 7일) = (오늘 - 6일) 이 조건에 해당하는 레코드를 찾음
-- 스킵 조건(이메일 없음/DM/연락 금지)도 함께 표시

WITH targets AS (
  -- 1차 → 2차 대상
  SELECT ow.instructor_id, 2 AS wave_number, ow.sent_date AS prev_sent_date
  FROM outreach_waves ow
  WHERE ow.wave_number = 1
    AND ow.result = '체크필요'
    AND ow.sent_date <= CURRENT_DATE - INTERVAL '6 days'
    AND NOT EXISTS (
      SELECT 1 FROM outreach_waves w2
      WHERE w2.instructor_id = ow.instructor_id AND w2.wave_number = 2
    )
  UNION ALL
  -- 2차 → 3차 대상
  SELECT ow.instructor_id, 3 AS wave_number, ow.sent_date AS prev_sent_date
  FROM outreach_waves ow
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
  i.name AS "이름",
  i.field AS "분야",
  i.email AS "이메일",
  COALESCE(NULLIF(i.send_method, ''), '(미지정)') AS "발송 수단",
  i.status AS "상태",
  t.prev_sent_date AS "이전 차수 발송일",
  CASE
    WHEN i.is_banned THEN '스킵 — 연락 금지'
    WHEN i.email IS NULL OR TRIM(i.email) = '' THEN '스킵 — 이메일 없음'
    WHEN i.send_method = 'DM' THEN '스킵 — 발송 수단 DM'
    ELSE '발송 예정'
  END AS "처리"
FROM targets t
JOIN instructors i ON i.id = t.instructor_id
ORDER BY "처리", t.wave_number, i.name;

-- 요약 카운트
SELECT
  t.wave_number AS "차수",
  COUNT(*) FILTER (
    WHERE NOT i.is_banned
      AND i.email IS NOT NULL AND TRIM(i.email) <> ''
      AND COALESCE(i.send_method, '') <> 'DM'
  ) AS "발송 예정",
  COUNT(*) FILTER (
    WHERE i.is_banned
      OR i.email IS NULL OR TRIM(i.email) = ''
      OR i.send_method = 'DM'
  ) AS "스킵",
  COUNT(*) AS "전체"
FROM (
  SELECT ow.instructor_id, 2 AS wave_number
  FROM outreach_waves ow
  WHERE ow.wave_number = 1 AND ow.result = '체크필요'
    AND ow.sent_date <= CURRENT_DATE - INTERVAL '6 days'
    AND NOT EXISTS (SELECT 1 FROM outreach_waves w WHERE w.instructor_id = ow.instructor_id AND w.wave_number = 2)
  UNION ALL
  SELECT ow.instructor_id, 3
  FROM outreach_waves ow
  WHERE ow.wave_number = 2 AND ow.result = '체크필요'
    AND ow.sent_date <= CURRENT_DATE - INTERVAL '6 days'
    AND NOT EXISTS (SELECT 1 FROM outreach_waves w WHERE w.instructor_id = ow.instructor_id AND w.wave_number = 3)
) t
JOIN instructors i ON i.id = t.instructor_id
GROUP BY t.wave_number
ORDER BY t.wave_number;
