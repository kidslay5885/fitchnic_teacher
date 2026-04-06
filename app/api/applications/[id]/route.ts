import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  const body = await req.json();

  const { data, error } = await sb
    .from("applications")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const changedFields = Object.keys(body).filter((k) => !k.startsWith("_"));
  await logActivity({
    actionType: "지원서수정",
    targetType: "application",
    targetId: id,
    targetName: data.applicant_name || "",
    detail: `수정 항목: ${changedFields.join(", ")}`,
  });

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();

  // 삭제 전 정보 조회
  const { data: app } = await sb.from("applications").select("applicant_name").eq("id", id).single();

  const { error } = await sb
    .from("applications")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    actionType: "지원서삭제",
    targetType: "application",
    targetId: id,
    targetName: app?.applicant_name || "",
  });

  return NextResponse.json({ ok: true });
}
