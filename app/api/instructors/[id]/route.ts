import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { canTransition, requiresReason } from "@/lib/status-machine";
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

      if (!canTransition(from, to)) {
        return NextResponse.json(
          { error: `'${from}' → '${to}' 전환이 허용되지 않습니다.` },
          { status: 400 }
        );
      }

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
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  const { error } = await sb.from("instructors").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
