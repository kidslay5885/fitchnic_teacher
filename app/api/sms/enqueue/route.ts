import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 웹에서 발송/예약 등록 → 큐에 저장
export async function POST(req: Request) {
  const sb = getSupabase();
  const body = await req.json();

  const phone = (body.phone || "").replace(/[^0-9]/g, "");
  if (!phone) {
    return NextResponse.json({ error: "받는 번호가 없습니다." }, { status: 400 });
  }
  if (!body.body) {
    return NextResponse.json({ error: "메시지 본문이 없습니다." }, { status: 400 });
  }

  const row = {
    instructor_id: body.instructor_id || null,
    instructor_name: body.instructor_name || "",
    phone,
    stage: body.stage || "",
    body: body.body,
    images: body.images || "",
    scheduled_at: body.scheduled_at || new Date().toISOString(),
    status: "pending",
  };

  const { data, error } = await sb.from("sms_queue").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
