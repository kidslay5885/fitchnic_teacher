import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("instructors")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
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
