import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { STATUSES } from "@/lib/constants";
import type { Instructor, InstructorStatus, DashboardStats } from "@/lib/types";

export async function GET() {
  const sb = getSupabase();
  // 강사 전체 페이지네이션 조회 (Supabase 1000건 제한 우회)
  const PAGE = 1000;
  const allInstructors: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("instructors")
      .select("id, status, assignee, source, final_status, meeting_date")
      .eq("is_banned", false)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    allInstructors.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const [{ data: apps }, { data: waves }] = await Promise.all([
    sb.from("applications").select("review_status"),
    sb.from("outreach_waves").select("instructor_id, wave_number, sent_date, result"),
  ]);

  const instructors = allInstructors;

  const list = (instructors ?? []) as Pick<Instructor, "id" | "status" | "assignee" | "source" | "final_status" | "meeting_date">[];
  const appList = (apps ?? []) as { review_status: string }[];
  const waveList = (waves ?? []) as { instructor_id: string; wave_number: number; sent_date: string; result: string }[];

  // 강사별 wave 맵
  const wavesByInstructor: Record<string, typeof waveList> = {};
  for (const w of waveList) {
    if (!wavesByInstructor[w.instructor_id]) wavesByInstructor[w.instructor_id] = [];
    wavesByInstructor[w.instructor_id].push(w);
  }

  const byStatus = {} as Record<InstructorStatus, number>;
  for (const s of STATUSES) byStatus[s] = 0;

  const byAssignee: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  let sent = 0, responded = 0, meeting = 0, contracted = 0;

  // 섹션별 강사 분류
  const sectionGroups: Record<string, typeof list> = {
    "발송 예정": [],
    "진행 중": [],
    "제외/보류/거절": [],
    "계약 완료": [],
  };

  for (const i of list) {
    const s = i.status as InstructorStatus;
    if (byStatus[s] !== undefined) byStatus[s]++;
    if (i.assignee) byAssignee[i.assignee] = (byAssignee[i.assignee] || 0) + 1;
    if (i.source) bySource[i.source] = (bySource[i.source] || 0) + 1;

    if (["진행 중", "계약 완료", "거절"].includes(s)) sent++;
    if (s === "계약 완료" || i.final_status === "응답") responded++;
    if (i.meeting_date) meeting++;
    if (s === "계약 완료") contracted++;

    if (s === "발송 예정") sectionGroups["발송 예정"].push(i);
    else if (s === "진행 중") sectionGroups["진행 중"].push(i);
    else if (["제외", "보류", "거절"].includes(s)) sectionGroups["제외/보류/거절"].push(i);
    else if (s === "계약 완료") sectionGroups["계약 완료"].push(i);
  }

  // 섹션별 차수별 반응률
  const calcWaveRates = (members: typeof list) => {
    return [1, 2, 3].map((n) => {
      let s = 0, r = 0;
      for (const inst of members) {
        const w = (wavesByInstructor[inst.id] || []).find((w) => w.wave_number === n);
        if (w?.sent_date) {
          s++;
          if (w.result && w.result !== "무응답") r++;
        }
      }
      return { sent: s, reacted: r, rate: s > 0 ? Math.round((r / s) * 100) : null };
    });
  };

  const waveRates = {
    "발송 예정": calcWaveRates(sectionGroups["발송 예정"]),
    "진행 중": calcWaveRates(sectionGroups["진행 중"]),
    "제외/보류/거절": calcWaveRates(sectionGroups["제외/보류/거절"]),
    "계약 완료": calcWaveRates(sectionGroups["계약 완료"]),
  };

  const pendingApplications = appList.filter(
    (a) => a.review_status === "미확인"
  ).length;

  const stats: DashboardStats = {
    total: list.length,
    byStatus,
    byAssignee,
    bySource,
    funnel: { sent, responded, meeting, contracted },
    pendingApplications,
    waveRates,
  };

  return NextResponse.json(stats);
}
