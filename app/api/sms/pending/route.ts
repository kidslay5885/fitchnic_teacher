import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 폰 게이트웨이가 폴링 → 발송 대기(예정시각 지난 pending) 목록 반환
// 가져간 항목은 즉시 'sending'으로 표시해 중복 발송 방지. 5분 이상 멈춘 'sending'은 재시도.
export async function GET(req: Request) {
  const sb = getSupabase();
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });

  const { data: device } = await sb
    .from("sms_device")
    .select("id, paired")
    .eq("token", token)
    .single();
  if (!device || !device.paired) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  await sb.from("sms_device").update({ last_seen: now.toISOString() }).eq("id", device.id);

  // 멈춘 'sending' 회수 (5분 경과) → 재시도
  const stale = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  await sb.from("sms_queue").update({ status: "pending" }).eq("status", "sending").lt("sent_at", stale);

  // 발송 대기 조회
  const { data: rows, error } = await sb
    .from("sms_queue")
    .select("id, phone, stage, body, images, instructor_name, attempts")
    .eq("status", "pending")
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const messages = rows || [];

  // 가져간 항목 → 'sending' 표시 (중복 방지) + 픽업 시각 기록
  if (messages.length > 0) {
    const ids = messages.map((m) => m.id);
    for (const m of messages) {
      await sb.from("sms_queue")
        .update({ status: "sending", sent_at: now.toISOString(), attempts: (m.attempts || 0) + 1 })
        .eq("id", m.id);
    }
    void ids;
  }

  return NextResponse.json({ messages: messages.map(({ attempts, ...m }) => m) });
}
