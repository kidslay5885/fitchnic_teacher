import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

interface UnifiedLog {
  id: string;
  action_type: string;
  target_type: string;
  target_name: string;
  detail: string;
  performed_by: string;
  created_at: string;
}

export async function GET(req: Request) {
  const sb = getSupabase();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  // 1. status_history 조회
  const { data: history, count: historyCount } = await sb
    .from("status_history")
    .select("id, instructor_id, from_status, to_status, changed_by, reason, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  // 강사 이름 매핑
  const instructorIds = [...new Set((history || []).map((h) => h.instructor_id))];
  const { data: names } = instructorIds.length > 0
    ? await sb.from("instructors").select("id, name").in("id", instructorIds)
    : { data: [] };
  const nameMap: Record<string, string> = {};
  for (const n of names || []) nameMap[n.id] = n.name;

  // status_history → 통합 형식 변환
  const statusLogs: UnifiedLog[] = (history || []).map((h) => ({
    id: `sh_${h.id}`,
    action_type: "상태변경",
    target_type: "instructor",
    target_name: nameMap[h.instructor_id] || "(삭제됨)",
    detail: `${h.from_status || "-"} → ${h.to_status}${h.reason ? ` (${h.reason})` : ""}`,
    performed_by: h.changed_by || "",
    created_at: h.created_at,
  }));

  // 2. activity_logs 조회
  const { data: activities, count: activityCount } = await sb
    .from("activity_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  const activityLogs: UnifiedLog[] = (activities || []).map((a) => ({
    id: `al_${a.id}`,
    action_type: a.action_type,
    target_type: a.target_type,
    target_name: a.target_name || "",
    detail: a.detail || "",
    performed_by: a.performed_by || "",
    created_at: a.created_at,
  }));

  // 3. 통합 정렬 + 페이지네이션
  const allLogs = [...statusLogs, ...activityLogs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = allLogs.length;
  const paged = allLogs.slice(offset, offset + limit);

  return NextResponse.json({ logs: paged, total });
}
