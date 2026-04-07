import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const sb = getSupabase();
  const PAGE = 1000;

  const { data: firstData, error: firstError, count } = await sb
    .from("youtube_channels")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(0, PAGE - 1);

  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });
  if (!firstData) return NextResponse.json([]);

  const total = count ?? firstData.length;
  if (total <= PAGE) return NextResponse.json(firstData);

  const remainingPages: number[] = [];
  for (let from = PAGE; from < total; from += PAGE) {
    remainingPages.push(from);
  }
  const results = await Promise.all(
    remainingPages.map((from) =>
      sb.from("youtube_channels").select("*").order("created_at", { ascending: false }).range(from, from + PAGE - 1)
    )
  );
  const all: any[] = [...firstData];
  for (const { data, error } of results) {
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) all.push(...data);
  }
  return NextResponse.json(all);
}

// instructors 테이블에 존재하는 이메일 Set을 반환한다.
async function getInstructorEmails(sb: ReturnType<typeof getSupabase>, emails: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  // 50개씩 배치 조회
  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50);
    const { data } = await sb
      .from("instructors")
      .select("email")
      .in("email", batch);
    if (data) {
      for (const row of data) {
        if (row.email) existing.add(row.email);
      }
    }
  }
  return existing;
}

export async function POST(req: Request) {
  const sb = getSupabase();
  const body = await req.json();

  // 일괄 등록
  if (Array.isArray(body)) {
    const results = { created: 0, skipped: 0, duplicateInstructors: 0, errors: [] as string[] };

    // instructors 테이블 교차 중복 체크
    const emails = body.map((item: any) => item.email).filter(Boolean);
    const instructorEmails = await getInstructorEmails(sb, emails);

    for (const item of body) {
      if (!item.email || !item.channel_name) {
        results.skipped++;
        continue;
      }

      // instructors에 이미 있으면 건너뜀
      if (instructorEmails.has(item.email)) {
        results.duplicateInstructors++;
        results.skipped++;
        continue;
      }

      const { error } = await sb
        .from("youtube_channels")
        .upsert(
          {
            profile: item.profile || "",
            keyword: item.keyword || "",
            channel_name: item.channel_name,
            subscriber_count: item.subscriber_count || "",
            channel_url: item.channel_url || "",
            email: item.email,
            status: item.status || "미검토",
            memo: item.memo || "",
          },
          { onConflict: "email" }
        );

      if (error) {
        results.errors.push(`${item.email}: ${error.message}`);
        results.skipped++;
      } else {
        results.created++;
      }
    }

    return NextResponse.json(results, { status: 201 });
  }

  // 단건 등록
  if (!body.email || !body.channel_name) {
    return NextResponse.json({ error: "email, channel_name은 필수입니다." }, { status: 400 });
  }

  // instructors 교차 중복 체크
  const { data: existing } = await sb
    .from("instructors")
    .select("id, name")
    .eq("email", body.email)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { warning: "duplicate_instructor", instructor: existing[0] },
      { status: 200 }
    );
  }

  const { data, error } = await sb
    .from("youtube_channels")
    .upsert(
      {
        profile: body.profile || "",
        keyword: body.keyword || "",
        channel_name: body.channel_name,
        subscriber_count: body.subscriber_count || "",
        channel_url: body.channel_url || "",
        email: body.email,
        status: body.status || "미검토",
        memo: body.memo || "",
      },
      { onConflict: "email" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const sb = getSupabase();
  const body = await req.json();

  // 일괄 상태 변경: { ids: string[], status: string }
  if (body.ids && Array.isArray(body.ids)) {
    const update: Record<string, any> = {};
    if (body.status) update.status = body.status;
    if (body.memo !== undefined) update.memo = body.memo;

    const { error } = await sb
      .from("youtube_channels")
      .update(update)
      .in("id", body.ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: body.ids.length });
  }

  // 단건 수정: { id, ...fields }
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id는 필수입니다." }, { status: 400 });

  const { data, error } = await sb
    .from("youtube_channels")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const sb = getSupabase();
  const body = await req.json();

  const ids = Array.isArray(body.ids) ? body.ids : [body.id];
  if (!ids.length) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

  const { error } = await sb
    .from("youtube_channels")
    .delete()
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: ids.length });
}
