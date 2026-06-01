"use client";

import { useEffect, useState } from "react";
import WaveCumulativeAnalysis from "@/components/dashboard/wave-cumulative-analysis";
import SendTrendChart from "@/components/dashboard/send-trend-chart";
import ResponseRateChart from "@/components/dashboard/response-rate-chart";
import { AlertTriangle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOutreach } from "@/hooks/use-outreach-store";

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];

interface PeriodStat {
  sent: number;
  lastSamePeriodSent: number;
}

interface DailyTrend {
  dates: string[];
  sent: number[];
  responded: number[];
  rate: (number | null)[];
  totalSent: number;
  totalResp: number;
  totalRate: number | null;
}

interface MonthlyTrend {
  sent: number[];
  responded: number[];
  rate: (number | null)[];
  weekCount: number;
  totalSent: number;
  totalResp: number;
  totalRate: number | null;
  monthLabel: number;
}

interface Overview {
  firstSentDate: string | null;
  wavesSent: Record<number, number>;
  totalSent: number;
  responsesReceived: number;
  today: { sent: number; yesterdaySent: number };
  thisWeek: PeriodStat;
  thisMonth: PeriodStat;
  toSend: { total: number; planned: number; inProgress: number };
  pending: {
    searchPage: { total: number; regular: number; youtube: number };
    applications: number;
  };
  meetings: { upcoming: number; undated: number; thisWeek: number };
  contracts: {
    total: number;
    sentInstructors: number;
    metInstructors: number;
    fromSendRate: number | null;
    fromMeetingRate: number | null;
  };
  trends: {
    weekly: {
      thisWeek: DailyTrend;
      lastWeek: DailyTrend & { fullWeekSent: number };
      daysIntoWeek: number;
    };
    monthly: {
      thisMonth: MonthlyTrend;
      lastMonth: MonthlyTrend & { fullMonthSent: number };
    };
  };
  waveAnalysis: {
    email: WaveChannelData;
    dm: WaveChannelData;
    other: WaveChannelData;
  };
}

interface WaveChannelData {
  cohortSize: number;
  waves: {
    wave: number;
    newCount: number;
    cumCount: number;
    cumRate: number;
    deltaP: number;
  }[];
}

function formatToday(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()} (${DOW_KO[d.getDay()]})`;
}

// 일요일 시작 기준, 해당 월에서 몇 주차인지
function getMonthWeek(d: Date) {
  const day = d.getDate();
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const firstDow = firstOfMonth.getDay(); // Sun=0, ..., Sat=6
  return Math.ceil((day + firstDow) / 7);
}

function formatStartDate(iso: string) {
  const [y, m, day] = iso.split("-");
  return `${y}/${parseInt(m, 10)}/${parseInt(day, 10)}`;
}

function formatStartShort(iso: string) {
  const [, m, day] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(day, 10)}`;
}

function ChangeIndicator({ thisVal, lastVal }: { thisVal: number; lastVal: number }) {
  const diff = thisVal - lastVal;
  if (lastVal === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }
  if (diff === 0) {
    return <span className="text-sm text-muted-foreground">변동 없음</span>;
  }
  const pct = Math.round((diff / lastVal) * 100);
  const isUp = diff > 0;
  return (
    <span className={`text-sm font-medium ${isUp ? "text-red-500" : "text-blue-600"}`}>
      {isUp ? "▲" : "▼"}
      {Math.abs(diff)} ({isUp ? "+" : ""}
      {pct}%)
    </span>
  );
}

