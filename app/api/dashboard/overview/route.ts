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

// 월요일 시작 기준, 해당 월에서 몇 주차인지 (1-based)
function getMonthWeekUTC(d: Date): number {
  const day = d.getUTCDate();
  const firstOfMo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const firstDow = firstOfMo.getUTCDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  return Math.ceil((day + offset) / 7);
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
  let thisWeekMeetings = 0;

  // 이번 주 일요일까지 범위
  const thisSunday = addDays(thisMonday, 6);
  const thisSundayStr = dateToStr(thisSunday);

  for (const i of instrList) {
    if (i.status === "발송 예정") toSendPlanned++;
    if (i.status === "진행 중") toSendInProgress++;
    if (i.status === "미검토" && i.source !== "YT채널수집") pendingSearchPageRegular++;
    if (i.status === "계약 완료") contracted++;

    const md = (i.meeting_date || "").trim();
    const mdDate = md.slice(0, 10);
    if (md && mdDate >= todayStr) upcomingMeetings++;
    if (i.meeting_confirmed && !md) undatedMeetings++;
    // 미팅 이후 전환율 분모: 이미 미팅이 끝난 강사 (meeting_date < 오늘)
    if (md && mdDate < todayStr) metInstructors++;
    // 이번 주 미팅 (월~일)
    if (md && mdDate >= thisMondayStr && mdDate <= thisSundayStr) thisWeekMeetings++;
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

  // === 추이 데이터 ===
  // 일별 발송/응답 맵
  const dailyMap = new Map<string, { sent: number; responded: number }>();
  for (const w of waves) {
    if (!w.sent_date) continue;
    const e = dailyMap.get(w.sent_date) ?? { sent: 0, responded: 0 };
    e.sent++;
    if (w.result === "응답" || w.result === "거절") e.responded++;
    dailyMap.set(w.sent_date, e);
  }

  // 주별(요일별) 추이
  const weeklyDates = (start: Date) => {
    const out: string[] = [];
    for (let i = 0; i < 7; i++) out.push(dateToStr(addDays(start, i)));
    return out;
  };
  const buildDaily = (dates: string[]) => {
    const sent: number[] = [];
    const responded: number[] = [];
    const rate: (number | null)[] = [];
    for (const d of dates) {
      const e = dailyMap.get(d) ?? { sent: 0, responded: 0 };
      sent.push(e.sent);
      responded.push(e.responded);
      rate.push(e.sent > 0 ? (e.responded / e.sent) * 100 : null);
    }
    return { sent, responded, rate };
  };
  const thisWeekDates = weeklyDates(thisMonday);
  const lastWeekDates = weeklyDates(lastMonday);
  const thisWeekDaily = buildDaily(thisWeekDates);
  const lastWeekDaily = buildDaily(lastWeekDates);

  // 월별(주차별) 추이
  const aggregateMonthByWeek = (monthFirst: Date) => {
    const days = daysInMonth(monthFirst);
    const lastDay = addDays(monthFirst, days - 1);
    const weekCount = getMonthWeekUTC(lastDay);
    const sent: number[] = new Array(weekCount).fill(0);
    const responded: number[] = new Array(weekCount).fill(0);
    for (let i = 0; i < days; i++) {
      const date = addDays(monthFirst, i);
      const dateStr = dateToStr(date);
      const wkIdx = getMonthWeekUTC(date) - 1;
      const e = dailyMap.get(dateStr);
      if (e) {
        sent[wkIdx] += e.sent;
        responded[wkIdx] += e.responded;
      }
    }
    const rate = sent.map((s, i) => (s > 0 ? (responded[i] / s) * 100 : null));
    return { sent, responded, rate, weekCount };
  };
  const thisMonthByWeek = aggregateMonthByWeek(thisMonthFirst);
  const lastMonthByWeek = aggregateMonthByWeek(lastMonthFirst);

  // 헤더 요약 응답률
  let thisWeekResp = 0;
  let lastWeekResp = 0;
  let thisMonthResp = 0;
  let lastMonthResp = 0;
  for (const w of waves) {
    const d = w.sent_date;
    if (!d) continue;
    const isResp = w.result === "응답" || w.result === "거절";
    if (isResp) {
      if (d >= thisMondayStr && d <= todayStr) thisWeekResp++;
      if (d >= lastMondayStr && d <= lastWeekEndStr) lastWeekResp++;
      if (d >= thisMonthFirstStr && d <= todayStr) thisMonthResp++;
      if (d >= lastMonthFirstStr && d <= lastMonthEndStr) lastMonthResp++;
    }
  }
  const thisWeekRate = thisWeekSent > 0 ? (thisWeekResp / thisWeekSent) * 100 : null;
  const lastWeekRate = lastWeekSent > 0 ? (lastWeekResp / lastWeekSent) * 100 : null;
  const thisMonthRate = thisMonthSent > 0 ? (thisMonthResp / thisMonthSent) * 100 : null;
  const lastMonthRate = lastMonthSent > 0 ? (lastMonthResp / lastMonthSent) * 100 : null;

  // 지난주/지난달 마감 합계
  const lastWeekFinalEnd = dateToStr(addDays(lastMonday, 6));
  let lastWeekFinalSent = 0;
  for (const w of waves) {
    if (w.sent_date && w.sent_date >= lastMondayStr && w.sent_date <= lastWeekFinalEnd) lastWeekFinalSent++;
  }
  const lastMonthFullEnd = dateToStr(addDays(lastMonthFirst, daysInMonth(lastMonthFirst) - 1));
  let lastMonthFullSent = 0;
  for (const w of waves) {
    if (w.sent_date && w.sent_date >= lastMonthFirstStr && w.sent_date <= lastMonthFullEnd) lastMonthFullSent++;
  }

  // === 회차별 누적 응답 분석 ===
  // 코호트: 1차 sent_date in [today-90d, today-14d]
  const ninetyDaysAgo = dateToStr(addDays(today, -90));
  const twoWeeksAgo = dateToStr(addDays(today, -14));

  const wavesByInstr: Record<string, typeof waves> = {};
  for (const w of waves) {
    if (!wavesByInstr[w.instructor_id]) wavesByInstr[w.instructor_id] = [];
    wavesByInstr[w.instructor_id].push(w);
  }

  let cohortSize = 0;
  let respondedAt1 = 0;
  let respondedBy2 = 0;
  let respondedBy3 = 0;
  for (const id of Object.keys(wavesByInstr)) {
    const ws = wavesByInstr[id];
    const w1 = ws.find((w) => w.wave_number === 1);
    if (!w1?.sent_date) continue;
    if (w1.sent_date < ninetyDaysAgo || w1.sent_date > twoWeeksAgo) continue;

    cohortSize++;
    const w2 = ws.find((w) => w.wave_number === 2);
    const w3 = ws.find((w) => w.wave_number === 3);

    const r1 = w1.result === "응답" || w1.result === "거절";
    const r2 = w2 ? w2.result === "응답" || w2.result === "거절" : false;
    const r3 = w3 ? w3.result === "응답" || w3.result === "거절" : false;

    if (r1) respondedAt1++;
    if (r1 || r2) respondedBy2++;
    if (r1 || r2 || r3) respondedBy3++;
  }

  const pct = (n: number) => (cohortSize > 0 ? (n / cohortSize) * 100 : 0);
  const waveAnalysis = {
    cohortSize,
    waves: [
      {
        wave: 1,
        newCount: respondedAt1,
        cumCount: respondedAt1,
        cumRate: pct(respondedAt1),
        deltaP: pct(respondedAt1),
      },
      {
        wave: 2,
        newCount: respondedBy2 - respondedAt1,
        cumCount: respondedBy2,
        cumRate: pct(respondedBy2),
        deltaP: pct(respondedBy2 - respondedAt1),
      },
      {
        wave: 3,
        newCount: respondedBy3 - respondedBy2,
        cumCount: respondedBy3,
        cumRate: pct(respondedBy3),
        deltaP: pct(respondedBy3 - respondedBy2),
      },
    ],
  };

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
    meetings: { upcoming: upcomingMeetings, undated: undatedMeetings, thisWeek: thisWeekMeetings },
    contracts: {
      total: contracted,
      sentInstructors: sentInstructorCount,
      metInstructors,
      fromSendRate,
      fromMeetingRate,
    },
    trends: {
      weekly: {
        thisWeek: {
          dates: thisWeekDates,
          sent: thisWeekDaily.sent,
          responded: thisWeekDaily.responded,
          rate: thisWeekDaily.rate,
          totalSent: thisWeekSent,
          totalResp: thisWeekResp,
          totalRate: thisWeekRate,
        },
        lastWeek: {
          dates: lastWeekDates,
          sent: lastWeekDaily.sent,
          responded: lastWeekDaily.responded,
          rate: lastWeekDaily.rate,
          totalSent: lastWeekSent,
          totalResp: lastWeekResp,
          totalRate: lastWeekRate,
          fullWeekSent: lastWeekFinalSent,
        },
        daysIntoWeek,
      },
      monthly: {
        thisMonth: {
          sent: thisMonthByWeek.sent,
          responded: thisMonthByWeek.responded,
          rate: thisMonthByWeek.rate,
          weekCount: thisMonthByWeek.weekCount,
          totalSent: thisMonthSent,
          totalResp: thisMonthResp,
          totalRate: thisMonthRate,
          monthLabel: today.getUTCMonth() + 1,
        },
        lastMonth: {
          sent: lastMonthByWeek.sent,
          responded: lastMonthByWeek.responded,
          rate: lastMonthByWeek.rate,
          weekCount: lastMonthByWeek.weekCount,
          totalSent: lastMonthSent,
          totalResp: lastMonthResp,
          totalRate: lastMonthRate,
          fullMonthSent: lastMonthFullSent,
          monthLabel: lastMonthFirst.getUTCMonth() + 1,
        },
      },
    },
    waveAnalysis,
  });
}
