"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

/**
 * 24시간제 시간 입력 (00:00 ~ 23:59) — 시/분 입력란 분리
 * 브라우저 기본 <input type="time">은 한국어 로케일에서 오전/오후로 표시되므로
 * 직접 입력으로 처리한다. 값은 항상 "HH:MM" 24시간 형식.
 *
 * 시만 입력하면 분은 00으로 채워진다. (17 → 17:00)
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:MM" → ["HH", "MM"] (없으면 빈 문자열) */
const split = (value: string): [string, string] => {
  const m = (value || "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? [pad(+m[1]), m[2]] : ["", ""];
};

type TimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

function TimeInput({ value, onChange, className, disabled }: TimeInputProps) {
  const [hour, setHour] = React.useState(() => split(value)[0]);
  const [minute, setMinute] = React.useState(() => split(value)[1]);
  const minuteRef = React.useRef<HTMLInputElement>(null);

  // 외부 값이 바뀌면 표시 값 동기화 (직접 입력으로 인한 갱신은 무시)
  React.useEffect(() => {
    const current = hour ? `${hour}:${minute || "00"}` : "";
    if (current === value) return;
    const [h, m] = split(value);
    setHour(h);
    setMinute(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /** 시가 있으면 "HH:MM", 없으면 빈 값으로 상위에 전달 */
  const commit = (h: string, m: string) => {
    const next = h ? `${pad(+h)}:${m ? pad(+m) : "00"}` : "";
    if (next !== value) onChange(next);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
    if (digits && +digits > 23) return; // 24 이상은 무시
    setHour(digits);
    commit(digits, minute);
    // 두 자리를 채우면 분 입력란으로 이동
    if (digits.length === 2) minuteRef.current?.focus();
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
    if (digits && +digits > 59) return; // 60 이상은 무시
    setMinute(digits);
    commit(hour, digits);
  };

  /** 포커스 아웃 시 두 자리로 정리 (9 → 09, 분은 비어 있으면 00) */
  const handleHourBlur = () => {
    if (!hour) { setMinute(""); commit("", ""); return; }
    const h = pad(+hour);
    const m = minute ? pad(+minute) : "00";
    setHour(h);
    setMinute(m);
    commit(h, m);
  };

  const handleMinuteBlur = () => {
    if (!hour) return;
    const m = minute ? pad(+minute) : "00";
    setMinute(m);
    commit(hour, m);
  };

  /** ↑/↓로 조정 — 시는 1시간, 분은 10분(Shift 조합 시 5분) 단위 */
  const handleKeyDown = (unit: "hour" | "minute") => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const dir = e.key === "ArrowUp" ? 1 : -1;
    const baseH = hour ? +hour : 9;
    const baseM = minute ? +minute : 0;
    let total = baseH * 60 + baseM;
    if (hour) total += dir * (unit === "hour" ? 60 : e.shiftKey ? 5 : 10);
    total = ((total % 1440) + 1440) % 1440;
    const h = pad(Math.floor(total / 60));
    const m = pad(total % 60);
    setHour(h);
    setMinute(m);
    commit(h, m);
  };

  const inputClass = `${className || ""} text-center px-1`;

  return (
    <div className="flex items-center gap-1">
      <Input
        type="text"
        inputMode="numeric"
        placeholder="17"
        maxLength={2}
        aria-label="시"
        className={inputClass}
        value={hour}
        disabled={disabled}
        onChange={handleHourChange}
        onKeyDown={handleKeyDown("hour")}
        onBlur={handleHourBlur}
      />
      <span className="text-sm text-muted-foreground">:</span>
      <Input
        ref={minuteRef}
        type="text"
        inputMode="numeric"
        placeholder="00"
        maxLength={2}
        aria-label="분"
        className={inputClass}
        value={minute}
        disabled={disabled}
        onChange={handleMinuteChange}
        onKeyDown={handleKeyDown("minute")}
        onBlur={handleMinuteBlur}
      />
    </div>
  );
}

export { TimeInput };
