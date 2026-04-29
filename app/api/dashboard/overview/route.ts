import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function todayInKST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function dateStrToDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

function dateToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function mondayOf(d: Date): Date {
  const dow = d.getUTCDay();
  const offset = dow === 0 ? 6 : dow - 1;
  return addDays(d, -offset);
}

function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

const PAGE = 1000;

type SB = ReturnType<typeof getSupabase>;

async function fetchAllInstructors(sb: SB) {
  const { data: firstPage, count, error } = await sb
    .from("instructors")
    .select("id, status, source, meeting_date, meeting_confirmed", { count: "exact" })
    .eq("is_banned", false)
    .range(0, PAGE - 1);

  if (error) throw error;

  const all: any[] = [...(firstPage ?? [])];
  const total = count ?? 0;
  if (total > PAGE) {
    const remaining: number[] = [];
    for (let from = PAGE; from < total; from += PAGE) remaining.push(from);
    const results = await Promise.all(
      remaining.map((from) =>
        sb
          .from("instructors")
          .select("id, status, source, meeting_date, meeting_confirmed")
          .eq("is_banned", false)
          .range(from, from + PAGE - 1),
      ),
    );
    for (const { data } of results) if (data) all.push(...data);
  }
  return all;
}

export async function GET() {
  const sb = getSupabase();

  const [wavesRes, ytRes, appRes, instructors] = await Promise.all([
    sb.from("outreach_waves").select("instructor_id, wave_number, sent_date, result"),
    sb.from("youtube_channels").select("status"),
    sb.from("applications").select("review_status"),
    fetchAllInstructors(sb),
  ]);

  if (wavesRes.error) return NextResponse.json({ error: wavesRes.error.message }, { status: 500 });
  if (ytRes.error) return NextResponse.json({ error: ytRes.error.message }, { status: 500 });
  if (appRes.error) return NextResponse.json({ error: appRes.error.message }, { status: 500 });

  const waves = (wavesRes.data ?? []) as {
    instructor_id: string;
    wave_number: number;
    sent_date: string | null;
    result: string;
  }[];
  const ytList = (ytRes.data ?? []) as { status: string }[];
  const appList = (appRes.data ?? []) as { review_status: string }[];
  const instrList = instructors as {
    id: string;
    status: string;
    source: string;
    meeting_date: string | null;
    meeting_confirmed: boolean;
  }[];

  // 누적 발송 / 응답
  let firstSentDate: string | null = null;
  const wavesSent: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  let responsesReceived = 0;
  const sentInstructorIds = new Set<string>();

  for (const w of waves) {
    if (w.sent_date) {
      if (!firstSentDate || w.sent_date < firstSentDate) firstSentDate = w.sent_date;
      if (w.wave_number >= 1 && w.wave_number <= 3) wavesSent[w.wave_number]++;
      sentInstructorIds.add(w.instructor_id);
    }
    if (w.result === "응답" || w.result === "거절") responsesReceived++;
  }
  const totalSent = wavesSent[1] + wavesSent[2] + wavesSent[3];

  // 이번 주 / 이번 달
  const todayStr = todayInKST();
  const today = dateStrToDate(todayStr);
  const thisMonday = mondayOf(today);
  const lastMonday = addDays(thisMonday, -7);
  const daysIntoWeek = Math.round((today.getTime() - thisMonday.getTime()) / 86400000);
  const lastWeekSamePeriodEnd = addDays(lastMonday, daysIntoWeek);

  const thisMonthFirst = firstOfMonth(today);
  const lastMonthFirst = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const lastMonthMaxDay = daysInMonth(lastMonthFirst);
  const todayDay = today.getUTCDate();
  const lastMonthSameDay = Math.min(todayDay, lastMonthMaxDay);
  const lastMonthSamePeriodEnd = new Date(
    Date.UTC(lastMonthFirst.getUTCFullYear(), lastMonthFirst.getUTCMonth(), lastMonthSameDay),
  );

  const thisMondayStr = dateToStr(thisMonday);
  const lastMondayStr = dateToStr(lastMonday);
  const lastWeekEndStr = dateToStr(lastWeekSamePeriodEnd);
  const thisMonthFirstStr = dateToStr(thisMonthFirst);
  const lastMonthFirstStr = dateToStr(lastMonthFirst);
  const lastMonthEndStr = dateToStr(lastMonthSamePeriodEnd);

  let thisWeekSent = 0;
  let lastWeekSent = 0;
  let thisMonthSent = 0;
  let lastMonthSent = 0;
  for (const w of waves) {
    const d = w.sent_date;
    if (!d) continue;
    if (d >= thisMondayStr && d <= todayStr) thisWeekSent++;
    if (d >= lastMondayStr && d <= lastWeekEndStr) lastWeekSent++;
    if (d >= thisMonthFirstStr && d <= todayStr) thisMonthSent++;
    if (d >= lastMonthFirstStr && d <= lastMonthEndStr) lastMonthSent++;
  }

  // 발송 대상 / 미검토 / 미팅 / 계약
  let toSendPlanned = 0;
  let toSendInProgress = 0;
  let pendingSearchPageRegular = 0;
  let contracted = 0;
  let upcomingMeetings = 0;
  let undatedMeetings = 0;
  let metInstructors = 0;

  for (const i of instrList) {
    if (i.status === "발송 예정") toSendPlanned++;
    if (i.status === "진행 중") toSendInProgress++;
    if (i.status === "미검토" && i.source !== "YT채널수집") pendingSearchPageRegular++;
    if (i.status === "계약 완료") contracted++;

    const md = (i.meeting_date || "").trim();
    if (md && md.slice(0, 10) >= todayStr) upcomingMeetings++;
    if (i.meeting_confirmed && !md) undatedMeetings++;
    // 미팅 이후 전환율 분모: 이미 미팅이 끝난 강사 (meeting_date < 오늘)
    if (md && md.slice(0, 10) < todayStr) metInstructors++;
  }

  let pendingYT = 0;
  for (const y of ytList) if (y.status === "미검토") pendingYT++;

  let pendingApplications = 0;
  for (const a of appList) if (a.review_status === "미확인") pendingApplications++;

  const toSendTotal = toSendPlanned + toSendInProgress;
  const pendingSearchPageTotal = pendingSearchPageRegular + pendingYT;

  const sentInstructorCount = sentInstructorIds.size;
  const fromSendRate = sentInstructorCount > 0 ? (contracted / sentInstructorCount) * 100 : null;
  const fromMeetingRate = metInstructors > 0 ? (contracted / metInstructors) * 100 : null;

  return NextResponse.json({
    firstSentDate,
    wavesSent,
    totalSent,
    responsesReceived,
    thisWeek: { sent: thisWeekSent, lastSamePeriodSent: lastWeekSent },
    thisMonth: { sent: thisMonthSent, lastSamePeriodSent: lastMonthSent },
    toSend: { total: toSendTotal, planned: toSendPlanned, inProgress: toSendInProgress },
    pending: {
      searchPage: { total: pendingSearchPageTotal, regular: pendingSearchPageRegular, youtube: pendingYT },
      applications: pendingApplications,
    },
    meetings: { upcoming: upcomingMeetings, undated: undatedMeetings },
    contracts: {
      total: contracted,
      sentInstructors: sentInstructorCount,
      metInstructors,
      fromSendRate,
      fromMeetingRate,
    },
  });
}
