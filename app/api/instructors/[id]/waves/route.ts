import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

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
  return NextResponse.json({ success: true });
}
