-- =============================================
-- 핏크닉 강사 아웃리치 매니저 — Supabase 스키마
-- =============================================

-- 1. 강사 마스터 테이블
CREATE TABLE IF NOT EXISTS instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  field TEXT DEFAULT '',
  assignee TEXT DEFAULT '',
  ref_link TEXT DEFAULT '',
  has_lecture_history TEXT DEFAULT '',
  lecture_platform TEXT DEFAULT '',
  youtube TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  status TEXT DEFAULT '미검토',
  exclude_reason TEXT DEFAULT '',
  outreach_channel TEXT DEFAULT '',
  dm_sent BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  final_status TEXT DEFAULT '',
  meeting_memo TEXT DEFAULT '',
  meeting_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT '강사모집',
  instructor_info TEXT DEFAULT '',
  is_banned BOOLEAN DEFAULT false,
  ban_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 상태 변경 이력
CREATE TABLE IF NOT EXISTS status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID REFERENCES instructors(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 발송 기록 (1~3차)
CREATE TABLE IF NOT EXISTS outreach_waves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID REFERENCES instructors(id) ON DELETE CASCADE,
  wave_number INTEGER NOT NULL CHECK (wave_number BETWEEN 1 AND 3),
  sent_date DATE,
  result TEXT DEFAULT '',
  response_method TEXT DEFAULT '',
  pre_info TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  UNIQUE(instructor_id, wave_number)
);

-- 4. 금지 플랫폼
CREATE TABLE IF NOT EXISTS banned_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 기본 금지 플랫폼 삽입
INSERT INTO banned_platforms (name) VALUES
  ('타이탄클래스'),
  ('인베이더스쿨'),
  ('코주부클래스'),
  ('N잡연구소'),
  ('사이클해커스')
ON CONFLICT (name) DO NOTHING;

-- 5. 지원서
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
  source_platform TEXT NOT NULL,
  applicant_name TEXT DEFAULT '',
  activity_name TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  experience TEXT DEFAULT '',
  topic TEXT DEFAULT '',
  motivation TEXT DEFAULT '',
  career TEXT DEFAULT '',
  student_results TEXT DEFAULT '',
  student_benefits TEXT DEFAULT '',
  sns_link TEXT DEFAULT '',
  review_status TEXT DEFAULT '미확인',
  reviewed_by TEXT DEFAULT '',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. 메시지 템플릿
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  variant_label TEXT DEFAULT ''
);

-- 7. 활동 로그 (통합)
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,       -- 예: 강사등록, 강사삭제, 강사수정, 상태변경, 발송저장, 발송삭제, 지원서등록, 지원서수정, 지원서삭제, 금지플랫폼추가, 금지플랫폼삭제, 템플릿저장, 보고서생성, 보고서삭제
  target_type TEXT NOT NULL,       -- 예: instructor, application, banned_platform, template, meeting_report
  target_id TEXT DEFAULT '',
  target_name TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  performed_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- activity_logs 5000건 제한 함수
CREATE OR REPLACE FUNCTION trim_activity_logs()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM activity_logs
  WHERE id IN (
    SELECT id FROM activity_logs
    ORDER BY created_at DESC
    OFFSET 5000
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_trim_activity_logs
  AFTER INSERT ON activity_logs
  FOR EACH STATEMENT EXECUTE FUNCTION trim_activity_logs();

-- 8. YouTube 채널 수집 데이터
CREATE TABLE IF NOT EXISTS youtube_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile TEXT NOT NULL DEFAULT '',
  keyword TEXT DEFAULT '',
  channel_name TEXT NOT NULL,
  subscriber_count TEXT DEFAULT '',
  channel_url TEXT DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT '미검토',
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE TRIGGER tr_youtube_channels_updated
  BEFORE UPDATE ON youtube_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_instructors_status ON instructors(status);
CREATE INDEX IF NOT EXISTS idx_instructors_assignee ON instructors(assignee);
CREATE INDEX IF NOT EXISTS idx_instructors_source ON instructors(source);
CREATE INDEX IF NOT EXISTS idx_instructors_is_banned ON instructors(is_banned);
CREATE INDEX IF NOT EXISTS idx_status_history_instructor ON status_history(instructor_id);
CREATE INDEX IF NOT EXISTS idx_outreach_waves_instructor ON outreach_waves(instructor_id);
CREATE INDEX IF NOT EXISTS idx_applications_platform ON applications(source_platform);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_target ON activity_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_youtube_channels_email ON youtube_channels(email);
CREATE INDEX IF NOT EXISTS idx_youtube_channels_profile ON youtube_channels(profile);
CREATE INDEX IF NOT EXISTS idx_youtube_channels_status ON youtube_channels(status);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_instructors_updated
  BEFORE UPDATE ON instructors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
