import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("outreach_waves")
    .select("*")
    .eq("instructor_id", id)
    .order("wave_number", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  const body = await req.json();

  // 빈 문자열은 null로 변환
  if (body.sent_date === "") body.sent_date = null;

  const { data, error } = await sb
    .from("outreach_waves")
    .upsert(
      { instructor_id: id, ...body },
      { onConflict: "instructor_id,wave_number" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // has_response 플래그 업데이트 (이 강사의 모든 wave 확인)
  const { data: allWaves } = await sb
    .from("outreach_waves")
    .select("result")
    .eq("instructor_id", id);
  const hasResponse = (allWaves || []).some((w) => w.result === "응답");
  await sb
    .from("instructors")
    .update({ has_response: hasResponse, updated_at: new Date().toISOString() })
    .eq("id", id);

  // 강사 이름 조회
  const { data: instInfo } = await sb.from("instructors").select("name, assignee").eq("id", id).single();

  await logActivity({
    actionType: "발송저장",
    targetType: "instructor",
    targetId: id,
    targetName: instInfo?.name || "",
    detail: `${body.wave_number}차 발송${body.result ? ` / 결과: ${body.result}` : ""}${body.sent_date ? ` / 날짜: ${body.sent_date}` : ""}`,
    performedBy: instInfo?.assignee || "",
  });

  // 발송 결과가 "거절"이면 강사 상태도 "거절"로 변경
  if (body.result === "거절") {
    const { data: inst } = await sb
      .from("instructors")
      .select("status, assignee")
      .eq("id", id)
      .single();

    if (inst && inst.status !== "거절") {
      await sb
        .from("status_history")
        .insert({
          instructor_id: id,
          from_status: inst.status,
          to_status: "거절",
          changed_by: inst.assignee || "",
          reason: `${body.wave_number}차 발송 거절`,
        });

      await sb
        .from("instructors")
        .update({ status: "거절", updated_at: new Date().toISOString() })
        .eq("id", id);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  const { wave_number } = await req.json();

  const { error } = await sb
    .from("outreach_waves")
    .delete()
    .eq("instructor_id", id)
    .eq("wave_number", wave_number);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: instDel } = await sb.from("instructors").select("name, assignee").eq("id", id).single();
  await logActivity({
    actionType: "발송삭제",
    targetType: "instructor",
    targetId: id,
    targetName: instDel?.name || "",
    detail: `${wave_number}차 발송 삭제`,
    performedBy: instDel?.assignee || "",
  });

  return NextResponse.json({ success: true });
}
