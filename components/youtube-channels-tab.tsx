"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useOutreach } from "@/hooks/use-outreach-store";
import { useRowSelection } from "@/hooks/use-row-selection";
import type { YouTubeChannel, YouTubeChannelStatus } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STATUSES, STATUS_COLORS } from "@/lib/constants";
import { toast } from "sonner";
import { Search, Trash2, ExternalLink, ChevronUp, ChevronDown, X, Copy } from "lucide-react";

const STATUS_OPTIONS = STATUSES;

const ROW_BG: Record<string, string> = {
  "미검토": "bg-gray-50",
  "컨펌 필요": "bg-yellow-50",
  "발송 예정": "bg-blue-50",
  "진행 중": "bg-indigo-50",
  "계약 완료": "bg-green-50",
  "제외": "bg-red-50",
  "보류": "bg-orange-50",
  "거절": "bg-rose-50",
};

type SortKey = "status" | "profile" | "keyword" | "channel_name" | "subscriber_count" | "email" | "memo";
type SortDir = "asc" | "desc";

const ROW_H = 36;
// 체크 | 상태 | 프로필 | 키워드 | 채널명 | 구독자 | 이메일 | 메모 | 링크
const GRID = "36px 84px 1fr 1fr 1.2fr 80px 1.2fr 1.5fr 40px";
const MIN_W = 900;

