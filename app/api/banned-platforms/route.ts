import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

export async function GET() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("banned_platforms")
    .select("*")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const sb = getSupabase();
  const { name } = await req.json();

  const { data, error } = await sb
    .from("banned_platforms")
    .insert({ name })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    actionType: "금지플랫폼추가",
    targetType: "banned_platform",
    targetId: data.id,
    targetName: name,
  });

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request) {
  const sb = getSupabase();
  const { id } = await req.json();

  // 삭제 전 이름 조회
  const { data: bp } = await sb.from("banned_platforms").select("name").eq("id", id).single();

  const { error } = await sb.from("banned_platforms").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    actionType: "금지플랫폼삭제",
    targetType: "banned_platform",
    targetId: id,
    targetName: bp?.name || "",
  });

  return NextResponse.json({ success: true });
}
