import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const sb = getSupabase();
  // Supabase 서버 기본 한도 1000건 → 페이지네이션으로 전체 조회
  const PAGE = 1000;
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("instructors")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
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

  return NextResponse.json(data, { status: 201 });
}
