"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS } from "@/lib/constants";
import type { InstructorStatus } from "@/lib/types";
import { Search, RefreshCw, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";

interface LogEntry {
  id: string;
  instructor_name: string;
  from_status: string;
  to_status: string;
  changed_by: string;
  reason: string;
  created_at: string;
}

const PAGE_SIZE = 30;

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

  const filtered = search
    ? logs.filter((l) => {
        const q = search.toLowerCase();
        return l.instructor_name.toLowerCase().includes(q) ||
          l.changed_by.toLowerCase().includes(q) ||
          l.reason.toLowerCase().includes(q) ||
          l.to_status.toLowerCase().includes(q);
      })
    : logs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      <div className="shrink-0 space-y-3 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">활동 로그</h2>
          <Button size="sm" variant="outline" className="h-8 text-sm" onClick={loadLogs} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />새로고침
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="강사명, 변경자, 사유..." className="h-8 text-sm pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="text-sm text-muted-foreground">총 {total}건</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#f8f9fa] text-xs font-semibold text-muted-foreground">
            <tr className="border-b">
              <th className="text-left px-4 py-2.5 border-r border-gray-200 w-[160px]">시간</th>
              <th className="text-left px-4 py-2.5 border-r border-gray-200 w-[120px]">강사명</th>
              <th className="text-left px-4 py-2.5 border-r border-gray-200 w-[240px]">변경 내용</th>
              <th className="text-left px-4 py-2.5 border-r border-gray-200 w-[100px]">변경자</th>
              <th className="text-left px-4 py-2.5">사유</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log, idx) => (
              <tr key={log.id} className={`border-b hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}`}>
                <td className="px-4 py-2.5 border-r border-gray-200/60">
                  <div className="text-sm">{formatDate(log.created_at)}</div>
                  <div className="text-[11px] text-muted-foreground">{timeAgo(log.created_at)}</div>
                </td>
                <td className="px-4 py-2.5 border-r border-gray-200/60 font-medium">{log.instructor_name}</td>
                <td className="px-4 py-2.5 border-r border-gray-200/60">
                  <div className="flex items-center gap-2">
                    {log.from_status ? (
                      <Badge className={`text-[10px] px-1.5 py-0 whitespace-nowrap ${STATUS_COLORS[log.from_status as InstructorStatus] || "bg-gray-100 text-gray-600"}`}>
                        {log.from_status}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <Badge className={`text-[10px] px-1.5 py-0 whitespace-nowrap ${STATUS_COLORS[log.to_status as InstructorStatus] || "bg-gray-100 text-gray-600"}`}>
                      {log.to_status}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-2.5 border-r border-gray-200/60 text-muted-foreground">{log.changed_by || "-"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{log.reason || "-"}</td>
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
