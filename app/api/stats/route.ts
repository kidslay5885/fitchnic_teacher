import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { STATUSES } from "@/lib/constants";
import type { Instructor, InstructorStatus, DashboardStats } from "@/lib/types";

export async function GET() {
  const sb = getSupabase();
  const [{ data: instructors }, { data: apps }] = await Promise.all([
    sb.from("instructors").select("status, assignee, source, final_status, meeting_date"),
    sb.from("applications").select("review_status"),
  ]);

  const list = (instructors ?? []) as Pick<Instructor, "status" | "assignee" | "source" | "final_status" | "meeting_date">[];
  const appList = (apps ?? []) as { review_status: string }[];

  const byStatus = {} as Record<InstructorStatus, number>;
  for (const s of STATUSES) byStatus[s] = 0;

  const byAssignee: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  let sent = 0, responded = 0, meeting = 0, contracted = 0;

  for (const i of list) {
    const s = i.status as InstructorStatus;
    if (byStatus[s] !== undefined) byStatus[s]++;
    if (i.assignee) byAssignee[i.assignee] = (byAssignee[i.assignee] || 0) + 1;
    if (i.source) bySource[i.source] = (bySource[i.source] || 0) + 1;

    if (["진행 중", "계약 완료", "거절"].includes(s)) sent++;
    if (s === "계약 완료" || i.final_status === "응답") responded++;
    if (i.meeting_date) meeting++;
    if (s === "계약 완료") contracted++;
  }

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
  };

  return NextResponse.json(stats);
}
