import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 폰 게이트웨이가 발송 결과 통보
export async function POST(req: Request) {
  const sb = getSupabase();
  const body = await req.json();
  const token = body.token || "";
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });

  const { data: device } = await sb
    .from("sms_device")
    .select("id, paired")
    .eq("token", token)
    .single();
  if (!device || !device.paired) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!body.id) return NextResponse.json({ error: "no id" }, { status: 400 });
  const status = body.status === "sent" ? "sent" : "failed";

  const { error } = await sb
    .from("sms_queue")
    .update({
      status,
      result: (body.result || "").toString().slice(0, 300),
      sent_at: new Date().toISOString(),
    })
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
