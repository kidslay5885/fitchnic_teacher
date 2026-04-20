import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { renderTemplate, sendEmail } from "@/lib/gmail";
import { classifyGmailError, sendDiscordAlert } from "@/lib/discord";

interface SendBody {
  instructorIds: string[];
  waveNumber: 1 | 2 | 3;
  changedBy?: string;
}

// POST /api/outreach/send-email
// 선택한 강사들에게 지정한 차수의 이메일 템플릿을 자동 발송
export async function POST(req: Request) {
  const { instructorIds, waveNumber, changedBy }: SendBody = await req.json();

  if (!Array.isArray(instructorIds) || instructorIds.length === 0) {
    return NextResponse.json({ error: "instructorIds required" }, { status: 400 });
  }
  if (![1, 2, 3].includes(waveNumber)) {
    return NextResponse.json({ error: "waveNumber must be 1|2|3" }, { status: 400 });
  }

  const sb = getSupabase();

  // 1. 템플릿 조회
  const { data: templates, error: tErr } = await sb
    .from("message_templates")
    .select("*")
    .eq("channel", "이메일")
    .eq("variant_label", `${waveNumber}차`)
    .limit(1);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  const template = templates?.[0];
  if (!template) {
    return NextResponse.json(
      { error: `${waveNumber}차 이메일 템플릿이 없습니다. 메시지 탭에서 먼저 등록하세요.` },
      { status: 400 },
    );
  }

  // 2. 강사 조회
  const { data: instructors, error: iErr } = await sb
    .from("instructors")
    .select("id, name, field, email, status, assignee")
    .in("id", instructorIds);
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  // 3. 기존 해당 차수 발송 기록 조회
  const { data: existingWaves } = await sb
    .from("outreach_waves")
    .select("instructor_id")
    .in("instructor_id", instructorIds)
    .eq("wave_number", waveNumber);
  const alreadySent = new Set((existingWaves ?? []).map((w) => w.instructor_id));

  // 3-1. 1차 발송 방식이 DM인 강사는 2·3차 자동 발송 스킵 대상
  let dmLocked = new Set<string>();
  if (waveNumber >= 2) {
    const { data: firstWaves } = await sb
      .from("outreach_waves")
      .select("instructor_id, send_method")
      .in("instructor_id", instructorIds)
      .eq("wave_number", 1)
      .eq("send_method", "DM");
    dmLocked = new Set((firstWaves ?? []).map((w) => w.instructor_id));
  }

  const sent: { id: string; name: string }[] = [];
  const skipped: { id: string; name: string; reason: string }[] = [];
  const failed: { id: string; name: string; error: string }[] = [];
  let abortedReason: { kind: string; label: string; message: string } | null = null;

  const today = new Date().toISOString().split("T")[0];

  for (const inst of instructors ?? []) {
    // 스킵 조건
    if (!inst.email || !inst.email.trim()) {
      skipped.push({ id: inst.id, name: inst.name, reason: "이메일 없음" });
      continue;
    }
    if (alreadySent.has(inst.id)) {
      skipped.push({ id: inst.id, name: inst.name, reason: `이미 ${waveNumber}차 발송됨` });
      continue;
    }
    if (dmLocked.has(inst.id)) {
      skipped.push({ id: inst.id, name: inst.name, reason: "1차 DM 발송 — 이메일 발송 불가" });
      continue;
    }

    // 템플릿 치환
    const subject = renderTemplate(template.subject || "", { name: inst.name, field: inst.field });
    const body = renderTemplate(template.body || "", { name: inst.name, field: inst.field });

    try {
      // Gmail API 발송
      await sendEmail({ to: inst.email.trim(), subject, body });

      // outreach_waves 기록
      await sb
        .from("outreach_waves")
        .upsert(
          {
            instructor_id: inst.id,
            wave_number: waveNumber,
            sent_date: today,
            result: "",
            send_method: "이메일",
          },
          { onConflict: "instructor_id,wave_number" },
        );

      // instructors 업데이트 (email_sent, 상태 전이)
      const updates: Record<string, unknown> = {
        email_sent: true,
        updated_at: new Date().toISOString(),
      };
      const shouldTransitionToInProgress = inst.status === "발송 예정";
      if (shouldTransitionToInProgress) {
        updates.status = "진행 중";
      }
      await sb.from("instructors").update(updates).eq("id", inst.id);

      // status_history
      if (shouldTransitionToInProgress) {
        await sb.from("status_history").insert({
          instructor_id: inst.id,
          from_status: inst.status,
          to_status: "진행 중",
          changed_by: changedBy || inst.assignee || "",
          reason: `${waveNumber}차 이메일 자동 발송`,
        });
      }

      // activity log
      await logActivity({
        actionType: "이메일발송",
        targetType: "instructor",
        targetId: inst.id,
        targetName: inst.name,
        detail: `${waveNumber}차 자동발송 → ${inst.email}`,
        performedBy: changedBy || inst.assignee || "",
      });

      sent.push({ id: inst.id, name: inst.name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ id: inst.id, name: inst.name, error: msg });

      // 치명적 오류(토큰 만료/한도 초과)는 즉시 중단 — 나머지 강사도 모두 실패할 것이므로
      const classified = classifyGmailError(msg);
      if (classified.kind === "token_expired" || classified.kind === "quota" || classified.kind === "auth") {
        abortedReason = { kind: classified.kind, label: classified.label, message: msg };
        break;
      }
    }

    // Gmail rate limit 방지 (초당 1건)
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Discord 알림 — 치명적 중단이거나 개별 실패가 있는 경우
  if (abortedReason) {
    await sendDiscordAlert({
      title: `메일 발송 중단 — ${abortedReason.label}`,
      level: "error",
      description:
        abortedReason.kind === "token_expired"
          ? "OAuth refresh_token이 만료 또는 폐기되었습니다. `node scripts/gmail-auth.mjs` 를 다시 실행해 토큰을 재발급하세요."
          : abortedReason.kind === "quota"
          ? "Gmail 일일 발송 한도를 초과했습니다. 24시간 후 자동 복구됩니다."
          : "Gmail API 인증/권한 문제로 발송이 중단되었습니다.",
      fields: [
        { name: "차수", value: `${waveNumber}차`, inline: true },
        { name: "성공", value: `${sent.length}건`, inline: true },
        { name: "실패", value: `${failed.length}건`, inline: true },
        { name: "대기 중이던 건수", value: `${instructorIds.length - sent.length - skipped.length - failed.length}건`, inline: true },
        { name: "에러 메시지", value: `\`\`\`${abortedReason.message.slice(0, 900)}\`\`\`` },
      ],
    });
  } else if (failed.length > 0) {
    // 개별 실패를 유형별로 집계
    const byKind: Record<string, { count: number; samples: string[] }> = {};
    for (const f of failed) {
      const { label } = classifyGmailError(f.error);
      if (!byKind[label]) byKind[label] = { count: 0, samples: [] };
      byKind[label].count++;
      if (byKind[label].samples.length < 3) {
        byKind[label].samples.push(`• ${f.name}: ${f.error.slice(0, 120)}`);
      }
    }
    await sendDiscordAlert({
      title: `메일 발송 일부 실패 (${waveNumber}차)`,
      level: "warn",
      description: `성공 ${sent.length} / 실패 ${failed.length} / 스킵 ${skipped.length}`,
      fields: Object.entries(byKind).map(([label, { count, samples }]) => ({
        name: `${label} (${count}건)`,
        value: samples.join("\n").slice(0, 1000),
      })),
    });
  }

  // 요약 로그
  await logActivity({
    actionType: "이메일일괄발송",
    targetType: "instructor",
    targetId: instructorIds.join(","),
    targetName: sent.map((s) => s.name).join(", "),
    detail: `${waveNumber}차 · 성공 ${sent.length} / 스킵 ${skipped.length} / 실패 ${failed.length}`,
    performedBy: changedBy || "",
  });

  return NextResponse.json({
    sent,
    skipped,
    failed,
    aborted: abortedReason
      ? { kind: abortedReason.kind, label: abortedReason.label }
      : null,
  });
}
