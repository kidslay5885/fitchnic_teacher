import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

export async function GET() {
  const sb = getSupabase();
  const PAGE = 1000;

  // 첫 요청에서 전체 카운트 + 첫 페이지 동시 조회
  const { data: firstData, error: firstError, count } = await sb
    .from("instructors")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(0, PAGE - 1);

  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });
  if (!firstData) return NextResponse.json([]);

  const total = count ?? firstData.length;
  if (total <= PAGE) return NextResponse.json(firstData);

  // 나머지 페이지 병렬 조회
  const remainingPages: number[] = [];
  for (let from = PAGE; from < total; from += PAGE) {
    remainingPages.push(from);
  }
  const results = await Promise.all(
    remainingPages.map((from) =>
      sb.from("instructors").select("*").order("created_at", { ascending: false }).range(from, from + PAGE - 1)
    )
  );
  const all: any[] = [...firstData];
  for (const { data, error } of results) {
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) all.push(...data);
  }
  return NextResponse.json(all);
}

export async function POST(req: Request) {
  const sb = getSupabase();
  const body = await req.json();
  const { _force, ...insertData } = body;

  // 중복 이름 체크
  if (insertData.name && !_force) {
    const { data: duplicates } = await sb
      .from("instructors")
      .select("id, name, field, assignee, status")
      .eq("name", insertData.name.trim());

    if (duplicates && duplicates.length > 0) {
      return NextResponse.json(
        { warning: "duplicate_name", duplicates },
        { status: 200 }
      );
    }
  }

  const { data, error } = await sb
    .from("instructors")
    .insert(insertData)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 초기 상태 이력
  await sb.from("status_history").insert({
    instructor_id: data.id,
    from_status: "",
    to_status: data.status || "미검토",
    changed_by: insertData.assignee || "",
    reason: "신규 등록",
  });

  await logActivity({
    actionType: "강사등록",
    targetType: "instructor",
    targetId: data.id,
    targetName: data.name,
    detail: `상태: ${data.status || "미검토"}`,
    performedBy: insertData.assignee || "",
  });

  return NextResponse.json(data, { status: 201 });
}
