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

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_instructors_status ON instructors(status);
CREATE INDEX IF NOT EXISTS idx_instructors_assignee ON instructors(assignee);
CREATE INDEX IF NOT EXISTS idx_instructors_source ON instructors(source);
CREATE INDEX IF NOT EXISTS idx_instructors_is_banned ON instructors(is_banned);
CREATE INDEX IF NOT EXISTS idx_status_history_instructor ON status_history(instructor_id);
CREATE INDEX IF NOT EXISTS idx_outreach_waves_instructor ON outreach_waves(instructor_id);
CREATE INDEX IF NOT EXISTS idx_applications_platform ON applications(source_platform);

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
