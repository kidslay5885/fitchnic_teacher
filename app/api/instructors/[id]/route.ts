import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { requiresReason } from "@/lib/status-machine";
import { logActivity } from "@/lib/activity-log";
import type { InstructorStatus } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("instructors")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  const body = await req.json();

  // 상태 전이 검증
  if (body.status) {
    const { data: current } = await sb
      .from("instructors")
      .select("status")
      .eq("id", id)
      .single();

    if (current && current.status !== body.status) {
      const from = current.status as InstructorStatus;
      const to = body.status as InstructorStatus;

      if (requiresReason(to) && !body.exclude_reason && !body._reason) {
        return NextResponse.json(
          { error: `'${to}' 전환 시 사유 입력이 필요합니다.` },
          { status: 400 }
        );
      }

      // 상태 이력 기록
      await sb.from("status_history").insert({
        instructor_id: id,
        from_status: from,
        to_status: to,
        changed_by: body._changed_by || "",
        reason: body._reason || body.exclude_reason || "",
      });
    }
  }

  // 내부 필드 제거
  const { _reason, _changed_by, _expected_updated_at, ...updateData } = body;

  // 충돌 감지: updated_at 비교
  if (_expected_updated_at) {
    const { data: current } = await sb
      .from("instructors")
      .select("updated_at")
      .eq("id", id)
      .single();

    if (current && current.updated_at !== _expected_updated_at) {
      return NextResponse.json(
        { error: "다른 사용자가 이미 수정했습니다. 새로고침 후 다시 시도하세요.", code: "CONFLICT" },
        { status: 409 }
      );
    }
  }

  const { data, error } = await sb
    .from("instructors")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // YT채널수집 역동기화: instructor 상태가 바뀌면 youtube_channels도 동기화
  if (body.status && data.source === "YT채널수집") {
    if (body.status === "미검토") {
      // 미검토로 되돌림 → instructor 삭제, youtube_channels 연결 해제
      await sb.from("youtube_channels").update({ status: "미검토", instructor_id: null }).eq("instructor_id", id);
      await sb.from("instructors").delete().eq("id", id);
      // 삭제된 instructor 반환 (status만 미검토로 변경해서)
      return NextResponse.json({ ...data, status: "미검토", _deleted: true });
    } else {
      await sb.from("youtube_channels").update({ status: body.status }).eq("instructor_id", id);
    }
  }

  // 활동 로그: 상태 변경
  if (body.status) {
    await logActivity({
      actionType: "상태변경",
      targetType: "instructor",
      targetId: id,
      targetName: data.name,
      detail: `${body._from_status || ""} → ${body.status}${body._reason || body.exclude_reason ? ` (사유: ${body._reason || body.exclude_reason})` : ""}`,
      performedBy: body._changed_by || "",
    });
  }

  // 활동 로그: 정보 수정 (상태 외 필드 변경)
  const infoFields = Object.keys(updateData).filter((k) => k !== "status" && k !== "exclude_reason" && k !== "updated_at");
  if (infoFields.length > 0 && !body.status) {
    await logActivity({
      actionType: "강사수정",
      targetType: "instructor",
      targetId: id,
      targetName: data.name,
      detail: `수정 항목: ${infoFields.join(", ")}`,
      performedBy: body._changed_by || "",
    });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();

  // 삭제 전 이름 조회
  const { data: inst } = await sb.from("instructors").select("name, assignee").eq("id", id).single();

  const { error } = await sb.from("instructors").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    actionType: "강사삭제",
    targetType: "instructor",
    targetId: id,
    targetName: inst?.name || "",
    performedBy: inst?.assignee || "",
  });

  return NextResponse.json({ success: true });
}
