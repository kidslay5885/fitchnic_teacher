"use client";

import { useState } from "react";

interface WaveItem {
  wave: number;
  newCount: number;
  cumCount: number;
  cumRate: number;
  deltaP: number;
}

interface ChannelData {
  cohortSize: number;
  waves: WaveItem[];
}

interface Props {
  data: {
    email: ChannelData;
    dm: ChannelData;
    other: ChannelData;
  };
}

function computeChartMax(rates: number[]): number {
  const max = Math.max(...rates, 0);
  return Math.max(25, Math.ceil((max + 2) / 5) * 5);
}

function buildTicks(chartMax: number): number[] {
  const ticks: number[] = [];
  for (let v = 0; v <= chartMax; v += 5) ticks.push(v);
  return ticks;
}

function EmailView({ data }: { data: ChannelData }) {
  const { cohortSize, waves } = data;
  const chartMax = computeChartMax(waves.map((w) => w.cumRate));
  const ticks = buildTicks(chartMax);

  return (
    <>
      <p className="text-xs text-muted-foreground mb-4">
        발송 수단 '이메일' · 대상 {cohortSize}명 기준
      </p>

      {cohortSize === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">데이터 없음</p>
      ) : (
        <>
          <div className="space-y-3">
            {waves.map((w) => {
              const prevRate = w.cumRate - w.deltaP;
              const prevPct = (prevRate / chartMax) * 100;
              const newPct = (w.deltaP / chartMax) * 100;
              return (
                <div key={w.wave}>
                  <div className="text-xs text-muted-foreground mb-1">{w.wave}차 발송 후</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative h-7 bg-gray-50 rounded overflow-hidden">
                      {prevPct > 0 && (
                        <div className="absolute h-full bg-sky-200" style={{ width: `${prevPct}%` }} />
                      )}
                      {newPct > 0 && (
                        <div
                          className="absolute h-full bg-sky-700 flex items-center justify-center"
                          style={{ left: `${prevPct}%`, width: `${newPct}%` }}
                        >
                          {newPct >= 8 && (
                            <span className="text-[10px] text-white font-medium whitespace-nowrap px-1">
                              +{w.deltaP.toFixed(1)}%p
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-bold w-12 text-right tabular-nums">
                      {w.cumRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative mt-2 mb-4 pr-14">
            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
              {ticks.map((t) => (
                <span key={t}>{t}%</span>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-center text-[11px] text-muted-foreground mb-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-sky-200 rounded-sm" />
              이전 회차 누적
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-sky-700 rounded-sm" />
              해당 회차 신규
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {waves.map((w, idx) => {
              const isLastSame = idx > 0 && w.deltaP === 0;
              return (
                <div key={w.wave} className="bg-gray-50 rounded-lg p-2.5">
                  <div className="text-[11px] text-muted-foreground mb-1">{w.wave}차 발송 후</div>
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-lg font-bold tabular-nums">{w.cumRate.toFixed(1)}%</span>
                    <span
                      className={`text-[10px] px-1 py-0.5 rounded ${
                        w.deltaP > 0 ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {w.deltaP > 0 ? "+" : ""}
                      {w.deltaP.toFixed(1)}%p
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-tight">
                    {idx === 0 ? (
                      <>
                        응답 {w.newCount}명 / 발송 {cohortSize}명
                      </>
                    ) : (
                      <>
                        신규 {w.newCount}명 추가
                        {isLastSame ? " · 한계점 도달" : ` · 누적 ${w.cumCount}명`}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function DmOtherView({ dm, other }: { dm: ChannelData; other: ChannelData }) {
  const sections = [
    { label: "DM", data: dm },
    { label: "기타", data: other },
  ];
  const allRates = [dm, other].flatMap((c) => c.waves.map((w) => w.cumRate));
  const chartMax = computeChartMax(allRates);
  const ticks = buildTicks(chartMax);

  const totalCohort = dm.cohortSize + other.cohortSize;

  return (
    <>
      <p className="text-xs text-muted-foreground mb-4">
        발송 수단 'DM'·'기타' · 1차 발송 후 종료
      </p>

      {totalCohort === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">데이터 없음</p>
      ) : (
        <>
          <div className="space-y-3">
            {sections.map(({ label, data }) => {
              const w = data.waves[0];
              if (!w) return null;
              const widthPct = data.cohortSize > 0 ? (w.cumRate / chartMax) * 100 : 0;
              return (
                <div key={label}>
                  <div className="text-xs text-muted-foreground mb-1">
                    {label} 1차 발송 후{" "}
                    <span className="text-[10px]">(대상 {data.cohortSize}명)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative h-7 bg-gray-50 rounded overflow-hidden">
                      {data.cohortSize > 0 && widthPct > 0 && (
                        <div
                          className="absolute h-full bg-sky-700 flex items-center justify-center"
                          style={{ width: `${widthPct}%` }}
                        >
                          {widthPct >= 12 && (
                            <span className="text-[10px] text-white font-medium whitespace-nowrap px-1">
                              {w.cumRate.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-bold w-12 text-right tabular-nums">
                      {data.cohortSize > 0 ? `${w.cumRate.toFixed(1)}%` : "-"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative mt-2 mb-4 pr-14">
            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
              {ticks.map((t) => (
                <span key={t}>{t}%</span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {sections.map(({ label, data }) => {
              const w = data.waves[0];
              const noData = !w || data.cohortSize === 0;
              return (
                <div key={label} className="bg-gray-50 rounded-lg p-2.5">
                  <div className="text-[11px] text-muted-foreground mb-1">{label} 1차 발송 후</div>
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-lg font-bold tabular-nums">
                      {noData ? "-" : `${w.cumRate.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-tight">
                    {noData ? "데이터 없음" : `응답 ${w.newCount}명 / 발송 ${data.cohortSize}명`}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

export default function WaveCumulativeAnalysis({ data }: Props) {
  const [mode, setMode] = useState<"email" | "dm-other">("email");

  return (
    <div className="bg-white border rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold">회차별 누적 응답 분석</h3>
        <div className="flex bg-gray-100 rounded-md p-0.5 text-xs">
          <button
            onClick={() => setMode("email")}
            className={`px-2.5 py-1 rounded ${
              mode === "email" ? "bg-white shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            이메일
          </button>
          <button
            onClick={() => setMode("dm-other")}
            className={`px-2.5 py-1 rounded ${
              mode === "dm-other" ? "bg-white shadow-sm font-medium" : "text-muted-foreground"
            }`}
          >
            DM·기타
          </button>
        </div>
      </div>

      {mode === "email" ? (
        <EmailView data={data.email} />
      ) : (
        <DmOtherView dm={data.dm} other={data.other} />
      )}
    </div>
  );
}
