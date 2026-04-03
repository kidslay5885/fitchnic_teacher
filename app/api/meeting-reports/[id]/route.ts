import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 보고서 조회
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();

  // 보고서 메타 조회
  const { data: report, error } = await sb
    .from("meeting_reports")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !report) return NextResponse.json({ error: "보고서를 찾을 수 없습니다." }, { status: 404 });

  // 선택된 강사 정보 조회
  const ids = report.instructor_ids as string[];
  if (ids.length === 0) return NextResponse.json({ report, instructors: [] });

  const { data: instructors } = await sb
    .from("instructors")
    .select("*")
    .in("id", ids);

  return NextResponse.json({ report, instructors: instructors ?? [] });
}

// 보고서 삭제
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  const { error } = await sb.from("meeting_reports").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
