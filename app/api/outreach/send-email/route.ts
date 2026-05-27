import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { renderTemplate, sendEmail, listGmailAccounts, type GmailAccount } from "@/lib/gmail";
import { classifyGmailError, sendDiscordAlert } from "@/lib/discord";

interface SendBody {
  instructorIds: string[];
  waveNumber: 1 | 2 | 3;
  changedBy?: string;
  senderAccountId?: string;
  // 1명 발송 시 모달에서 직접 수정한 최종 제목·본문 (변수 치환 완료된 값)
  overrideSubject?: string;
  overrideBody?: string;
}

// POST /api/outreach/send-email
// 선택한 강사들에게 지정한 차수의 이메일 템플릿을 자동 발송
export async function POST(req: Request) {
  const { instructorIds, waveNumber, changedBy, senderAccountId, overrideSubject, overrideBody }: SendBody =
    await req.json();

  if (!Array.isArray(instructorIds) || instructorIds.length === 0) {
    return NextResponse.json({ error: "instructorIds required" }, { status: 400 });
  }
  if (![1, 2, 3].includes(waveNumber)) {
    return NextResponse.json({ error: "waveNumber must be 1|2|3" }, { status: 400 });
  }

  // 직접 수정값은 발송 대상이 정확히 1명일 때만 신뢰 (여러 명이면 개인화가 깨지므로 무시)
  const useOverride =
    instructorIds.length === 1 &&
    (typeof overrideSubject === "string" || typeof overrideBody === "string");

  const sb = getSupabase();

  // 0. 발송 계정 결정 (미지정 시 is_default)
  let senderAccount: GmailAccount;
  try {
    const accounts = await listGmailAccounts();
    const picked = senderAccountId
      ? accounts.find((a) => a.id === senderAccountId)
      : accounts.find((a) => a.is_default);
    if (!picked) {
      return NextResponse.json(
        { error: senderAccountId ? "선택한 발송 계정을 찾을 수 없습니다" : "기본 발송 계정이 설정되어 있지 않습니다" },
        { status: 400 },
      );
    }
    if (!picked.refresh_token) {
      return NextResponse.json(
        {
          error: `${picked.email} 계정이 인증되지 않았습니다 — 발송 모달의 [재인증] 버튼으로 로그인하세요.`,
          needsAuth: { accountId: picked.id, email: picked.email },
        },
        { status: 400 },
      );
    }
    // 자동 발송(크론) 전용 계정이 아닌 계정은 1차만 발송 가능
    if (!picked.is_cron_sender && waveNumber !== 1) {
      return NextResponse.json(
        {
          error: `${picked.email} 계정으로는 1차 발송만 가능합니다. 2·3차는 자동 발송 계정으로만 발송하세요.`,
        },
        { status: 400 },
      );
    }
    senderAccount = picked;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  // 1. 템플릿 조회 — 발송 계정 전용 템플릿 우선, 없으면 공용(sender_account_id IS NULL) fallback
  const { data: templates, error: tErr } = await sb
    .from("message_templates")
    .select("*")
    .eq("channel", "이메일")
    .eq("variant_label", `${waveNumber}차`)
    .or(`sender_account_id.eq.${senderAccount.id},sender_account_id.is.null`);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  const template =
    templates?.find((t) => t.sender_account_id === senderAccount.id) ??
    templates?.find((t) => t.sender_account_id === null) ??
    null;
  if (!template) {
    return NextResponse.json(
      {
        error: `${waveNumber}차 이메일 템플릿이 없습니다 (계정: ${senderAccount.email}). 메시지 탭에서 먼저 등록하세요.`,
      },
      { status: 400 },
    );
  }

  // 2. 강사 조회
  const { data: instructors, error: iErr } = await sb
    .from("instructors")
    .select("id, name, field, email, status, assignee, send_method")
    .in("id", instructorIds);
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  // 3. 기존 해당 차수 발송 기록 조회
  const { data: existingWaves } = await sb
    .from("outreach_waves")
    .select("instructor_id")
    .in("instructor_id", instructorIds)
    .eq("wave_number", waveNumber);
  const alreadySent = new Set((existingWaves ?? []).map((w) => w.instructor_id));

  // 3-1. 발송 수단이 "이메일"이 아닌 강사는 이메일 발송 스킵 (DM, 기타 임의 값 모두)
  const methodLocked = new Map<string, string>(
    (instructors ?? [])
      .filter((i) => !!i.send_method && i.send_method !== "이메일")
      .map((i) => [i.id, i.send_method as string]),
  );

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
    const lockedMethod = methodLocked.get(inst.id);
    if (lockedMethod) {
      skipped.push({ id: inst.id, name: inst.name, reason: `발송 수단 ${lockedMethod} — 이메일 발송 불가` });
      continue;
    }

    // 템플릿 치환 (1명 발송 + 직접 수정 시에는 수정값을 그대로 사용)
    const subject = useOverride && typeof overrideSubject === "string"
      ? overrideSubject
      : renderTemplate(template.subject || "", { name: inst.name, field: inst.field });
    const body = useOverride && typeof overrideBody === "string"
      ? overrideBody
      : renderTemplate(template.body || "", { name: inst.name, field: inst.field });

    try {
      // Gmail API 발송 — 수신자에게 "강사명 대표님"으로 표시
      const toName = inst.name?.trim() ? `${inst.name.trim()} 대표님` : undefined;
      await sendEmail({ to: inst.email.trim(), subject, body, toName, senderAccount });

      // outreach_waves 기록 — 어떤 계정에서 보냈는지 sender_account_id 에 기록
      await sb
        .from("outreach_waves")
        .upsert(
          {
            instructor_id: inst.id,
            wave_number: waveNumber,
            sent_date: today,
            result: "체크필요",
            sender_account_id: senderAccount.id,
          },
          { onConflict: "instructor_id,wave_number" },
        );

      // 2·3차 발송 시 이전 차수의 결과를 "무응답"으로 자동 전환
      // (이미 "응답"/"거절"로 확정된 경우는 보호 — 비어있거나 "체크필요"만 덮어씀)
      if (waveNumber === 2 || waveNumber === 3) {
        const { data: prevWaves } = await sb
          .from("outreach_waves")
          .select("wave_number, result")
          .eq("instructor_id", inst.id)
          .lt("wave_number", waveNumber);

        const toMark = (prevWaves || []).filter(
          (w) => !w.result || w.result === "체크필요",
        );
        if (toMark.length > 0) {
          await Promise.all(
            toMark.map((w) =>
              sb
                .from("outreach_waves")
                .update({ result: "무응답" })
                .eq("instructor_id", inst.id)
                .eq("wave_number", w.wave_number),
            ),
          );
        }
      }

      // instructors 업데이트 (email_sent, 발송 수단, 상태 전이)
      const updates: Record<string, unknown> = {
        email_sent: true,
        updated_at: new Date().toISOString(),
      };
      if (!inst.send_method) updates.send_method = "이메일";
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
        detail: `${waveNumber}차 자동발송 → ${inst.email} (${senderAccount.email})`,
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
          ? `${senderAccount.email} 의 OAuth refresh_token이 만료 또는 폐기되었습니다. 발송 모달의 [재인증] 버튼을 눌러 새로 갱신하세요.`
          : abortedReason.kind === "quota"
          ? `${senderAccount.email} 의 Gmail 일일 발송 한도를 초과했습니다. 24시간 후 자동 복구됩니다.`
          : `${senderAccount.email} Gmail API 인증/권한 문제로 발송이 중단되었습니다.`,
      fields: [
        { name: "발송 계정", value: senderAccount.email, inline: true },
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
      description: `[${senderAccount.email}] 성공 ${sent.length} / 실패 ${failed.length} / 스킵 ${skipped.length}`,
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
    detail: `${waveNumber}차 [${senderAccount.email}] · 성공 ${sent.length} / 스킵 ${skipped.length} / 실패 ${failed.length}`,
    performedBy: changedBy || "",
  });

  return NextResponse.json({
    sent,
    skipped,
    failed,
    senderAccount: { id: senderAccount.id, email: senderAccount.email, label: senderAccount.label },
    aborted: abortedReason
      ? { kind: abortedReason.kind, label: abortedReason.label }
      : null,
  });
}
