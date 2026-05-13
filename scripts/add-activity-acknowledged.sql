-- activity_logs에 미확인 실패 추적용 컬럼 추가
-- 자동 발송 실패 등 액션을 사용자가 [확인]하면 acknowledged_at에 시간 기록.
-- 미확인 실패가 1건이라도 있으면 사이드바에 빨간 점 표시.

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by TEXT;

-- 미확인 실패 빠른 조회용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_activity_logs_unacked_fail
  ON activity_logs(created_at DESC)
  WHERE action_type = '이메일발송실패' AND acknowledged_at IS NULL;
