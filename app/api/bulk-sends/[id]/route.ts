import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/bulk-sends/[id] — 발송 기록 상세 (발송명·제목·문구 + 이메일별 결과)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = getSupabase();
  const { data: send, error } = await sb.from("bulk_sends").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const recipients: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error: rErr } = await sb
      .from("bulk_send_recipients")
      .select("*")
      .eq("bulk_send_id", id)
      .order("created_at")
      .order("email")
      .range(from, from + PAGE - 1);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    recipients.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return NextResponse.json({ send, recipients });
}
