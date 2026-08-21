import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 리마인드 체크리스트 상태 전체 조회 */
export async function GET() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("remind_checklists")
    .select("ref_type, ref_id, tag, checked_items");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * 체크 상태 저장 (리마인드 1건 = ref_type + ref_id + tag 한 줄)
 * body: { ref_type: 'event'|'instructor', ref_id, tag, checked_items: string[] }
 */
export async function PUT(req: Request) {
  const sb = getSupabase();
  const { ref_type, ref_id, tag, checked_items } = (await req.json()) ?? {};

  if (!ref_type || !ref_id || !tag) {
    return NextResponse.json({ error: "ref_type/ref_id/tag 누락" }, { status: 400 });
  }
  if (!Array.isArray(checked_items)) {
    return NextResponse.json({ error: "checked_items 형식 오류" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("remind_checklists")
    .upsert(
      {
        ref_type,
        ref_id,
        tag,
        checked_items: checked_items.map(String),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ref_type,ref_id,tag" },
    )
    .select("ref_type, ref_id, tag, checked_items")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
