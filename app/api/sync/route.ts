import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 경량 동기화 체크: count + 최신 updated_at만 반환
export async function GET() {
  const sb = getSupabase();
  const { count } = await sb
    .from("instructors")
    .select("*", { count: "exact", head: true });

  const { data: latest } = await sb
    .from("instructors")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    count: count ?? 0,
    latest_updated_at: latest?.updated_at ?? null,
  });
}
