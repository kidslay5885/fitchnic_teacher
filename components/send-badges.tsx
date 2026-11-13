"use client";

import { X } from "lucide-react";
import { badgeColor } from "@/lib/bulk-send";

// 발송 탭에서 보낸 발송명 뱃지 — 강사 이름 옆에 표시 (여러 개)
// onRemove 를 넘기면 각 뱃지에 삭제(X) 버튼 표시 (강사 상세 전용)
export default function SendBadges({
  badges,
  onRemove,
  className = "",
}: {
  badges?: string[] | null;
  onRemove?: (label: string) => void;
  className?: string;
}) {
  if (!badges || badges.length === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 flex-wrap ${className}`}>
      {badges.map((b) => (
        <span
          key={b}
          title={`발송: ${b}`}
          className={`shrink-0 inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[10px] font-medium leading-4 whitespace-nowrap ${badgeColor(b)}`}
        >
          {b}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(b); }}
              className="ml-0.5 rounded hover:bg-black/10"
              title="뱃지 삭제"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
    </span>
  );
}
