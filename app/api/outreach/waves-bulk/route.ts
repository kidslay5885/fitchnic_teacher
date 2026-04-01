import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids");
  if (!idsParam) return NextResponse.json([]);

  const ids = idsParam.split(",").filter(Boolean);
  if (ids.length === 0) return NextResponse.json([]);

  const sb = getSupabase();
  const { data, error } = await sb
    .from("outreach_waves")
    .select("*")
    .in("instructor_id", ids)
    .order("wave_number", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
