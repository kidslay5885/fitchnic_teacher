// ===== 상태 관련 =====
export type InstructorStatus =
  | "미검토"
  | "컨펌 필요"
  | "발송 예정"
  | "진행 중"
  | "계약 완료"
  | "제외"
  | "보류"
  | "거절";

export type OutreachChannel = "DM" | "이메일" | "DM+이메일" | "";
export type WaveResult = "무응답" | "읽씹" | "응답" | "거절" | "";
export type ApplicationSource =
  | "핏크닉메타"
  | "핏크닉홈"
  | "머니업홈"
  | "핏크닉카"
  | "머니업카";
export type ReviewStatus = "미확인" | "확인완료";
export type InstructorSource = "강사모집" | "콘텐츠팀" | "지원서";

// ===== DB 테이블 타입 =====
export interface Instructor {
  id: string;
  name: string;
  field: string;
  assignee: string;
  ref_link: string;
  has_lecture_history: string;
  lecture_platform: string;
  lecture_platform_url: string;
  youtube: string;
  instagram: string;
  email: string;
  phone: string;
  status: InstructorStatus;
  exclude_reason: string;
  outreach_channel: OutreachChannel;
  dm_sent: boolean;
  email_sent: boolean;
  final_status: string;
  meeting_memo: string;
  meeting_date: string;
  notes: string;
  source: InstructorSource;
  instructor_info: string;
  is_banned: boolean;
  ban_reason: string;
  created_at: string;
  updated_at: string;
}

export interface StatusHistory {
  id: string;
  instructor_id: string;
  from_status: string;
  to_status: string;
  changed_by: string;
  reason: string;
  created_at: string;
}

export interface OutreachWave {
  id: string;
  instructor_id: string;
  wave_number: number;
  sent_date: string;
  result: WaveResult;
  notes: string;
}

export interface BannedPlatform {
  id: string;
  name: string;
  created_at: string;
}

export interface Application {
  id: string;
  instructor_id: string | null;
  source_platform: ApplicationSource;
  applicant_name: string;
  activity_name: string;
  contact: string;
  experience: string;
  topic: string;
  motivation: string;
  career: string;
  student_results: string;
  student_benefits: string;
  sns_link: string;
  review_status: ReviewStatus;
  reviewed_by: string;
  submitted_at: string;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  channel: string;
  subject: string;
  body: string;
  variant_label: string;
}

// ===== UI 상태 =====
export type TabId =
  | "dashboard"
  | "instructors"
  | "contact"
  | "meeting"
  | "applications"
  | "banned"
  | "messages"
  | "activity";

export interface InstructorWithWaves extends Instructor {
  waves: OutreachWave[];
  history: StatusHistory[];
}

export interface WaveRate {
  sent: number;
  reacted: number;
  rate: number | null;
}

export interface DashboardStats {
  total: number;
  byStatus: Record<InstructorStatus, number>;
  byAssignee: Record<string, number>;
  bySource: Record<string, number>;
  funnel: {
    sent: number;
    responded: number;
    meeting: number;
    contracted: number;
  };
  pendingApplications: number;
  waveRates?: {
    "발송 예정": WaveRate[];
    "진행 중": WaveRate[];
    "제외/보류/거절": WaveRate[];
    "계약 완료": WaveRate[];
  };
}

export interface FilterState {
  search: string;
  status: InstructorStatus | "전체";
  assignee: string;
  field: string;
  source: InstructorSource | "전체";
}
