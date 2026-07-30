import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchTimetableEvents } from "@/lib/timetable";
import { normalizeName } from "@/lib/instructor-match";
import { matchEvents } from "@/lib/timetable-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LAST_SYNC_KEY = "timetable_last_sync";

/** 마지막 동기화 시각 조회 — 탭 진입 시 자동 동기화 여부 판단에 사용 */
export async function GET() {
  const sb = getSupabase();
  const { data } = await sb
    .from("app_secrets")
    .select("value, updated_at")
    .eq("key", LAST_SYNC_KEY)
    .maybeSingle();

  return NextResponse.json({ last_sync: data?.value ?? null });
}

/** 시간표 동기화: 드라이브 xlsx 파싱 → 강사 자동 매칭 → upsert */
export async function POST() {
  const sb = getSupabase();

  let events, outsideGrid;
  try {
    ({ events, outsideGrid } = await fetchTimetableEvents());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `시간표 읽기 실패: ${message}` }, { status: 502 });
  }

  // 강사 전체 명단 (4천여 명이라 1000건씩 나눠서 조회)
  // meeting_date 도 같이 받아서 시간표 일정과 대조한다 (이름이 달라도 같은 미팅이면 동일인)
  const instructors: { id: string; name: string; meeting_date: string | null }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from("instructors")
      .select("id,name,meeting_date")
      .range(offset, offset + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    instructors.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const autoMatches = matchEvents(events, instructors);

  // 수동 매칭 기록 (표기명 → 강사). 자동 매칭보다 우선한다.
  const { data: mapRows } = await sb
    .from("timetable_name_map")
    .select("norm_name, instructor_id");
  const manual = new Map((mapRows ?? []).map((r) => [r.norm_name, r.instructor_id as string | null]));

  const validIds = new Set(instructors.map((i) => i.id));
  const rows = events.map((ev, idx) => {
    const norm = normalizeName(ev.display_name);
    let instructor_id: string | null = null;
    let match_type = "미매칭";
    let match_reason = "";

    if (manual.has(norm)) {
      instructor_id = manual.get(norm) ?? null;
      // 매핑에 있으나 강사를 지정하지 않은 것은 '강사 아님'으로 표시한 항목
      match_type = instructor_id ? "수동" : "해당없음";
    } else if (autoMatches[idx].instructorId) {
      instructor_id = autoMatches[idx].instructorId;
      match_type = "자동";
      match_reason = autoMatches[idx].reason;
    }
    // 강사가 삭제된 경우 대비
    if (instructor_id && !validIds.has(instructor_id)) {
      instructor_id = null;
      match_type = "미매칭";
    }

    return {
      source_key: ev.source_key,
      sheet: ev.sheet,
      cell: ev.cell,
      event_date: ev.event_date,
      event_time: ev.event_time,
      event_type: ev.event_type,
      meeting_mode: ev.meeting_mode,
      protocol: ev.protocol,
      display_name: ev.display_name,
      raw_text: ev.raw_text,
      instructor_id,
      match_type,
      match_reason,
      synced_at: new Date().toISOString(),
      // remind_done 은 일부러 넣지 않는다 — 넣으면 기존 체크가 초기화된다
    };
  });

  if (rows.length > 0) {
    const { error } = await sb
      .from("timetable_events")
      .upsert(rows, { onConflict: "source_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 이번에 읽은 시트에서 사라진 일정 정리 (셀이 지워졌거나 미팅이 취소된 경우)
  const sheets = [...new Set(events.map((e) => e.sheet))];
  let removed = 0;
  if (sheets.length > 0) {
    const keys = new Set(rows.map((r) => r.source_key));
    const { data: existing } = await sb
      .from("timetable_events")
      .select("id, source_key")
      .in("sheet", sheets);
    const staleIds = (existing ?? []).filter((r) => !keys.has(r.source_key)).map((r) => r.id);
    if (staleIds.length > 0) {
      await sb.from("timetable_events").delete().in("id", staleIds);
      removed = staleIds.length;
    }
  }

  const last_sync = new Date().toISOString();
  await sb
    .from("app_secrets")
    .upsert({ key: LAST_SYNC_KEY, value: last_sync, updated_at: last_sync }, { onConflict: "key" });

  return NextResponse.json({
    synced: rows.length,
    matched: rows.filter((r) => r.instructor_id).length,
    unmatched: rows.filter((r) => r.match_type === "미매칭").length,
    // 자동매칭 근거별 집계 (이름만 / 일정+이름 / 일정만)
    by_reason: {
      이름: rows.filter((r) => r.match_reason === "이름").length,
      "일정+이름": rows.filter((r) => r.match_reason === "일정+이름").length,
      일정: rows.filter((r) => r.match_reason === "일정").length,
    },
    removed,
    // 주간 표 바깥에 적혀 있어 날짜를 확정할 수 없던 강사미팅 (시트 확인 필요)
    outside_grid: outsideGrid,
    last_sync,
  });
}
