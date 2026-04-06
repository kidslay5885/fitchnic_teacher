import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

export async function GET() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const sb = getSupabase();
  const body = await req.json();

  const { data, error } = await sb
    .from("applications")
    .insert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity({
    actionType: "지원서등록",
    targetType: "application",
    targetId: data.id,
    targetName: data.applicant_name || "",
    detail: `플랫폼: ${data.source_platform || ""}`,
  });

  return NextResponse.json(data, { status: 201 });
}
