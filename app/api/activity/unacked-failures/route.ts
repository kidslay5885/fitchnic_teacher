import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 미확인 자동 발송 실패 목록 + 카운트.
// 사이드바 빨간 점 / 활동 로그 페이지 상단 섹션에서 사용.
export async function GET() {
  const sb = getSupabase();
  const { data, error, count } = await sb
    .from("activity_logs")
    .select("id, action_type, target_type, target_id, target_name, detail, performed_by, created_at", { count: "exact" })
    .eq("action_type", "이메일발송실패")
    .is("acknowledged_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data || [], total: count ?? (data?.length || 0) });
}
