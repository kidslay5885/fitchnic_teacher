import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { renderTemplate, sendEmail } from "@/lib/gmail";
import { classifyGmailError, sendDiscordAlert } from "@/lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WaveSummary = {
  sent: { id: string; name: string }[];
  skipped: { id: string; name: string; reason: string }[];
  failed: { id: string; name: string; error: string }[];
  error?: string;
};

type Summary = {
  scheduled_at: string;
  wave2: WaveSummary;
  wave3: WaveSummary;
  aborted?: string;
};

// Cron: 매일 KST 10:06 (UTC 01:06)
// 이전 차수 발송 7일 경과 & result="체크필요"인 강사에게 다음 차수 자동 발송
// 대상: 발송 수단 != "DM" & 이메일 존재 & 아직 해당 차수 발송 기록 없음
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutoff = sevenDaysAgo.toISOString().split("T")[0];
  const todayStr = now.toISOString().split("T")[0];

  const summary: Summary = {
    scheduled_at: now.toISOString(),
    wave2: { sent: [], skipped: [], failed: [] },
    wave3: { sent: [], skipped: [], failed: [] },
  };

  for (const waveNumber of [2, 3] as const) {
    const key = `wave${waveNumber}` as "wave2" | "wave3";
    const prevWave = waveNumber - 1;

    // 템플릿 조회
    const { data: templates } = await sb
      .from("message_templates")
      .select("*")
      .eq("channel", "이메일")
      .eq("variant_label", `${waveNumber}차`)
      .limit(1);
    const template = templates?.[0];
    if (!template) {
      summary[key].error = `${waveNumber}차 이메일 템플릿 없음`;
      continue;
    }

    // 이전 차수 발송 ≥ 7일 경과 & result="체크필요" 레코드
    const { data: candidates } = await sb
      .from("outreach_waves")
      .select("instructor_id, sent_date, result")
      .eq("wave_number", prevWave)
      .eq("result", "체크필요")
      .lte("sent_date", cutoff);

    if (!candidates || candidates.length === 0) continue;

    const candidateIds = candidates.map((c) => c.instructor_id);

    // 이미 현재 차수 발송 기록 있는 강사 제외
    const { data: existingCurrent } = await sb
      .from("outreach_waves")
      .select("instructor_id")
      .in("instructor_id", candidateIds)
      .eq("wave_number", waveNumber);
    const alreadySent = new Set((existingCurrent ?? []).map((w) => w.instructor_id));
    const pendingIds = candidateIds.filter((id) => !alreadySent.has(id));
    if (pendingIds.length === 0) continue;

    // 강사 조회
    const { data: instructors } = await sb
      .from("instructors")
      .select("id, name, field, email, status, assignee, send_method, is_banned")
      .in("id", pendingIds);
    if (!instructors) continue;

    for (const inst of instructors) {
      if (inst.is_banned) {
        summary[key].skipped.push({ id: inst.id, name: inst.name, reason: "연락 금지" });
        continue;
      }
      if (!inst.email?.trim()) {
        summary[key].skipped.push({ id: inst.id, name: inst.name, reason: "이메일 없음" });
        continue;
      }
      // 발송 수단이 "이메일"이 아니면 이메일 자동 발송 스킵 (DM, 기타 임의 값 모두)
      if (inst.send_method && inst.send_method !== "이메일") {
        summary[key].skipped.push({ id: inst.id, name: inst.name, reason: `발송 수단 ${inst.send_method}` });
        continue;
      }

      const subject = renderTemplate(template.subject || "", { name: inst.name, field: inst.field });
      const body = renderTemplate(template.body || "", { name: inst.name, field: inst.field });

      try {
        const toName = inst.name?.trim() ? `${inst.name.trim()}님` : undefined;
        await sendEmail({ to: inst.email.trim(), subject, body, toName });

        // 현재 차수 기록
        await sb
          .from("outreach_waves")
          .upsert(
            {
              instructor_id: inst.id,
              wave_number: waveNumber,
              sent_date: todayStr,
              result: "체크필요",
            },
            { onConflict: "instructor_id,wave_number" },
          );

        // 이전 차수 체크필요 → 무응답으로 자동 전환
        await sb
          .from("outreach_waves")
          .update({ result: "무응답" })
          .eq("instructor_id", inst.id)
          .eq("wave_number", prevWave)
          .eq("result", "체크필요");

        // 상태 전이 (발송 예정 → 진행 중) & email_sent
        const updates: Record<string, unknown> = {
          email_sent: true,
          updated_at: new Date().toISOString(),
        };
        const shouldTransition = inst.status === "발송 예정";
        if (shouldTransition) updates.status = "진행 중";
        await sb.from("instructors").update(updates).eq("id", inst.id);

        if (shouldTransition) {
          await sb.from("status_history").insert({
            instructor_id: inst.id,
            from_status: inst.status,
            to_status: "진행 중",
            changed_by: "system:cron",
            reason: `${waveNumber}차 자동 이메일 발송(크론)`,
          });
        }

        await logActivity({
          actionType: "이메일발송",
          targetType: "instructor",
          targetId: inst.id,
          targetName: inst.name,
          detail: `${waveNumber}차 자동발송(크론) → ${inst.email}`,
          performedBy: "system:cron",
        });

        summary[key].sent.push({ id: inst.id, name: inst.name });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        summary[key].failed.push({ id: inst.id, name: inst.name, error: msg });

        const classified = classifyGmailError(msg);
        if (classified.kind === "token_expired" || classified.kind === "quota" || classified.kind === "auth") {
          await sendDiscordAlert({
            title: `크론 발송 중단 — ${classified.label}`,
            level: "error",
            description: msg.slice(0, 900),
            fields: [
              { name: "차수", value: `${waveNumber}차`, inline: true },
              { name: "성공", value: `${summary[key].sent.length}건`, inline: true },
              { name: "실패", value: `${summary[key].failed.length}건`, inline: true },
            ],
          });
          summary.aborted = classified.kind;
          break;
        }
      }

      // Gmail rate limit 방지
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (summary.aborted) break;
  }

  const totalSent = summary.wave2.sent.length + summary.wave3.sent.length;
  const totalFailed = summary.wave2.failed.length + summary.wave3.failed.length;
  const totalSkipped = summary.wave2.skipped.length + summary.wave3.skipped.length;

  await logActivity({
    actionType: "크론자동발송",
    targetType: "instructor",
    targetId: "cron",
    targetName: "자동 이메일 발송",
    detail: `2차 ${summary.wave2.sent.length} / 3차 ${summary.wave3.sent.length} · 실패 ${totalFailed} · 스킵 ${totalSkipped}`,
    performedBy: "system:cron",
  });

  if (totalSent > 0 || totalFailed > 0) {
    await sendDiscordAlert({
      title: "자동 이메일 발송",
      level: totalFailed > 0 ? "warn" : "info",
      description: `2차 ${summary.wave2.sent.length} · 3차 ${summary.wave3.sent.length} · 실패 ${totalFailed} · 스킵 ${totalSkipped}`,
    });
  }

  return NextResponse.json(summary);
}
