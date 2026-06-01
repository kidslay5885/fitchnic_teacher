import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 미확인(아직 검토 안 한) 지원서 카운트. 사이드바 "지원서" 뱃지에서 사용.
export async function GET() {
  const sb = getSupabase();
  const { count, error } = await sb
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("review_status", "미확인");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ total: count ?? 0 });
}
