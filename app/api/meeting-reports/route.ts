import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

// 보고서 생성
export async function POST(req: Request) {
  const sb = getSupabase();
  const body = await req.json();
  const { title, instructor_ids, fields } = body;

  const { data, error } = await sb
    .from("meeting_reports")
    .insert({ title: title || "", instructor_ids, fields })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    actionType: "보고서생성",
    targetType: "meeting_report",
    targetId: data.id,
    targetName: data.title || "",
    detail: `강사 ${(instructor_ids || []).length}명 포함`,
  });

  return NextResponse.json(data, { status: 201 });
}

// 보고서 목록
export async function GET() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("meeting_reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
