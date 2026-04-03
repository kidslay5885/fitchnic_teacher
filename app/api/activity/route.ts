import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const sb = getSupabase();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  // 상태 변경 이력
  const { data: history, count: historyCount } = await sb
    .from("status_history")
    .select("id, instructor_id, from_status, to_status, changed_by, reason, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // 강사 이름 매핑
  const instructorIds = [...new Set((history || []).map((h) => h.instructor_id))];
  const { data: names } = instructorIds.length > 0
    ? await sb.from("instructors").select("id, name").in("id", instructorIds)
    : { data: [] };
  const nameMap: Record<string, string> = {};
  for (const n of names || []) nameMap[n.id] = n.name;

  const logs = (history || []).map((h) => ({
    id: h.id,
    instructor_name: nameMap[h.instructor_id] || "(삭제됨)",
    from_status: h.from_status,
    to_status: h.to_status,
    changed_by: h.changed_by || "",
    reason: h.reason || "",
    created_at: h.created_at,
  }));

  return NextResponse.json({ logs, total: historyCount ?? 0 });
}
