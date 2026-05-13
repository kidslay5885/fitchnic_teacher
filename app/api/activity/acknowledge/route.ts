import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 미확인 실패 로그를 확인 처리.
// body: { ids: string[] } 또는 { all: true } (현재 미확인 이메일발송실패 전부)
export async function POST(req: Request) {
  const sb = getSupabase();
  const body = await req.json().catch(() => ({}));
  const { ids, all, by } = body as { ids?: string[]; all?: boolean; by?: string };

  const ackAt = new Date().toISOString();
  const ackBy = (by || "").slice(0, 200);

  let q = sb.from("activity_logs").update({ acknowledged_at: ackAt, acknowledged_by: ackBy });

  if (all) {
    q = q.eq("action_type", "이메일발송실패").is("acknowledged_at", null);
  } else if (Array.isArray(ids) && ids.length > 0) {
    q = q.in("id", ids).is("acknowledged_at", null);
  } else {
    return NextResponse.json({ error: "ids 또는 all 필요" }, { status: 400 });
  }

  const { data, error } = await q.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: data?.length ?? 0 });
}
