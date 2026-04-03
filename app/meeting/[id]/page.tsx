"use client";

import { useState, useEffect, use } from "react";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS } from "@/lib/constants";
import type { Instructor, InstructorStatus } from "@/lib/types";
import { ExternalLink, Phone, Mail, Calendar, Clock } from "lucide-react";

const PRE_QUESTIONS = [
  { section: "기본 확인 사항", questions: [
    "핏크닉을 알고 있었는지, 이번에 연락이 닿아서 알게 되었는지",
    "'강의' 형태로 진행 여부 (온라인/오프라인, 기수제/상시판매/웨비나 등)",
  ]},
  { section: "콘텐츠 관련 확인사항", questions: [
    "수익을 내고 있는 콘텐츠",
    "현재 수익 규모",
    "유사 콘텐츠 강의와 다른점 (소구점, 고객 어필 포인트)",
    "AI를 활용하고 있는지, 어떻게 활용하는지",
  ]},
  { section: "강의 관련 확인 사항", questions: [
    "수강생 연령대, 타깃 고객",
    "강의 커리큘럼 (보유 여부, 진행 주차 등)",
    "수강생 실제 수익화 여부, 수익 발생 기간",
    "한번에 가능한 수강생 수 (우리는 한 기수당 100명, 강의금액 2~3백만원 대 감당 가능한지)",
  ]},
  { section: "위험 방어", questions: [
    "강의 진행 시 수강생 불만/항의 경험 및 해결방법",
    "콘텐츠로 수익을 내면서 플랫폼에서 알아야 할 위험요소",
  ]},
  { section: "기타", questions: [""] },
];

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatMeetingDate(md: string) {
  const dateMatch = md.match(/(\d{4}-\d{2}-\d{2})/);
  const timeMatch = md.match(/(\d{1,2}:\d{2})/);
  const date = dateMatch?.[1] || "";
  const time = timeMatch?.[1] || "";
  if (!date) return md;
  const d = new Date(date);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DAY_KO[d.getDay()];
  return time ? `${m}/${day}(${dow}) ${time}` : `${m}/${day}(${dow})`;
}

function parsePostInfo(raw: string) {
  try { const p = JSON.parse(raw); return { special: p.special || "", positive: p.positive || "", negative: p.negative || "" }; }
  catch { return { special: raw || "", positive: "", negative: "" }; }
}

interface Report {
  id: string;
  title: string;
  instructor_ids: string[];
  fields: string[];
  created_at: string;
}

