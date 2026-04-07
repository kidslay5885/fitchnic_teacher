"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import type { YouTubeChannel, YouTubeChannelStatus } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Trash2, ExternalLink, Check } from "lucide-react";

const STATUS_OPTIONS: YouTubeChannelStatus[] = ["미검토", "검토완료", "컨택대상", "제외"];

const STATUS_COLOR: Record<YouTubeChannelStatus, string> = {
  "미검토": "bg-gray-100 text-gray-700",
  "검토완료": "bg-blue-100 text-blue-700",
  "컨택대상": "bg-green-100 text-green-700",
  "제외": "bg-red-100 text-red-700",
};

export default function YouTubeChannelsTab() {
  const { state, dispatch, loadYoutubeChannels } = useOutreach();
  const [search, setSearch] = useState("");
  const [filterProfile, setFilterProfile] = useState("전체");
  const [filterStatus, setFilterStatus] = useState<YouTubeChannelStatus | "전체">("전체");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (state.youtubeChannels.length === 0) loadYoutubeChannels();
  }, []);

  // 고유 프로필 목록
  const profiles = useMemo(() => {
    const set = new Set(state.youtubeChannels.map((c) => c.profile).filter(Boolean));
    return ["전체", ...Array.from(set).sort()];
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

  // 상태별 카운트
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { 전체: state.youtubeChannels.length };
    for (const c of state.youtubeChannels) {
      counts[c.status] = (counts[c.status] || 0) + 1;
    }
    return counts;
  }, [state.youtubeChannels]);

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
    } catch {
      toast.error("상태 변경 실패");
    }
  }, [state.youtubeChannels, dispatch]);

  // 메모 변경
  const handleMemoChange = useCallback(async (id: string, memo: string) => {
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

  // 전체 선택
  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">YouTube 채널 수집</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {STATUS_OPTIONS.map((s) => (
            <span key={s}>
              {s}: <strong>{statusCounts[s] || 0}</strong>
            </span>
          ))}
          <span className="ml-2">전체: <strong>{state.youtubeChannels.length}</strong></span>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-[240px]">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="채널명, 이메일, 키워드 검색..."
            className="h-8 text-sm pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="h-8 text-sm border rounded-md px-2 bg-background"
          value={filterProfile}
          onChange={(e) => setFilterProfile(e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          className="h-8 text-sm border rounded-md px-2 bg-background"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
        >
          <option value="전체">상태: 전체</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length}건 표시
        </span>
      </div>

      {/* 일괄 액션 바 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
          <span className="text-sm font-medium">{selectedIds.size}건 선택</span>
          <div className="flex gap-1 ml-2">
            {STATUS_OPTIONS.map((s) => (
              <Button key={s} size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkStatus(s)}>
                → {s}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="destructive" className="h-7 text-xs ml-auto" onClick={handleBulkDelete}>
            <Trash2 className="h-3 w-3 mr-1" />삭제
          </Button>
        </div>
      )}

      {/* 테이블 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="py-2 w-10">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
              </TableHead>
              <TableHead className="py-2 text-xs font-semibold">상태</TableHead>
              <TableHead className="py-2 text-xs font-semibold">프로필</TableHead>
              <TableHead className="py-2 text-xs font-semibold">키워드</TableHead>
              <TableHead className="py-2 text-xs font-semibold">채널명</TableHead>
              <TableHead className="py-2 text-xs font-semibold">구독자</TableHead>
              <TableHead className="py-2 text-xs font-semibold">이메일</TableHead>
              <TableHead className="py-2 text-xs font-semibold">메모</TableHead>
              <TableHead className="py-2 text-xs font-semibold w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">
                  수집된 채널이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((ch, idx) => (
                <ChannelRow
                  key={ch.id}
                  channel={ch}
                  odd={idx % 2 === 1}
                  selected={selectedIds.has(ch.id)}
                  onToggle={() => toggleOne(ch.id)}
                  onStatusChange={handleStatusChange}
                  onMemoChange={handleMemoChange}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// 개별 행 컴포넌트 (메모 인라인 편집 포함)
function ChannelRow({
  channel: ch,
  odd,
  selected,
  onToggle,
  onStatusChange,
  onMemoChange,
}: {
  channel: YouTubeChannel;
  odd: boolean;
  selected: boolean;
  onToggle: () => void;
  onStatusChange: (id: string, status: YouTubeChannelStatus) => void;
  onMemoChange: (id: string, memo: string) => void;
}) {
  const [editingMemo, setEditingMemo] = useState(false);
  const [memo, setMemo] = useState(ch.memo);

  const saveMemo = () => {
    if (memo !== ch.memo) onMemoChange(ch.id, memo);
    setEditingMemo(false);
  };

  return (
    <TableRow className={odd ? "bg-muted/20" : ""}>
      <TableCell className="py-1.5">
        <input type="checkbox" checked={selected} onChange={onToggle} className="rounded" />
      </TableCell>
      <TableCell className="py-1.5">
        <select
          className={`text-xs rounded px-1.5 py-0.5 border-0 font-medium ${STATUS_COLOR[ch.status as YouTubeChannelStatus] || ""}`}
          value={ch.status}
          onChange={(e) => onStatusChange(ch.id, e.target.value as YouTubeChannelStatus)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </TableCell>
      <TableCell className="py-1.5 text-xs">{ch.profile}</TableCell>
      <TableCell className="py-1.5 text-xs text-muted-foreground">{ch.keyword}</TableCell>
      <TableCell className="py-1.5 text-sm font-medium">{ch.channel_name}</TableCell>
      <TableCell className="py-1.5 text-xs">{ch.subscriber_count}</TableCell>
      <TableCell className="py-1.5 text-xs text-muted-foreground">{ch.email}</TableCell>
      <TableCell className="py-1.5">
        {editingMemo ? (
          <div className="flex gap-1">
            <Input
              className="h-6 text-xs"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveMemo(); if (e.key === "Escape") setEditingMemo(false); }}
              autoFocus
            />
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveMemo}>
              <Check className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <span
            className="text-xs text-muted-foreground cursor-pointer hover:text-foreground min-w-[60px] inline-block"
            onClick={() => { setMemo(ch.memo); setEditingMemo(true); }}
          >
            {ch.memo || "-"}
          </span>
        )}
      </TableCell>
      <TableCell className="py-1.5">
        {ch.channel_url && (
          <a href={ch.channel_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </TableCell>
    </TableRow>
  );
}
