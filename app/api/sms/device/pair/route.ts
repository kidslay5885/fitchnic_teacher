import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 폰: 페어링 코드 입력 → 검증 후 토큰 반환
export async function POST(req: Request) {
  const sb = getSupabase();
  const body = await req.json();
  const code = (body.code || "").toString().trim();
  const phoneNumber = (body.phone_number || "").toString().replace(/[^0-9]/g, "");
  if (!code) return NextResponse.json({ error: "코드를 입력하세요." }, { status: 400 });

  const { data: device } = await sb
    .from("sms_device")
    .select("id, token, paired")
    .eq("pairing_code", code)
    .maybeSingle();

  if (!device) return NextResponse.json({ error: "코드가 올바르지 않습니다." }, { status: 404 });

  await sb
    .from("sms_device")
    .update({ paired: true, phone_number: phoneNumber, last_seen: new Date().toISOString() })
    .eq("id", device.id);

  return NextResponse.json({ token: device.token });
}
