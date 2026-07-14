import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { normalizeUrl } from "@/lib/utils";

// 여러 강사 일괄 등록 (크롤링 채널 붙여넣기 등)
export async function POST(req: Request) {
  const sb = getSupabase();
  const { instructors, performedBy } = await req.json();

  if (!Array.isArray(instructors) || instructors.length === 0) {
    return NextResponse.json({ error: "instructors 배열이 필요합니다." }, { status: 400 });
  }

  // 삽입 데이터 정규화 (유튜브 URL 프로토콜 보정)
  const rows = instructors.map((it: any) => ({
    ...it,
    youtube: normalizeUrl(it.youtube),
    status: it.status || "미검토",
  }));

  const { data, error } = await sb.from("instructors").insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 초기 상태 이력 일괄 기록
  const historyRows = (data ?? []).map((d: any) => ({
    instructor_id: d.id,
    from_status: "",
    to_status: d.status || "미검토",
    changed_by: performedBy || d.assignee || "",
    reason: "신규 등록(일괄)",
  }));
  if (historyRows.length) await sb.from("status_history").insert(historyRows);

  await logActivity({
    actionType: "강사일괄등록",
    targetType: "instructor",
    targetId: (data ?? []).map((d: any) => d.id).join(","),
    targetName: (data ?? []).map((d: any) => d.name).join(", "),
    detail: `${(data ?? []).length}명 등록`,
    performedBy: performedBy || "",
  });

  return NextResponse.json(data ?? [], { status: 201 });
}

// 일괄 상태 변경
export async function PATCH(req: Request) {
  const sb = getSupabase();
  const { ids, status, reason, changed_by } = await req.json();

  if (!ids?.length || !status) {
    return NextResponse.json({ error: "ids and status required" }, { status: 400 });
  }

  // 현재 상태 + 출처 조회 (YT채널수집 역동기화용)
  const { data: currents } = await sb
    .from("instructors")
    .select("id, status, source")
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
  if (reason) update.reason = reason;

  const { error } = await sb
    .from("instructors")
    .update(update)
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // YT채널수집 역동기화: 원본 youtube_channels도 같이 업데이트
  const ytIds = (currents ?? []).filter((c) => c.source === "YT채널수집").map((c) => c.id);
  if (ytIds.length > 0) {
    if (status === "미검토") {
      // 미검토로 되돌림 → youtube_channels 연결 해제 + instructor 삭제
      await sb.from("youtube_channels").update({ status: "미검토", instructor_id: null }).in("instructor_id", ytIds);
      await sb.from("instructors").delete().in("id", ytIds);
    } else {
      await sb.from("youtube_channels").update({ status }).in("instructor_id", ytIds);
    }
  }

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
