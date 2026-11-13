import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { renderTemplate, sendEmail, listGmailAccounts } from "@/lib/gmail";
import { classifyGmailError, sendDiscordAlert } from "@/lib/discord";
import { BULK_SEND_TO_IN_PROGRESS, buildEmailIndex, classifyEmail, type BulkSendInstructorLite } from "@/lib/bulk-send";
import type { InstructorStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 한 번 호출에 보낼 최대 건수 (초당 1건 → 약 20초)
const MAX_PER_CALL = 20;

type InstLite = BulkSendInstructorLite & { field: string; source: string; send_badges: string[] | null };

// POST /api/bulk-sends/[id]/send — '대기' 상태 수신자에게 실제 발송
// body: { recipientIds: string[], changedBy?: string }
// 발송 성공 시: 발송명 뱃지 추가, (진행 전 단계 강사만) 상태 → 진행 중, 상태 이력·활동 로그 기록
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { recipientIds, changedBy }: { recipientIds: string[]; changedBy?: string } = await req.json();
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    return NextResponse.json({ error: "recipientIds required" }, { status: 400 });
  }
  if (recipientIds.length > MAX_PER_CALL) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_PER_CALL}건까지 발송할 수 있습니다` }, { status: 400 });
  }

  const sb = getSupabase();
  const { data: send, error: sErr } = await sb.from("bulk_sends").select("*").eq("id", id).single();
  if (sErr || !send) return NextResponse.json({ error: "발송 기록을 찾을 수 없습니다" }, { status: 404 });

  const accounts = await listGmailAccounts().catch(() => []);
  const account = accounts.find((a) => a.id === send.sender_account_id);
  if (!account) return NextResponse.json({ error: "발송 계정을 찾을 수 없습니다" }, { status: 400 });
  if (!account.refresh_token) {
    return NextResponse.json({ error: `${account.email} 계정이 인증되지 않았습니다`, aborted: { kind: "token_expired", label: "인증 만료" } }, { status: 400 });
  }

  const { data: recipients, error: rErr } = await sb
    .from("bulk_send_recipients")
    .select("*")
    .eq("bulk_send_id", id)
    .in("id", recipientIds)
    .eq("result", "대기");
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const badge = String(send.name);
  const done: { id: string; email: string; result: string; reason: string }[] = [];
  let aborted: { kind: string; label: string; message: string } | null = null;

  for (const r of recipients ?? []) {
    const email = String(r.email);

    // 발송 직전 재분류 — 그 사이 상태 변경·연락 금지 지정이 있었을 수 있음
    // (ilike 의 '_' 와일드카드로 더 넓게 잡히는 건 classifyEmail 의 정확 매칭으로 걸러짐)
    const { data: found, error: fErr } = await sb
      .from("instructors")
      .select("id, name, email, status, is_banned, field, source, send_badges")
      .ilike("email", `%${email.replace(/%/g, "")}%`);
    if (fErr) {
      await sb.from("bulk_send_recipients").update({ result: "실패", reason: fErr.message }).eq("id", r.id);
      done.push({ id: r.id, email, result: "실패", reason: fErr.message });
      continue;
    }
    const list: InstLite[] = (found ?? []).map((d) => ({
      id: d.id, name: d.name ?? "", email: d.email ?? "", status: d.status ?? "", is_banned: !!d.is_banned,
      field: d.field ?? "", source: d.source ?? "", send_badges: d.send_badges ?? [],
    }));
    const c = classifyEmail(email, buildEmailIndex(list));
    const matched = c.instructors as InstLite[];

    if (c.result !== "대기") {
      await sb.from("bulk_send_recipients").update({
        result: c.result,
        reason: c.reason,
        instructor_id: matched[0]?.id ?? null,
        instructor_name: matched.map((i) => i.name).join(", "),
      }).eq("id", r.id);
      done.push({ id: r.id, email, result: c.result, reason: c.reason });
      continue;
    }

    const primary = matched[0];
    const subject = renderTemplate(String(send.subject), { name: primary.name, field: primary.field });
    const body = renderTemplate(String(send.body), { name: primary.name, field: primary.field });

    try {
      const toName = primary.name.trim() ? `${primary.name.trim()} 대표님` : undefined;
      await sendEmail({ to: email, subject, body, toName, senderAccount: account });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("bulk_send_recipients").update({ result: "실패", reason: msg.slice(0, 500) }).eq("id", r.id);
      done.push({ id: r.id, email, result: "실패", reason: msg });
      const classified = classifyGmailError(msg);
      if (classified.kind === "token_expired" || classified.kind === "quota" || classified.kind === "auth") {
        aborted = { kind: classified.kind, label: classified.label, message: msg };
        break;
      }
      continue;
    }

    const nowIso = new Date().toISOString();
    await sb.from("bulk_send_recipients").update({
      result: "발송",
      reason: "",
      sent_at: nowIso,
      instructor_id: primary.id,
      instructor_name: matched.map((i) => i.name).join(", "),
      prev_status: matched.map((i) => i.status).join(", "),
    }).eq("id", r.id);
    done.push({ id: r.id, email, result: "발송", reason: "" });

    // 강사 반영: 발송명 뱃지 추가 + 진행 전 단계면 상태 → 진행 중
    for (const inst of matched) {
      const badges = inst.send_badges ?? [];
      const nextBadges = badges.includes(badge) ? badges : [...badges, badge];
      const toInProgress = BULK_SEND_TO_IN_PROGRESS.includes(inst.status as InstructorStatus);
      await sb.from("instructors").update({
        ...(toInProgress ? { status: "진행 중" } : {}),
        send_badges: nextBadges,
        email_sent: true,
        updated_at: nowIso,
      }).eq("id", inst.id);

      if (toInProgress) {
        await sb.from("status_history").insert({
          instructor_id: inst.id,
          from_status: inst.status,
          to_status: "진행 중",
          changed_by: changedBy || "",
          reason: `발송 탭: ${badge}`,
        });
        // YT채널수집 강사는 youtube_channels 상태도 동기화
        if (inst.source === "YT채널수집") {
          await sb.from("youtube_channels").update({ status: "진행 중" }).eq("instructor_id", inst.id);
        }
      }

      await logActivity({
        actionType: "이메일발송",
        targetType: "instructor",
        targetId: inst.id,
        targetName: inst.name,
        detail: `발송 탭 [${badge}] → ${email} (${account.email})${toInProgress ? ` · ${inst.status} → 진행 중` : ` · 상태 유지(${inst.status})`}`,
        performedBy: changedBy || "",
      });
    }

    // Gmail rate limit 방지 (초당 1건)
    await new Promise((res) => setTimeout(res, 1000));
  }

  if (aborted) {
    await sendDiscordAlert({
      title: `발송 탭 발송 중단 — ${aborted.label}`,
      level: "error",
      description: `[${badge}] ${account.email} 발송이 중단되었습니다.`,
      fields: [{ name: "에러 메시지", value: `\`\`\`${aborted.message.slice(0, 900)}\`\`\`` }],
    });
  }

  return NextResponse.json({ done, aborted: aborted ? { kind: aborted.kind, label: aborted.label } : null });
}
