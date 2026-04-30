"use client";

interface WaveItem {
  wave: number;
  newCount: number;
  cumCount: number;
  cumRate: number;
  deltaP: number;
}

interface Props {
  data: {
    cohortSize: number;
    waves: WaveItem[];
  };
}

export default function WaveCumulativeAnalysis({ data }: Props) {
  const { cohortSize, waves } = data;
  const maxRate = Math.max(...waves.map((w) => w.cumRate), 0);
  const chartMax = Math.max(25, Math.ceil((maxRate + 2) / 5) * 5);

  // X축 눈금 (5% 간격)
  const ticks: number[] = [];
  for (let v = 0; v <= chartMax; v += 5) ticks.push(v);

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="text-base font-bold mb-1">회차별 누적 응답 분석</h3>
      <p className="text-xs text-muted-foreground mb-4">
        최근 90일 · 2주 미경과 제외 · 1차 발송 대상 {cohortSize}명 기준
      </p>

      {cohortSize === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">데이터 없음</p>
      ) : (
        <>
          {/* 가로 막대 */}
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
                        <div
                          className="absolute h-full bg-sky-200"
                          style={{ width: `${prevPct}%` }}
                        />
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

          {/* X축 눈금 */}
          <div className="relative mt-2 mb-4 pr-14">
            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
              {ticks.map((t) => (
                <span key={t}>{t}%</span>
              ))}
            </div>
          </div>

          {/* 범례 */}
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

          {/* 보조 카드 */}
          <div className="grid grid-cols-3 gap-2">
            {waves.map((w, idx) => {
              const isLastSame = idx > 0 && w.deltaP === 0;
              return (
                <div key={w.wave} className="bg-gray-50 rounded-lg p-2.5">
                  <div className="text-[11px] text-muted-foreground mb-1">{w.wave}차 발송 후</div>
                  <div className="flex items-baseline gap-1.5 mb-1">
                    <span className="text-lg font-bold tabular-nums">{w.cumRate.toFixed(1)}%</span>
                    {idx > 0 && (
                      <span
                        className={`text-[10px] px-1 py-0.5 rounded ${
                          w.deltaP > 0 ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {w.deltaP > 0 ? "+" : ""}
                        {w.deltaP.toFixed(1)}%p
                      </span>
                    )}
                    {idx === 0 && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-700">
                        +{w.deltaP.toFixed(1)}%p
                      </span>
                    )}
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
    </div>
  );
}
