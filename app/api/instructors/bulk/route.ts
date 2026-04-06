import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

// 일괄 상태 변경
export async function PATCH(req: Request) {
  const sb = getSupabase();
  const { ids, status, reason, changed_by } = await req.json();

  if (!ids?.length || !status) {
    return NextResponse.json({ error: "ids and status required" }, { status: 400 });
  }

  // 현재 상태 조회
  const { data: currents } = await sb
    .from("instructors")
    .select("id, status")
    .in("id", ids);

  // 상태 이력 일괄 삽입
  const historyRows = (currents ?? []).map((c) => ({
    instructor_id: c.id,
    from_status: c.status,
    to_status: status,
    changed_by: changed_by || "",
    reason: reason || "",
  }));

  if (historyRows.length) {
    await sb.from("status_history").insert(historyRows);
  }

  // 업데이트
  const update: Record<string, unknown> = { status };
  if (reason) update.exclude_reason = reason;

  const { error } = await sb
    .from("instructors")
    .update(update)
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 강사 이름 조회해서 활동 로그 기록
  const { data: names } = await sb.from("instructors").select("id, name").in("id", ids);
  const nameMap: Record<string, string> = {};
  for (const n of names || []) nameMap[n.id] = n.name;

  await logActivity({
    actionType: "일괄상태변경",
    targetType: "instructor",
    targetId: ids.join(","),
    targetName: (currents ?? []).map((c) => nameMap[c.id] || "").filter(Boolean).join(", "),
    detail: `→ ${status} (${ids.length}명)${reason ? ` 사유: ${reason}` : ""}`,
    performedBy: changed_by || "",
  });

  return NextResponse.json({ updated: ids.length });
}