export default function YouTubeChannelsTab() {
  const { state, dispatch, loadYoutubeChannels } = useOutreach();
  const [search, setSearch] = useState("");
  const [filterProfile, setFilterProfile] = useState("전체");
  const [filterStatus, setFilterStatus] = useState<YouTubeChannelStatus | "전체">("전체");
  // selectedIds는 useRowSelection 훅에서 관리
  const [sortKey, setSortKey] = useState<SortKey>("channel_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingStatus, setEditingStatus] = useState<{ channel: YouTubeChannel; x: number; y: number } | null>(null);
  const [editingMemo, setEditingMemo] = useState<{ id: string; memo: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.youtubeChannels.length === 0) loadYoutubeChannels();
  }, []);

  // 고유 프로필 목록
  const profiles = useMemo(() => {
    const set = new Set(state.youtubeChannels.map((c) => c.profile).filter(Boolean));
    return Array.from(set).sort();
  }, [state.youtubeChannels]);

  // 필터링
  const filtered = useMemo(() => {
    return state.youtubeChannels.filter((c) => {
      if (filterProfile !== "전체" && c.profile !== filterProfile) return false;
      if (filterStatus !== "전체" && c.status !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          c.channel_name.toLowerCase().includes(s) ||
          c.email.toLowerCase().includes(s) ||
          c.keyword.toLowerCase().includes(s) ||
          c.memo.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [state.youtubeChannels, filterProfile, filterStatus, search]);

  // 정렬
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a[sortKey] || "") as string;
      const bv = (b[sortKey] || "") as string;
      const cmp = av.localeCompare(bv, "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const sortedIds = useMemo(() => sorted.map((c) => c.id), [sorted]);
  const { selected: selectedIds, setSelected: setSelectedIds, toggleAll, handleClick: handleRowClick, handleMouseDown, handleMouseEnter, handleMouseUp } = useRowSelection(sortedIds);

  // 글로벌 mouseup 등록 (드래그 종료)
  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey, sortDir]);

  // 단건 상태 변경
  const handleStatusChange = useCallback(async (id: string, status: YouTubeChannelStatus) => {
    try {
      const res = await fetch("/api/youtube-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      dispatch({
        type: "SET_YOUTUBE_CHANNELS",
        channels: state.youtubeChannels.map((c) => (c.id === id ? updated : c)),
      });
      const ch = state.youtubeChannels.find((c) => c.id === id);
      toast.success(`${ch?.channel_name} → ${status}`);
      setEditingStatus(null);
    } catch {
      toast.error("상태 변경 실패");
    }
  }, [state.youtubeChannels, dispatch]);

  // 메모 변경
  const handleMemoSave = useCallback(async (id: string, memo: string) => {
    try {
      const res = await fetch("/api/youtube-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, memo }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      dispatch({
        type: "SET_YOUTUBE_CHANNELS",
        channels: state.youtubeChannels.map((c) => (c.id === id ? updated : c)),
      });
      setEditingMemo(null);
    } catch {
      toast.error("메모 저장 실패");
    }
  }, [state.youtubeChannels, dispatch]);

  // 일괄 상태 변경
  const handleBulkStatus = useCallback(async (status: YouTubeChannelStatus) => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch("/api/youtube-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status }),
      });
      if (!res.ok) throw new Error();
      dispatch({
        type: "SET_YOUTUBE_CHANNELS",
        channels: state.youtubeChannels.map((c) =>
          selectedIds.has(c.id) ? { ...c, status } : c
        ),
      });
      setSelectedIds(new Set());
      toast.success(`${selectedIds.size}건 상태 변경`);
    } catch {
      toast.error("일괄 변경 실패");
    }
  }, [selectedIds, state.youtubeChannels, dispatch]);

  // 일괄 삭제
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}건을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch("/api/youtube-channels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error();
      dispatch({
        type: "SET_YOUTUBE_CHANNELS",
        channels: state.youtubeChannels.filter((c) => !selectedIds.has(c.id)),
      });
      setSelectedIds(new Set());
      toast.success("삭제 완료");
    } catch {
      toast.error("삭제 실패");
    }
  }, [selectedIds, state.youtubeChannels, dispatch]);

  const handleStatusClick = (e: React.MouseEvent, channel: YouTubeChannel) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingStatus({ channel, x: rect.left, y: rect.bottom + 4 });
  };

  // toggleAll, handleClick(shift+클릭), handleMouseDown/Enter(드래그) → useRowSelection 훅에서 제공
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 필터 바 */}
      <div className="flex items-center gap-2 flex-wrap pb-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="검색..."
            className="h-8 text-sm pl-8 w-[200px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterProfile} onValueChange={setFilterProfile}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <span className="truncate">{filterProfile === "전체" ? "프로필: 전체" : filterProfile}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">프로필: 전체</SelectItem>
            {profiles.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
          <SelectTrigger className="w-[120px] h-8 text-sm">
            <span className="truncate">{filterStatus === "전체" ? "상태: 전체" : filterStatus}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">상태: 전체</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{sorted.length}건</span>
        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              {STATUS_OPTIONS.map((s) => (
                <Button key={s} size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleBulkStatus(s)}>
                  → {s} ({selectedIds.size})
                </Button>
              ))}
              <Button
                size="sm" variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  const emails = state.youtubeChannels
                    .filter((c) => selectedIds.has(c.id) && c.email)
                    .map((c) => c.email);
                  if (emails.length === 0) { toast.error("이메일이 없습니다"); return; }
                  navigator.clipboard.writeText(emails.join(", "));
                  toast.success(`${emails.length}개 이메일 복사됨`);
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />이메일 복사 ({selectedIds.size})
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />삭제 ({selectedIds.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 가상화 테이블 */}
      <div ref={scrollRef} className="border rounded flex-1 min-h-0 overflow-auto">
        {/* 헤더 */}
        <div
          className="sticky top-0 z-10 grid items-center bg-[#f8f9fa] border-b text-xs font-semibold text-muted-foreground select-none"
          style={{ gridTemplateColumns: GRID, minWidth: MIN_W }}
        >
          <div className="px-1 flex justify-center border-r border-gray-200 cursor-pointer" onClick={toggleAll}>
            <Checkbox checked={sorted.length > 0 && selectedIds.size === sorted.length} />
          </div>
          <HeaderCell label="상태" col="status" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="프로필" col="profile" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="키워드" col="keyword" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="채널명" col="channel_name" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="구독자" col="subscriber_count" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="이메일" col="email" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="메모" col="memo" sk={sortKey} sd={sortDir} onSort={handleSort} />
          <HeaderCell label="" last />
        </div>

        {/* 본문 */}
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">수집된 채널이 없습니다.</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", minWidth: MIN_W }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const ch = sorted[vRow.index];
              return (
                <div
                  key={ch.id}
                  className={`grid items-center border-b text-sm ${
                    ROW_BG[ch.status] || "bg-white"
                  } hover:brightness-95`}
                  style={{
                    position: "absolute", top: 0, left: 0, right: 0,
                    height: ROW_H, gridTemplateColumns: GRID,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <div
                    className="px-1 flex justify-center border-r border-gray-200/60 select-none"
                    onClick={(e) => { e.stopPropagation(); handleRowClick(ch.id, e); }}
                    onMouseDown={(e) => { e.stopPropagation(); if (!e.shiftKey) e.preventDefault(); handleMouseDown(ch.id, e); }}
                    onMouseEnter={() => handleMouseEnter(ch.id)}
                  >
                    <Checkbox checked={selectedIds.has(ch.id)} tabIndex={-1} />
                  </div>
                  <div className="px-2 flex items-center gap-1 border-r border-gray-200/60" onClick={(e) => e.stopPropagation()}>
                    <Badge
                      className={`text-xs px-1.5 py-0 cursor-pointer hover:ring-2 hover:ring-primary/30 transition whitespace-nowrap ${STATUS_COLORS[ch.status as keyof typeof STATUS_COLORS] || ""}`}
                      onClick={(e) => handleStatusClick(e, ch)}
                    >
                      {ch.status}
                    </Badge>
                    {ch.instructor_id && (
                      <span className="text-[10px] text-emerald-600 font-medium" title="컨택관리 연동됨">연동</span>
                    )}
                  </div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 overflow-hidden"><span className="truncate">{ch.profile}</span></div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{ch.keyword}</span></div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 font-medium overflow-hidden"><span className="truncate">{ch.channel_name}</span></div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{ch.subscriber_count}</span></div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{ch.email}</span></div>
                  <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    {editingMemo?.id === ch.id ? (
                      <div className="flex items-center gap-1 w-full">
                        <Input
                          className="h-6 text-xs flex-1"
                          value={editingMemo.memo}
                          onChange={(e) => setEditingMemo({ ...editingMemo, memo: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleMemoSave(ch.id, editingMemo.memo);
                            if (e.key === "Escape") setEditingMemo(null);
                          }}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <span
                        className="truncate cursor-pointer hover:text-foreground"
                        onClick={() => setEditingMemo({ id: ch.id, memo: ch.memo })}
                      >
                        {ch.memo || "-"}
                      </span>
                    )}
                  </div>
                  <div className="px-2 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    {ch.channel_url && (
                      <a href={ch.channel_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingStatus && (
        <StatusPopover
          channel={editingStatus.channel}
          x={editingStatus.x}
          y={editingStatus.y}
          onConfirm={handleStatusChange}
          onClose={() => setEditingStatus(null)}
        />
      )}
    </div>
  );
}

/* ── 헤더 셀 ── */
function HeaderCell({ label, col, sk, sd, onSort, last }: {
  label: string; col?: SortKey; sk?: SortKey; sd?: SortDir;
  onSort?: (k: SortKey) => void; last?: boolean;
}) {
  const active = col && sk === col;
  return (
    <div
      className={`px-2 py-2.5 whitespace-nowrap flex items-center ${!last ? "border-r border-gray-200" : ""} ${col ? "cursor-pointer hover:bg-gray-200/50" : ""}`}
      onClick={() => col && onSort?.(col)}
    >
      {label}
      {active && (sd === "asc" ? <ChevronUp className="h-3.5 w-3.5 ml-0.5" /> : <ChevronDown className="h-3.5 w-3.5 ml-0.5" />)}
    </div>
  );
}

/* ── 상태 변경 팝오버 ── */
function StatusPopover({ channel, x, y, onConfirm, onClose }: {
  channel: YouTubeChannel;
  x: number; y: number;
  onConfirm: (id: string, status: YouTubeChannelStatus) => Promise<void>;
  onClose: () => void;
}) {
  const nextStatuses = STATUS_OPTIONS.filter(s => s !== channel.status);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const popW = 180;
  const adjustedX = Math.min(x, window.innerWidth - popW - 16);
  const adjustedY = y + 160 > window.innerHeight ? y - 160 - 8 : y;

  const handleSelect = async (status: YouTubeChannelStatus) => {
    setSaving(true);
    await onConfirm(channel.id, status);
    setSaving(false);
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border rounded-lg shadow-lg p-3 space-y-2"
      style={{ left: adjustedX, top: adjustedY, width: popW }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">
          {channel.channel_name} 상태 변경
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1">
        {nextStatuses.map(s => (
          <button
            key={s}
            onClick={() => handleSelect(s)}
            disabled={saving}
            className={`w-full text-left px-3 py-1.5 rounded text-sm font-medium transition-colors hover:ring-1 hover:ring-primary/30 ${STATUS_COLORS[s]}`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