export default function DashboardTab() {
  const { state: { gmailHealth }, loadGmailHealth } = useOutreach();
  const [data, setData] = useState<Overview | null>(null);
  const [reAuthing, setReAuthing] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/overview")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

  // Gmail 재인증 콜백에서 ?gmail_reauthed=1 로 돌아온 직후 즉시 재핑 + URL 정리
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("gmail_reauthed") === "1") {
      loadGmailHealth();
      url.searchParams.delete("gmail_reauthed");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
    }
  }, [loadGmailHealth]);

  const today = new Date();

  return (
    <div className="space-y-6 max-w-[1480px]">
      {/* 헤더 */}
      <h1 className="text-2xl font-bold">강사 모집 현황</h1>

      {/* Gmail 연결 만료 알림 — 실패 시에만 노출 */}
      {gmailHealth && !gmailHealth.ok && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-700">
              Gmail 연결 만료 — 자동 발송이 작동하지 않습니다
            </p>
            <p className="text-xs text-red-600/90 mt-0.5">
              {gmailHealth.label || "OAuth 토큰 오류"}
              {gmailHealth.message ? ` · ${gmailHealth.message}` : ""}
            </p>
          </div>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white shrink-0"
            disabled={reAuthing}
            onClick={() => {
              setReAuthing(true);
              const email = gmailHealth.failedAccount?.email;
              const url = email
                ? `/api/gmail-oauth/start?account=${encodeURIComponent(email)}`
                : "/api/gmail-oauth/start";
              window.location.href = url;
            }}
          >
            <LogIn className="h-4 w-4 mr-1.5" />
            Gmail 다시 연결
            {gmailHealth.failedAccount?.email ? ` (${gmailHealth.failedAccount.email})` : ""}
          </Button>
        </div>
      )}

      {/* 상단 메타 띠 */}
      <div className="flex items-center gap-x-5 gap-y-2 flex-wrap px-1 py-1 text-sm">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-900 font-medium">
          오늘 {formatToday(today)} · {today.getMonth() + 1}월 {getMonthWeek(today)}주차
        </span>

        {data?.firstSentDate && (
          <span className="text-muted-foreground">
            발송 시작 <span className="text-foreground font-medium">{formatStartDate(data.firstSentDate)}</span>
          </span>
        )}

        {data && (
          <span className="text-muted-foreground">
            누적 발송{" "}
            <span className="text-foreground font-medium">{data.totalSent.toLocaleString()}건</span>
            <span className="ml-1 text-xs">
              (1차 {data.wavesSent[1] || 0}·2차 {data.wavesSent[2] || 0}·3차 {data.wavesSent[3] || 0})
            </span>
          </span>
        )}

        {data && (
          <span className="text-muted-foreground">
            누적 응답 <span className="text-foreground font-medium">{data.responsesReceived.toLocaleString()}건</span>
          </span>
        )}
      </div>

      {/* 활동량: 오늘 / 이번 주 / 이번 달 / 누적 */}
      {data && (
        <section className="grid grid-cols-4 gap-3">
          {/* 오늘 발송 */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-foreground mb-2">오늘 발송</p>
            <div className="flex items-baseline gap-2 mb-1.5">
              <p className="text-3xl font-bold leading-none">{data.today.sent.toLocaleString()}</p>
              <ChangeIndicator
                thisVal={data.today.sent}
                lastVal={data.today.yesterdaySent}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              어제 {data.today.yesterdaySent}건
            </p>
          </div>

          {/* 이번 주 발송 */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-foreground mb-2">이번 주 발송</p>
            <div className="flex items-baseline gap-2 mb-1.5">
              <p className="text-3xl font-bold leading-none">{data.thisWeek.sent.toLocaleString()}</p>
              <ChangeIndicator
                thisVal={data.thisWeek.sent}
                lastVal={data.thisWeek.lastSamePeriodSent}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              같은 시점 지난주 {data.thisWeek.lastSamePeriodSent}건
            </p>
          </div>

          {/* 이번 달 발송 */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-foreground mb-2">이번 달 발송</p>
            <div className="flex items-baseline gap-2 mb-1.5">
              <p className="text-3xl font-bold leading-none">{data.thisMonth.sent.toLocaleString()}</p>
              <ChangeIndicator
                thisVal={data.thisMonth.sent}
                lastVal={data.thisMonth.lastSamePeriodSent}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              같은 시점 지난달 {data.thisMonth.lastSamePeriodSent}건
            </p>
          </div>

          {/* 누적 발송 */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-foreground mb-2">누적 발송</p>
            <p className="text-3xl font-bold leading-none mb-1.5">{data.totalSent.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {data.firstSentDate
                ? `${formatStartShort(data.firstSentDate)} 시작`
                : "발송 기록 없음"}
            </p>
          </div>
        </section>
      )}

      {/* 현재 재고 */}
      {data && (
        <section className="grid grid-cols-4 gap-3">
          {/* 미검토 */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-foreground mb-2">미검토</p>
            <div className="grid grid-cols-2 gap-3 divide-x">
              <div>
                <p className="text-3xl font-bold leading-none mb-1.5">{data.pending.searchPage.total.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground leading-tight">
                  강사찾기 {data.pending.searchPage.regular}
                  <br />
                  YT채널수집 {data.pending.searchPage.youtube}
                </p>
              </div>
              <div className="pl-3">
                <p className="text-3xl font-bold leading-none mb-1.5">{data.pending.applications.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground leading-tight">
                  구글폼
                  <br />
                  지원서
                </p>
              </div>
            </div>
          </div>

          {/* 발송 대상 */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-foreground mb-2">발송 대상</p>
            <p className="text-3xl font-bold leading-none mb-1.5">{data.toSend.total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              발송예정 {data.toSend.planned} · 진행중 {data.toSend.inProgress}
            </p>
          </div>

          {/* 확정된 미팅 */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-foreground mb-2">확정된 미팅</p>
            <p className="text-3xl font-bold leading-none mb-1.5">{data.meetings.upcoming.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">이번주 미팅 {data.meetings.thisWeek}</p>
          </div>

          {/* 계약 완료 */}
          <div className="bg-white border rounded-xl p-4">
            <p className="text-xs font-semibold text-foreground mb-2">계약 완료</p>
            <p className="text-3xl font-bold leading-none mb-1.5 text-emerald-600">
              {data.contracts.total.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground leading-tight">
              발송 이후 {data.contracts.fromSendRate != null ? `${data.contracts.fromSendRate.toFixed(1)}%` : "-"}
              <br />
              미팅 이후 {data.contracts.fromMeetingRate != null ? `${data.contracts.fromMeetingRate.toFixed(1)}%` : "-"}
            </p>
          </div>
        </section>
      )}

      {/* 추이 + 회차별 분석 */}
      {data && (
        <section className="grid grid-cols-3 gap-3 items-stretch">
          <SendTrendChart weekly={data.trends.weekly} monthly={data.trends.monthly} />
          <ResponseRateChart weekly={data.trends.weekly} monthly={data.trends.monthly} />
          <WaveCumulativeAnalysis data={data.waveAnalysis} />
        </section>
      )}
    </div>
  );
}
