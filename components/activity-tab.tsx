"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface LogEntry {
  id: string;
  action_type: string;
  target_type: string;
  target_name: string;
  detail: string;
  performed_by: string;
  created_at: string;
}

const PAGE_SIZE = 30;

// 활동 유형별 색상
const ACTION_COLORS: Record<string, string> = {
  상태변경: "bg-blue-100 text-blue-800",
  일괄상태변경: "bg-blue-100 text-blue-800",
  강사등록: "bg-green-100 text-green-800",
  강사삭제: "bg-red-100 text-red-700",
  강사수정: "bg-yellow-100 text-yellow-800",
  발송저장: "bg-indigo-100 text-indigo-800",
  발송삭제: "bg-rose-100 text-rose-700",
  지원서등록: "bg-emerald-100 text-emerald-800",
  지원서수정: "bg-amber-100 text-amber-800",
  지원서삭제: "bg-red-100 text-red-700",
  금지플랫폼추가: "bg-orange-100 text-orange-800",
  금지플랫폼삭제: "bg-orange-100 text-orange-800",
  템플릿저장: "bg-purple-100 text-purple-800",
  보고서생성: "bg-teal-100 text-teal-800",
  보고서삭제: "bg-teal-100 text-teal-800",
};

// 대상 유형 한글 라벨
const TARGET_LABELS: Record<string, string> = {
  instructor: "강사",
  application: "지원서",
  banned_platform: "금지플랫폼",
  template: "템플릿",
  meeting_report: "보고서",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default function ActivityTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/activity?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch {}
    setLoading(false);
  }, [page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // 자동 갱신 (15초)
  useEffect(() => {
    const interval = setInterval(loadLogs, 15000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  const filtered = logs.filter((l) => {
    // 유형 필터
    if (filterType && l.action_type !== filterType) return false;
    // 검색어 필터
    if (search) {
      const q = search.toLowerCase();
      return l.target_name.toLowerCase().includes(q) ||
        l.performed_by.toLowerCase().includes(q) ||
        l.detail.toLowerCase().includes(q) ||
        l.action_type.toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 사용 중인 활동 유형 목록
  const actionTypes = [...new Set(logs.map((l) => l.action_type))];

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      <div className="shrink-0 space-y-3 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">활동 로그</h2>
          <Button size="sm" variant="outline" className="h-8 text-sm" onClick={loadLogs} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />새로고침
          </Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="이름, 변경자, 내용..." className="h-8 text-sm pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select
            className="h-8 text-sm border rounded-md px-2 bg-white"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">전체 유형</option>
            {actionTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">총 {total}건</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#f8f9fa] text-xs font-semibold text-muted-foreground">
            <tr className="border-b">
              <th className="text-left px-4 py-2.5 border-r border-gray-200 w-[160px]">시간</th>
              <th className="text-left px-4 py-2.5 border-r border-gray-200 w-[110px]">유형</th>
              <th className="text-left px-4 py-2.5 border-r border-gray-200 w-[80px]">대상</th>
              <th className="text-left px-4 py-2.5 border-r border-gray-200 w-[120px]">이름</th>
              <th className="text-left px-4 py-2.5 border-r border-gray-200">상세</th>
              <th className="text-left px-4 py-2.5 w-[100px]">수행자</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log, idx) => (
              <tr key={log.id} className={`border-b hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}`}>
                <td className="px-4 py-2.5 border-r border-gray-200/60">
                  <div className="text-sm">{formatDate(log.created_at)}</div>
                  <div className="text-[11px] text-muted-foreground">{timeAgo(log.created_at)}</div>
                </td>
                <td className="px-4 py-2.5 border-r border-gray-200/60">
                  <Badge className={`text-[10px] px-1.5 py-0 whitespace-nowrap ${ACTION_COLORS[log.action_type] || "bg-gray-100 text-gray-600"}`}>
                    {log.action_type}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 border-r border-gray-200/60 text-muted-foreground text-xs">
                  {TARGET_LABELS[log.target_type] || log.target_type}
                </td>
                <td className="px-4 py-2.5 border-r border-gray-200/60 font-medium truncate max-w-[120px]" title={log.target_name}>
                  {log.target_name || "-"}
                </td>
                <td className="px-4 py-2.5 border-r border-gray-200/60 text-muted-foreground truncate max-w-[300px]" title={log.detail}>
                  {log.detail || "-"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{log.performed_by || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            {loading ? "로딩 중..." : "활동 기록이 없습니다."}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-3 pt-3">
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