// 필드 라벨 매핑
const FIELD_LABELS: Record<string, string> = {
  name: "이름", status: "상태", field: "분야", assignee: "찾은 사람",
  contact_assignee: "담당자", meeting_date: "미팅일", meeting_type: "미팅 방식",
  meeting_confirmed: "미팅 확정", meeting_memo: "메모", remind_date: "리마인드",
  phone: "전화번호", email: "이메일", youtube: "유튜브", instagram: "인스타그램",
  has_lecture_history: "강의이력", lecture_platform: "플랫폼", ref_link: "참조링크",
  source: "출처", pre_info: "사전 정보", pre_questions: "미팅 질문",
  post_special: "특이사항", post_positive: "긍정적인 점", post_negative: "부정적인 점",
  notes: "비고",
};

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<Report | null>(null);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/meeting-reports/${id}`);
        if (!res.ok) { setError("보고서를 찾을 수 없습니다."); return; }
        const data = await res.json();
        setReport(data.report);
        setInstructors(data.instructors || []);
      } catch { setError("로딩 실패"); }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      </div>
    </div>
  );

  if (error || !report) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">{error || "보고서를 찾을 수 없습니다."}</p>
    </div>
  );

  const fields = report.fields as string[];
  const has = (f: string) => fields.includes(f);

  // 기본 정보 필드 (카드 상단에 표시)
  const basicFields = ["field", "assignee", "contact_assignee", "has_lecture_history", "lecture_platform", "source"].filter(has);
  // 연락처 필드
  const contactFields = ["phone", "email", "youtube", "instagram"].filter(has);
  // 미팅 필드
  const meetingFields = ["meeting_date", "meeting_type", "meeting_confirmed", "meeting_memo", "remind_date"].filter(has);
  // 텍스트 블록 필드
  const contentFields = ["pre_info", "pre_questions", "post_special", "post_positive", "post_negative", "notes"].filter(has);

  const getValue = (inst: Instructor, field: string): string => {
    switch (field) {
      case "meeting_date": return inst.meeting_date ? formatMeetingDate(inst.meeting_date) : "-";
      case "meeting_type": return inst.meeting_type || "-";
      case "meeting_confirmed": return inst.meeting_confirmed ? "확정" : "미확정";
      case "meeting_memo": return inst.meeting_memo || "-";
      case "remind_date": return inst.remind_date || "-";
      case "contact_assignee": return inst.contact_assignee || inst.assignee || "-";
      default: return (inst as any)[field] || "-";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b px-8 py-5">
        <h1 className="text-xl font-bold">{report.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date(report.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} · {instructors.length}명
        </p>
      </header>

      {/* 강사 카드 목록 */}
      <div className="max-w-[1200px] mx-auto px-8 py-6 space-y-6">
        {instructors.map((inst) => {
          const post = parsePostInfo(inst.post_info || "");
          let preQ: Record<string, string> = {};
          try { if (inst.pre_questions) preQ = JSON.parse(inst.pre_questions); } catch {}

          return (
            <div key={inst.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {/* 카드 헤더 */}
              <div className="px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white flex items-center gap-3">
                <h2 className="text-lg font-bold">{inst.name}</h2>
                {has("status") && (
                  <Badge className={`text-xs px-2 py-0.5 ${STATUS_COLORS[inst.status as InstructorStatus] || ""}`}>{inst.status}</Badge>
                )}
                {has("meeting_confirmed") && inst.meeting_confirmed && (
                  <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">미팅 확정</span>
                )}
                {has("meeting_type") && inst.meeting_type && (
                  <Badge variant="outline" className={`text-xs px-2 py-0.5 ${
                    inst.meeting_type === "줌미팅" ? "text-blue-600 border-blue-300 bg-blue-50" : "text-orange-600 border-orange-300 bg-orange-50"
                  }`}>{inst.meeting_type}</Badge>
                )}
              </div>

              <div className="px-6 py-4">
                {/* 상단 정보 그리드 */}
                {(basicFields.length > 0 || contactFields.length > 0 || meetingFields.length > 0) && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3 mb-5">
                    {basicFields.map((f) => (
                      <div key={f}>
                        <p className="text-xs text-muted-foreground mb-0.5">{FIELD_LABELS[f]}</p>
                        <p className="text-sm font-medium">{getValue(inst, f)}</p>
                      </div>
                    ))}
                    {meetingFields.map((f) => (
                      <div key={f}>
                        <p className="text-xs text-muted-foreground mb-0.5">{FIELD_LABELS[f]}</p>
                        <p className="text-sm font-medium">{getValue(inst, f)}</p>
                      </div>
                    ))}
                    {contactFields.map((f) => {
                      const val = getValue(inst, f);
                      const isLink = f === "youtube" || f === "instagram";
                      const isUrl = val.startsWith("http");
                      return (
                        <div key={f}>
                          <p className="text-xs text-muted-foreground mb-0.5">{FIELD_LABELS[f]}</p>
                          {isLink && isUrl ? (
                            <a href={val} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                              {val.length > 30 ? val.slice(0, 30) + "..." : val}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : f === "email" && val !== "-" ? (
                            <a href={`mailto:${val}`} className="text-sm text-blue-600 hover:underline">{val}</a>
                          ) : f === "phone" && val !== "-" ? (
                            <a href={`tel:${val}`} className="text-sm text-blue-600 hover:underline">{val}</a>
                          ) : (
                            <p className="text-sm font-medium">{val}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 텍스트 블록 */}
                {contentFields.length > 0 && (
                  <div className="space-y-4">
                    {has("pre_info") && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">사전 정보</p>
                        <div className="bg-gray-50 border rounded-lg px-4 py-3 text-sm whitespace-pre-wrap">{inst.pre_info || "-"}</div>
                      </div>
                    )}

                    {has("pre_questions") && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">미팅 질문</p>
                        <div className="bg-gray-50 border rounded-lg px-4 py-3 space-y-3">
                          {PRE_QUESTIONS.map((section, si) => {
                            const answers = section.questions.map((_, qi) => preQ[`${si}_${qi}`] || "").filter(a => a);
                            if (answers.length === 0) return null;
                            return (
                              <div key={si}>
                                <p className="text-xs font-semibold mb-1">{si + 1}. {section.section}</p>
                                {section.questions.map((q, qi) => {
                                  const answer = preQ[`${si}_${qi}`];
                                  if (!answer) return null;
                                  return (
                                    <div key={qi} className="ml-3 mb-1.5">
                                      {q && <p className="text-xs text-muted-foreground">{q}</p>}
                                      <p className="text-sm">{answer}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {has("post_special") && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">사후 - 특이사항</p>
                        <div className="bg-gray-50 border rounded-lg px-4 py-3 text-sm whitespace-pre-wrap">{post.special || "-"}</div>
                      </div>
                    )}

                    {has("post_positive") && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">사후 - 긍정적인 점</p>
                        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm whitespace-pre-wrap">{post.positive || "-"}</div>
                      </div>
                    )}

                    {has("post_negative") && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">사후 - 부정적인 점</p>
                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm whitespace-pre-wrap">{post.negative || "-"}</div>
                      </div>
                    )}

                    {has("notes") && inst.notes && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">비고</p>
                        <div className="bg-gray-50 border rounded-lg px-4 py-3 text-sm whitespace-pre-wrap">{inst.notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
