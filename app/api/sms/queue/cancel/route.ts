import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 웹: 예약/대기 항목 취소 (아직 발송 전인 pending만)
export async function POST(req: Request) {
  const sb = getSupabase();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });

  const { data: row } = await sb.from("sms_queue").select("status").eq("id", id).single();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status !== "pending") {
    return NextResponse.json({ error: "이미 발송 중이거나 완료되어 취소할 수 없습니다." }, { status: 400 });
  }

  const { error } = await sb.from("sms_queue").update({ status: "canceled" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
