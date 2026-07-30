import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { normalizeName } from "@/lib/instructor-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 시간표 일정 목록 (기본: 오늘 기준 한 달 전 이후) */
export async function GET(req: Request) {
  const sb = getSupabase();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");

  let q = sb.from("timetable_events").select("*").order("event_date").order("event_time");
  if (from) q = q.gte("event_date", from);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * 일정 수정 — 수동 매칭 / 리마인드 완료 체크
 * body: { id, instructor_id?: string|null, match_type?: string, remind_done?: boolean }
 *
 * 수동 매칭은 표기명 기준으로 timetable_name_map 에도 기록해서
 * 시간표 셀이 이동하거나 같은 강사가 다시 등장해도 매칭이 유지되게 한다.
 */
export async function PATCH(req: Request) {
  const sb = getSupabase();
  const body = await req.json();
  const { id, instructor_id, match_type, remind_done } = body ?? {};

  if (!id) return NextResponse.json({ error: "id 누락" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (remind_done !== undefined) patch.remind_done = !!remind_done;
  if (instructor_id !== undefined) {
    patch.instructor_id = instructor_id || null;
    patch.match_type = match_type || (instructor_id ? "수동" : "해당없음");
    patch.match_reason = "";
  } else if (match_type !== undefined) {
    patch.match_type = match_type;
  }

  const { data, error } = await sb
    .from("timetable_events")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 같은 표기명의 다른 일정에도 매칭을 전파
  if (instructor_id !== undefined && data?.display_name) {
    const norm = normalizeName(data.display_name);
    if (norm) {
      await sb.from("timetable_name_map").upsert({
        norm_name: norm,
        display_name: data.display_name,
        instructor_id: instructor_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "norm_name" });

      const { data: siblings } = await sb
        .from("timetable_events")
        .select("id, display_name")
        .neq("id", id);
      const ids = (siblings ?? [])
        .filter((s) => normalizeName(s.display_name || "") === norm)
        .map((s) => s.id);
      if (ids.length > 0) {
        await sb
          .from("timetable_events")
          .update({
            instructor_id: instructor_id || null,
            match_type: instructor_id ? "수동" : "해당없음",
            match_reason: "",
          })
          .in("id", ids);
      }
    }
  }

  return NextResponse.json(data);
}
