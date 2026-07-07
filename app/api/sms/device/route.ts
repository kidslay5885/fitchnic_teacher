import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 웹: 현재 등록 기기 상태 조회
export async function GET() {
  const sb = getSupabase();
  const { data } = await sb
    .from("sms_device")
    .select("id, name, paired, pairing_code, phone_number, last_seen, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ device: data || null });
}

// 웹: 기기 등록 해제 (전체 삭제 — 1대 모델)
export async function DELETE() {
  const sb = getSupabase();
  const { error } = await sb.from("sms_device").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
