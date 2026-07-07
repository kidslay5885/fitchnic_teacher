import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 웹: 특정 강사(또는 전체)의 발송/예약 내역 조회
export async function GET(req: Request) {
  const sb = getSupabase();
  const instructorId = new URL(req.url).searchParams.get("instructor_id");

  let q = sb
    .from("sms_queue")
    .select("id, instructor_id, instructor_name, phone, stage, images, scheduled_at, status, result, created_at, sent_at")
    .order("created_at", { ascending: false })
    .limit(instructorId ? 30 : 100);

  if (instructorId) q = q.eq("instructor_id", instructorId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}
