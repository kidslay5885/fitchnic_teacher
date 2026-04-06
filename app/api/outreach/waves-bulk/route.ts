import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// POST — 대량 ID를 body로 받아 URL 길이 제한 회피
export async function POST(req: Request) {
  const { ids } = await req.json();
  if (!ids || !Array.isArray(ids) || ids.length === 0) return NextResponse.json([]);

  const sb = getSupabase();

  // 100개씩 배치 후 병렬 처리
  const BATCH = 100;
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    batches.push(ids.slice(i, i + BATCH));
  }
  const results = await Promise.all(
    batches.map((chunk) =>
      sb.from("outreach_waves").select("*").in("instructor_id", chunk).order("wave_number", { ascending: true })
    )
  );
  const all: any[] = [];
  for (const { data, error } of results) {
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) all.push(...data);
  }

  return NextResponse.json(all);
}

// GET 하위호환 유지
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
