import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { listGmailAccounts } from "@/lib/gmail";
import { classifyEmails, parseEmailList, type BulkSendInstructorLite } from "@/lib/bulk-send";

export const dynamic = "force-dynamic";

// GET /api/bulk-sends — 발송 기록 목록 (최신순, 결과별 건수 포함)
export async function GET() {
  const sb = getSupabase();
  const { data: sends, error } = await sb
    .from("bulk_sends")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!sends || sends.length === 0) return NextResponse.json([]);

  // 결과별 건수 집계 (1000건 단위 페이지 조회)
  const counts: Record<string, Record<string, number>> = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: rows, error: rErr } = await sb
      .from("bulk_send_recipients")
      .select("bulk_send_id, result")
      .range(from, from + PAGE - 1);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    for (const r of rows ?? []) {
      const c = (counts[r.bulk_send_id] ??= {});
      c[r.result] = (c[r.result] ?? 0) + 1;
    }
    if (!rows || rows.length < PAGE) break;
  }

  return NextResponse.json(sends.map((s) => ({ ...s, counts: counts[s.id] ?? {} })));
}

interface CreateBody {
  name: string;
  subject: string;
  body: string;
  senderAccountId: string;
  emails: string[];
  createdBy?: string;
}

// 강사 전체(분류에 필요한 컬럼만) 조회
async function fetchInstructorsLite(sb: ReturnType<typeof getSupabase>) {
  const all: BulkSendInstructorLite[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("instructors")
      .select("id, name, email, status, is_banned")
      .neq("email", "")
      .not("email", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const d of data ?? []) {
      all.push({ id: d.id, name: d.name ?? "", email: d.email ?? "", status: d.status ?? "", is_banned: !!d.is_banned });
    }
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// POST /api/bulk-sends — 발송 기록 생성 + 이메일 분류 저장
// 실제 메일 발송은 /api/bulk-sends/[id]/send 로 나눠서 진행 (시간 초과 방지)
export async function POST(req: Request) {
  const { name, subject, body, senderAccountId, emails, createdBy }: CreateBody = await req.json();

  if (!name?.trim()) return NextResponse.json({ error: "발송명을 입력하세요" }, { status: 400 });
  if (!subject?.trim()) return NextResponse.json({ error: "메일 제목을 입력하세요" }, { status: 400 });
  if (!body?.trim()) return NextResponse.json({ error: "문구를 입력하세요" }, { status: 400 });
  if (!Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: "이메일을 입력하세요" }, { status: 400 });
  }

  // 발송 계정 확인
  const accounts = await listGmailAccounts().catch(() => []);
  const account = accounts.find((a) => a.id === senderAccountId);
  if (!account) return NextResponse.json({ error: "발송 계정을 선택하세요" }, { status: 400 });
  if (!account.refresh_token) {
    return NextResponse.json(
      { error: `${account.email} 계정이 인증되지 않았습니다 — [재인증] 후 다시 시도하세요.`, needsAuth: { email: account.email } },
      { status: 400 },
    );
  }

  const sb = getSupabase();

  // 서버에서 다시 분류 (클라이언트 미리보기 이후 상태가 바뀌었을 수 있음)
  let instructors: BulkSendInstructorLite[];
  try {
    instructors = await fetchInstructorsLite(sb);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  const { emails: uniqueEmails } = parseEmailList(emails.join("\n"));
  const classified = classifyEmails(uniqueEmails, instructors);

  const { data: send, error: sErr } = await sb
    .from("bulk_sends")
    .insert({
      name: name.trim(),
      subject: subject.trim(),
      body,
      sender_account_id: account.id,
      sender_email: account.email,
      created_by: createdBy || "",
    })
    .select()
    .single();
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const rows = classified.map((c) => ({
    bulk_send_id: send.id,
    email: c.email,
    instructor_id: c.instructors[0]?.id ?? null,
    instructor_name: c.instructors.map((i) => i.name).join(", "),
    prev_status: c.instructors.map((i) => i.status).join(", "),
    result: c.result,
    reason: c.reason,
  }));
  const { data: recipients, error: rErr } = await sb.from("bulk_send_recipients").insert(rows).select();
  if (rErr) {
    await sb.from("bulk_sends").delete().eq("id", send.id);
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  return NextResponse.json({ send, recipients });
}
