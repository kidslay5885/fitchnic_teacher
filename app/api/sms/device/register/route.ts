import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 웹: 새 기기 등록 시작 → 페어링 코드 발급 (기존 기기는 교체)
export async function POST(req: Request) {
  const sb = getSupabase();
  let name = "";
  try { name = (await req.json())?.name || ""; } catch {}

  // 1대 모델: 기존 기기 모두 제거
  await sb.from("sms_device").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const token = globalThis.crypto.randomUUID().replace(/-/g, "");
  const pairingCode = String(Math.floor(100000 + Math.random() * 900000));

  const { data, error } = await sb
    .from("sms_device")
    .insert({ name, token, pairing_code: pairingCode, paired: false })
    .select("pairing_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pairing_code: data.pairing_code });
}
