import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("outreach_waves")
    .select("*")
    .eq("instructor_id", id)
    .order("wave_number", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = getSupabase();
  const body = await req.json();

  const { data, error } = await sb
    .from("outreach_waves")
    .upsert(
      { instructor_id: id, ...body },
      { onConflict: "instructor_id,wave_number" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
