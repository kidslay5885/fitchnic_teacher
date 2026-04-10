"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STATUSES, STATUS_COLORS, ASSIGNEES, SOURCES } from "@/lib/constants";
import type { Instructor, InstructorStatus, YouTubeChannel } from "@/lib/types";
import { Search, ChevronUp, ChevronDown, AlertTriangle, Ban, CheckCircle2, Plus, Minus, RotateCcw, X } from "lucide-react";

type SubTab = "instructors" | "youtube-channels";
const YT_GRID = "84px 1fr 1fr 80px 1.2fr 1.5fr";
const YT_MIN_W = 700;
import { toast } from "sonner";

type SortKey = "name" | "status" | "field" | "assignee" | "source" | "has_lecture_history" | "lecture_platform" | "email" | "created_at";
type SortDir = "asc" | "desc";

const DEFAULT_SORT_KEY: SortKey = "created_at";
const DEFAULT_SORT_DIR: SortDir = "desc";

// 편집 거리 (Levenshtein) - 유사도 체크용
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

const ROW_H = 36;
// 상태 | 찾은 사람 | 분야 | 강사명 | 강의 여부 | 플랫폼 | 유튜브 | 인스타 | 참조 | 이메일 | 메모
const GRID = "84px 72px 1.2fr 1fr 64px 1fr 48px 48px 48px 1.2fr 1.5fr";
const MIN_W = 940;

const ROW_BG: Record<string, string> = {
  미검토: "bg-gray-50",
  "컨펌 필요": "bg-yellow-50",
  "발송 예정": "bg-blue-50",
  "진행 중": "bg-indigo-50",
  "계약 완료": "bg-green-50",
  제외: "bg-red-50",
  보류: "bg-orange-50",
  거절: "bg-rose-50",
};

export default function SubmitPage() {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InstructorStatus | "전체">("전체");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("전체");
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("instructors");
  const [ytChannels, setYtChannels] = useState<YouTubeChannel[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 강사 목록 로드
  const loadInstructors = useCallback(async () => {
    try {
      const res = await fetch("/api/instructors");
      if (!res.ok) throw new Error("로드 실패");
      const data = await res.json();
      setInstructors(data);
    } catch {
      toast.error("강사 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInstructors(); }, [loadInstructors]);

  // YT채널수집 데이터 로드
  const loadYtChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/youtube-channels");
      if (!res.ok) return;
      const data = await res.json();
      setYtChannels(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => { loadYtChannels(); }, [loadYtChannels]);

  // 경량 동기화: 15초마다 변경 여부 확인 후 필요할 때만 리로드
  useEffect(() => {
    let syncRef = { count: 0, ts: "" };
    const checkSync = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/sync");
        if (!res.ok) return;
        const { count, latest_updated_at } = await res.json();
        if (syncRef.count !== count || syncRef.ts !== latest_updated_at) {
          syncRef = { count, ts: latest_updated_at };
          loadInstructors();
        }
      } catch {}
    };
    fetch("/api/sync").then(r => r.json()).then(d => {
      syncRef = { count: d.count, ts: d.latest_updated_at };
    }).catch(() => {});
    const interval = setInterval(checkSync, 15000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkSync();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadInstructors]);

  // 필터 + 금지 제외
  // 찾은 사람 목록 (실제 데이터 기반)
  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    instructors.forEach((i) => { if (i.assignee) set.add(i.assignee); });
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [instructors]);

  const filtered = useMemo(() => {
    return instructors.filter((i) => {
      if (i.is_banned) return false;
      if (statusFilter !== "전체" && i.status !== statusFilter) return false;
      if (assigneeFilter !== "전체" && i.assignee !== assigneeFilter) return false;
      if (search) {
        const q = search.toLowerCase().replace(/\s/g, "");
        const strip = (s?: string) => s?.toLowerCase().replace(/\s/g, "") || "";
        return (
          strip(i.name).includes(q) ||
          strip(i.email).includes(q) ||
          strip(i.field).includes(q) ||
          strip(i.lecture_platform).includes(q)
        );
      }
      return true;
    });
  }, [instructors, search, statusFilter, assigneeFilter]);

  // 정렬
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "created_at") {
        const at = new Date(a.created_at || 0).getTime();
        const bt = new Date(b.created_at || 0).getTime();
        return sortDir === "asc" ? at - bt : bt - at;
      }
      const av = (a[sortKey] || "") as string;
      const bv = (b[sortKey] || "") as string;
      const cmp = av.localeCompare(bv, "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // YT채널수집 필터+정렬
  const ytFiltered = useMemo(() => {
    return ytChannels.filter((ch) => {
      if (search) {
        const q = search.toLowerCase().replace(/\s/g, "");
        const strip = (s?: string) => s?.toLowerCase().replace(/\s/g, "") || "";
        return (
          strip(ch.channel_name).includes(q) ||
          strip(ch.email).includes(q) ||
          strip(ch.keyword).includes(q)
        );
      }
      return true;
    });
  }, [ytChannels, search]);

  const ytSorted = useMemo(() => {
    return [...ytFiltered].sort((a, b) => {
      const at = new Date(a.created_at || 0).getTime();
      const bt = new Date(b.created_at || 0).getTime();
      return bt - at;
    });
  }, [ytFiltered]);

  const isDefaultSort = sortKey === DEFAULT_SORT_KEY && sortDir === DEFAULT_SORT_DIR;
  const resetSort = useCallback(() => {
    setSortKey(DEFAULT_SORT_KEY);
    setSortDir(DEFAULT_SORT_DIR);
  }, []);

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

  // 중복 강사 위치로 스크롤 + 하이라이트
  const scrollToInstructor = useCallback((id: string) => {
    const idx = sorted.findIndex((i) => i.id === id);
    if (idx === -1) return;
    virtualizer.scrollToIndex(idx, { align: "center" });
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 2000);
  }, [sorted, virtualizer]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* 헤더 */}
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h1 className="text-xl font-bold">강사 모집</h1>
        <p className="text-sm text-muted-foreground mt-1">강사를 검색하고 새로운 강사를 추가할 수 있습니다.</p>
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-2 flex-wrap px-6 pb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름, 이메일, 분야 검색..."
            className="h-8 text-sm pl-8 w-[220px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <span className="text-muted-foreground">상태:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">전체</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-[150px] h-8 text-sm">
            <span className="text-muted-foreground">찾은 사람:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="전체">전체</SelectItem>
            {assigneeOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{sorted.length}명</span>
        {!isDefaultSort && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={resetSort}>
            <RotateCcw className="h-3 w-3 mr-1" />정렬 초기화
          </Button>
        )}
      </div>

      {/* 메인: 왼쪽 테이블 + 오른쪽 입력 폼 */}
      <div className="flex flex-1 min-h-0 px-6 pb-6 gap-5">
        {/* 왼쪽 — 테이블 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 서브탭 */}
          <div className="flex border-b mb-0">
            <button
              onClick={() => setSubTab("instructors")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                subTab === "instructors"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              강사모집
            </button>
            <button
              onClick={() => setSubTab("youtube-channels")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                subTab === "youtube-channels"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              YT채널수집
            </button>
          </div>

          {subTab === "instructors" ? (
          <div ref={scrollRef} className="border rounded flex-1 min-h-0 overflow-auto">
            <div
              className="sticky top-0 z-10 grid items-center bg-[#f8f9fa] border-b text-xs font-semibold text-muted-foreground select-none"
              style={{ gridTemplateColumns: GRID, minWidth: MIN_W }}
            >
              <SortHeader label="상태" col="status" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <SortHeader label="찾은 사람" col="assignee" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <SortHeader label="분야" col="field" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <SortHeader label="강사명" col="name" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <SortHeader label="강의" col="has_lecture_history" sk={sortKey} sd={sortDir} onSort={handleSort} center />
              <SortHeader label="플랫폼" col="lecture_platform" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <div className="px-1 py-2.5 border-r border-gray-200 text-center whitespace-nowrap">유튜브</div>
              <div className="px-1 py-2.5 border-r border-gray-200 text-center whitespace-nowrap">인스타</div>
              <div className="px-1 py-2.5 border-r border-gray-200 text-center whitespace-nowrap">참조</div>
              <SortHeader label="이메일" col="email" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <SortHeader label="메모" last />
            </div>

            {sorted.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">데이터가 없습니다.</div>
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), position: "relative", minWidth: MIN_W }}>
                {virtualizer.getVirtualItems().map((vRow) => {
                  const i = sorted[vRow.index];
                  const igUrl = i.instagram ? (i.instagram.startsWith("http") ? i.instagram : `https://instagram.com/${i.instagram}`) : "";
                  return (
                    <div
                      key={i.id}
                      className={`grid items-center border-b text-sm cursor-pointer hover:bg-blue-50/50 ${editingInstructor?.id === i.id ? "!bg-blue-100 ring-2 ring-blue-400 ring-inset" : highlightId === i.id ? "!bg-yellow-200 ring-2 ring-yellow-400 ring-inset transition-all duration-300" : ROW_BG[i.status] || "bg-white"}`}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, height: ROW_H, gridTemplateColumns: GRID, transform: `translateY(${vRow.start}px)` }}
                      onClick={() => setEditingInstructor(i)}
                    >
                      <div className="px-2 flex items-center border-r border-gray-200/60">
                        <Badge className={`text-xs px-1.5 py-0 whitespace-nowrap ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>
                          {i.status}
                        </Badge>
                      </div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.assignee}</span></div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 overflow-hidden"><span className="truncate">{i.field}</span></div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 font-medium overflow-hidden">
                        <span className="truncate">{i.name}</span>
                        {i.is_banned && <span className="text-red-500 ml-1 text-xs shrink-0">[금지]</span>}
                      </div>
                      <div className="px-2 flex items-center justify-center border-r border-gray-200/60 text-muted-foreground">{i.has_lecture_history}</div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden">
                        {i.lecture_platform_url ? (
                          <a href={i.lecture_platform_url} target="_blank" rel="noopener noreferrer" className="truncate text-blue-600 hover:underline">{i.lecture_platform}</a>
                        ) : (
                          <span className="truncate">{i.lecture_platform}</span>
                        )}
                      </div>
                      <div className="px-2 flex items-center border-r border-gray-200/60">
                        {i.youtube ? <a href={i.youtube} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">링크</a> : ""}
                      </div>
                      <div className="px-2 flex items-center border-r border-gray-200/60">
                        {igUrl ? <a href={igUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">링크</a> : ""}
                      </div>
                      <div className="px-2 flex items-center gap-0.5 border-r border-gray-200/60 overflow-hidden">
                        {i.ref_link ? i.ref_link.split(/\s*,\s*/).filter(Boolean).map((link, idx) => (
                          <span key={idx} className="shrink-0">
                            {idx > 0 && <span className="text-muted-foreground text-xs">,</span>}
                            <a href={link.trim()} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">링크{i.ref_link!.split(/\s*,\s*/).filter(Boolean).length > 1 ? idx + 1 : ""}</a>
                          </span>
                        )) : ""}
                      </div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.email}</span></div>
                      <div className="px-2 flex items-center text-muted-foreground overflow-hidden"><span className="truncate">{i.notes}</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : (
          /* YT채널수집 테이블 */
          <div className="border rounded flex-1 min-h-0 overflow-auto">
            <div
              className="sticky top-0 z-10 grid items-center bg-[#f8f9fa] border-b text-xs font-semibold text-muted-foreground select-none"
              style={{ gridTemplateColumns: YT_GRID, minWidth: YT_MIN_W }}
            >
              <div className="px-2 py-2.5 border-r border-gray-200">상태</div>
              <div className="px-2 py-2.5 border-r border-gray-200">키워드</div>
              <div className="px-2 py-2.5 border-r border-gray-200">채널명</div>
              <div className="px-2 py-2.5 border-r border-gray-200">구독자</div>
              <div className="px-2 py-2.5 border-r border-gray-200">이메일</div>
              <div className="px-2 py-2.5">메모</div>
            </div>

            {ytSorted.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">데이터가 없습니다.</div>
            ) : (
              <div>
                {ytSorted.map((ch, idx) => (
                  <div
                    key={ch.id}
                    className={`grid items-center border-b text-sm ${highlightId === ch.id ? "!bg-yellow-200 ring-2 ring-yellow-400 ring-inset transition-all duration-300" : idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}`}
                    style={{ gridTemplateColumns: YT_GRID, minWidth: YT_MIN_W, height: ROW_H }}
                  >
                    <div className="px-2 flex items-center border-r border-gray-200/60">
                      <Badge className="text-xs px-1.5 py-0 whitespace-nowrap">{ch.status}</Badge>
                    </div>
                    <div className="px-2 flex items-center border-r border-gray-200/60 overflow-hidden"><span className="truncate">{ch.keyword}</span></div>
                    <div className="px-2 flex items-center border-r border-gray-200/60 font-medium overflow-hidden">
                      {ch.channel_url ? (
                        <a href={ch.channel_url} target="_blank" rel="noopener noreferrer" className="truncate text-blue-600 hover:underline">{ch.channel_name}</a>
                      ) : (
                        <span className="truncate">{ch.channel_name}</span>
                      )}
                    </div>
                    <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{ch.subscriber_count}</span></div>
                    <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{ch.email}</span></div>
                    <div className="px-2 flex items-center text-muted-foreground overflow-hidden"><span className="truncate">{ch.memo}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        {/* 오른쪽 — 강사 추가 폼 */}
        <div className="w-[480px] shrink-0">
          <SubmitForm
            instructors={instructors}
            ytChannels={ytChannels}
            onAdded={(inst) => setInstructors((prev) => [...prev, inst])}
            onUpdated={(inst) => setInstructors((prev) => prev.map((p) => p.id === inst.id ? inst : p))}
            onScrollTo={scrollToInstructor}
            onNameChange={setSearch}
            editing={editingInstructor}
            onCancelEdit={() => setEditingInstructor(null)}
          />
        </div>
      </div>
    </div>
  );
}

/* ── 정렬 헤더 ── */
function SortHeader({ label, col, sk, sd, onSort, center, last }: {
  label: string; col?: SortKey; sk?: SortKey; sd?: SortDir;
  onSort?: (k: SortKey) => void; center?: boolean; last?: boolean;
}) {
  const active = col && sk === col;
  return (
    <div
      className={`px-2 py-2.5 whitespace-nowrap flex items-center ${!last ? "border-r border-gray-200" : ""} ${center ? "justify-center" : ""} ${col ? "cursor-pointer hover:bg-gray-200/50" : ""}`}
      onClick={() => col && onSort?.(col)}
    >
      {label}
      {active && (sd === "asc" ? <ChevronUp className="h-3.5 w-3.5 ml-0.5" /> : <ChevronDown className="h-3.5 w-3.5 ml-0.5" />)}
    </div>
  );
}

/* ── 강사 추가/수정 폼 ── */
function SubmitForm({ instructors, ytChannels, onAdded, onUpdated, onScrollTo, onNameChange, editing, onCancelEdit }: {
  instructors: Instructor[];
  ytChannels: YouTubeChannel[];
  onAdded: (inst: Instructor) => void;
  onUpdated: (inst: Instructor) => void;
  onScrollTo: (id: string) => void;
  onNameChange: (name: string) => void;
  editing: Instructor | null;
  onCancelEdit: () => void;
}) {
  const emptyForm = {
    name: "", field: "", assignee: "", email: "",
    instagram: "", youtube: "", phone: "", ref_link: "",
    has_lecture_history: "", lecture_platform: "", lecture_platform_url: "",
    source: "강사모집" as string, notes: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [refLinks, setRefLinks] = useState<string[]>([""]);
  const [urlTitles, setUrlTitles] = useState<Record<string, string>>({});
  const [urlLoading, setUrlLoading] = useState<Record<string, boolean>>({});

  // 수정 모드: editing 변경 시 폼에 데이터 채우기
  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name || "",
        field: editing.field || "",
        assignee: editing.assignee || "",
        email: editing.email || "",
        instagram: editing.instagram || "",
        youtube: editing.youtube || "",
        phone: editing.phone || "",
        ref_link: editing.ref_link || "",
        has_lecture_history: editing.has_lecture_history || "",
        lecture_platform: editing.lecture_platform || "",
        lecture_platform_url: editing.lecture_platform_url || "",
        source: editing.source || "강사모집",
        notes: editing.notes || "",
      });
      setRefLinks(editing.ref_link ? editing.ref_link.split(/\s*,\s*/).filter(Boolean) : [""]);
      setUrlTitles({});
    }
  }, [editing]);

  // URL 제목 가져오기 (디바운스) - youtube, instagram
  useEffect(() => {
    const fields = ["youtube", "instagram"] as const;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const key of fields) {
      let url = form[key].trim();
      if (!url) {
        setUrlTitles((prev) => ({ ...prev, [key]: "" }));
        setUrlLoading((prev) => ({ ...prev, [key]: false }));
        continue;
      }
      if (key === "instagram" && !url.startsWith("http")) {
        url = `https://instagram.com/${url.replace(/^@/, "")}`;
      }
      if (!url.startsWith("http")) continue;
      setUrlLoading((prev) => ({ ...prev, [key]: true }));
      const t = setTimeout(async () => {
        try {
          const res = await fetch(`/api/url-title?url=${encodeURIComponent(url)}`);
          const { title } = await res.json();
          setUrlTitles((prev) => ({ ...prev, [key]: title || "" }));
        } catch {
          setUrlTitles((prev) => ({ ...prev, [key]: "" }));
        } finally {
          setUrlLoading((prev) => ({ ...prev, [key]: false }));
        }
      }, 500);
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
  }, [form.youtube, form.instagram]);

  // URL 제목 가져오기 (디바운스) - 추가 링크들
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    refLinks.forEach((link, idx) => {
      const key = `ref_${idx}`;
      const url = link.trim();
      if (!url || !url.startsWith("http")) {
        setUrlTitles((prev) => ({ ...prev, [key]: "" }));
        setUrlLoading((prev) => ({ ...prev, [key]: false }));
        return;
      }
      setUrlLoading((prev) => ({ ...prev, [key]: true }));
      const t = setTimeout(async () => {
        try {
          const res = await fetch(`/api/url-title?url=${encodeURIComponent(url)}`);
          const { title } = await res.json();
          setUrlTitles((prev) => ({ ...prev, [key]: title || "" }));
        } catch {
          setUrlTitles((prev) => ({ ...prev, [key]: "" }));
        } finally {
          setUrlLoading((prev) => ({ ...prev, [key]: false }));
        }
      }, 500);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [refLinks]);

  // 강사명 입력 시 왼쪽 테이블 검색어 연동 (추가 모드에서만)
  useEffect(() => {
    if (!editing) onNameChange(form.name.trim());
  }, [form.name, onNameChange, editing]);

  // 실시간 중복/금지/유사 체크 (instructors + youtube_channels)
  const nameCheck = useMemo(() => {
    const name = form.name.trim();
    if (!name) return null;
    // 공백 제거 후 비교 (예: "감동 상영관" === "감동상영관")
    const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    const normalized = normalize(name);

    // instructors 중복 체크
    const duplicates = instructors.filter((i) =>
      normalize(i.name) === normalized && (!editing || i.id !== editing.id)
    );
    if (duplicates.length > 0) {
      const banned = duplicates.some((d) => d.is_banned);
      if (banned) return { type: "banned" as const, matches: duplicates, source: "instructors" as const };
      return { type: "duplicate" as const, matches: duplicates, source: "instructors" as const };
    }

    // youtube_channels 중복 체크 (channel_name 기준)
    const ytDuplicates = ytChannels.filter((ch) =>
      normalize(ch.channel_name) === normalized
    );
    if (ytDuplicates.length > 0) {
      // YT채널 매칭 정보를 instructor 형태로 변환하여 표시
      const ytMatches = ytDuplicates.map((ch) => ({
        id: ch.id,
        name: ch.channel_name,
        field: ch.keyword,
        status: ch.status,
        is_banned: false,
        assignee: "",
      })) as any[];
      return { type: "duplicate" as const, matches: ytMatches, source: "youtube_channels" as const };
    }

    // 유사도 체크: instructors
    if (normalized.length >= 2) {
      const similars = instructors.filter((i) => {
        if (editing && i.id === editing.id) return false;
        const n = normalize(i.name);
        if (n === normalized) return false;
        if (n.includes(normalized) || normalized.includes(n)) return true;
        const maxLen = Math.max(n.length, normalized.length);
        const threshold = maxLen <= 3 ? 1 : 2;
        return editDistance(n, normalized) <= threshold;
      });
      if (similars.length > 0) return { type: "similar" as const, matches: similars, source: "instructors" as const };

      // 유사도 체크: youtube_channels
      const ytSimilars = ytChannels.filter((ch) => {
        const n = normalize(ch.channel_name);
        if (n === normalized) return false;
        if (n.includes(normalized) || normalized.includes(n)) return true;
        const maxLen = Math.max(n.length, normalized.length);
        const threshold = maxLen <= 3 ? 1 : 2;
        return editDistance(n, normalized) <= threshold;
      });
      if (ytSimilars.length > 0) {
        const ytMatches = ytSimilars.map((ch) => ({
          id: ch.id,
          name: ch.channel_name,
          field: ch.keyword,
          status: ch.status,
          is_banned: false,
          assignee: "",
        })) as any[];
        return { type: "similar" as const, matches: ytMatches, source: "youtube_channels" as const };
      }
    }
    return { type: "ok" as const };
  }, [form.name, instructors, ytChannels, editing]);

  // 중복/금지 감지 시 자동 스크롤
  useEffect(() => {
    if (nameCheck && nameCheck.type !== "ok" && nameCheck.matches.length > 0) {
      onScrollTo(nameCheck.matches[0].id);
    }
  }, [nameCheck, onScrollTo]);

  const resetForm = () => {
    setForm(emptyForm);
    setRefLinks([""]);
    setUrlTitles({});
    onNameChange("");
    onCancelEdit();
  };

  const handleSubmit = async (force = false) => {
    if (!form.name.trim()) { toast.error("강사 이름을 입력하세요."); return; }
    if (!editing && nameCheck?.type === "banned") { toast.error("연락 금지 대상입니다. 추가할 수 없습니다."); return; }
    if (!editing && nameCheck?.type === "duplicate" && !force) return;
    setSaving(true);
    try {
      const payload = { ...form, ref_link: refLinks.filter((l) => l.trim()).join(" , ") };
      if (editing) {
        // 수정 모드
        const res = await fetch(`/api/instructors/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, _expected_updated_at: editing.updated_at }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast.success(`${form.name} 수정 완료`);
        onUpdated(data);
        resetForm();
      } else {
        // 추가 모드
        const res = await fetch("/api/instructors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, _force: force }),
        });
        const data = await res.json();
        if (data.warning === "duplicate_name" && !force) return;
        if (!res.ok && !data.warning) throw new Error(data.error);
        toast.success(`${form.name} 추가 완료`);
        onAdded(data);
        resetForm();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg bg-white h-full overflow-y-auto flex flex-col">
      <div className="p-4 space-y-4 flex-1 overflow-y-auto">

      {/* 모드 표시 헤더 */}
      {editing && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2">
          <span className="text-sm font-medium text-blue-700">수정 모드: {editing.name}</span>
          <button onClick={resetForm} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
            <X className="h-3.5 w-3.5" />취소
          </button>
        </div>
      )}

      <div className="space-y-3">
        {/* 찾은 사람 */}
        <div className="relative">
          <Label className="text-xs">찾은 사람</Label>
          <Input
            value={form.assignee}
            onChange={(e) => setForm({ ...form, assignee: e.target.value })}
            className="h-8 text-sm"
            placeholder="본인 이름 입력"
          />
          {form.assignee && !ASSIGNEES.includes(form.assignee) && (
            <div className="absolute z-10 mt-0.5 w-full bg-white border rounded shadow-md">
              {ASSIGNEES.filter((a) => a.includes(form.assignee)).map((a) => (
                <button
                  key={a}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
                  onClick={() => setForm({ ...form, assignee: a })}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 분야 */}
        <div>
          <Label className="text-xs">분야</Label>
          <Input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} className="h-8 text-sm" />
        </div>

        {/* 강사명 + 실시간 중복 체크 */}
        <div>
          <Label className="text-xs">강사명 *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-8 text-sm"
            placeholder="강사 이름"
          />
          {nameCheck?.type === "ok" && form.name.trim() && (
            <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />등록 가능
            </div>
          )}
          {nameCheck?.type === "banned" && (
            <div className="mt-1.5 rounded border border-red-300 bg-red-50 p-2 space-y-1">
              <div className="flex items-center gap-1 text-xs text-red-700 font-semibold">
                <Ban className="h-3.5 w-3.5" />연락 금지 대상
              </div>
              {nameCheck.matches.map((d) => (
                <div key={d.id} className="text-xs text-red-600 bg-red-100 rounded px-2 py-1">
                  {d.name} {d.field && `| ${d.field}`} | {d.status}
                </div>
              ))}
            </div>
          )}
          {nameCheck?.type === "duplicate" && (
            <div className="mt-1.5 rounded border border-orange-300 bg-orange-50 p-2 space-y-1">
              <div className="flex items-center gap-1 text-xs text-orange-700 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />이미 등록된 이름
                {nameCheck.source === "youtube_channels" && <span className="text-orange-500 font-normal">(YT채널수집)</span>}
              </div>
              {nameCheck.matches.map((d) => (
                <div key={d.id} className="text-xs text-orange-600 bg-orange-100 rounded px-2 py-1">
                  {d.name} {d.field && `| ${d.field}`} | {d.status}
                </div>
              ))}
            </div>
          )}
          {nameCheck?.type === "similar" && (
            <div className="mt-1.5 rounded border border-yellow-300 bg-yellow-50 p-2 space-y-1">
              <div className="flex items-center gap-1 text-xs text-yellow-700 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />비슷한 이름이 있습니다
                {nameCheck.source === "youtube_channels" && <span className="text-yellow-500 font-normal">(YT채널수집)</span>}
              </div>
              {nameCheck.matches.map((d) => (
                <div key={d.id} className="text-xs text-yellow-600 bg-yellow-100 rounded px-2 py-1 cursor-pointer hover:bg-yellow-200" onClick={() => nameCheck.source === "instructors" && onScrollTo(d.id)}>
                  {d.name} {d.field && `| ${d.field}`} | {d.status}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 강의 여부 */}
        <div>
          <Label className="text-xs">강의 여부</Label>
          <div className="flex gap-1.5 mt-1">
            {["O", "X", "?"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setForm({ ...form, has_lecture_history: form.has_lecture_history === v ? "" : v })}
                className={`h-8 w-10 rounded border text-sm font-medium transition-colors ${
                  form.has_lecture_history === v
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-muted-foreground border-gray-200 hover:border-gray-400"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* 강의 플랫폼 */}
        <div>
          <Label className="text-xs">강의 플랫폼</Label>
          <Input
            value={form.lecture_platform}
            onChange={(e) => setForm({ ...form, lecture_platform: e.target.value })}
            className="h-8 text-sm"
            placeholder="플랫폼 이름"
          />
          <Input
            value={form.lecture_platform_url}
            onChange={(e) => setForm({ ...form, lecture_platform_url: e.target.value })}
            className="h-8 text-sm mt-1.5"
            placeholder="주소 (URL)"
          />
        </div>

        {/* 유튜브 */}
        <div>
          <Label className="text-xs">유튜브</Label>
          <Input value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} className="h-8 text-sm" placeholder="https://www.youtube.com/@채널명" />
          <UrlTitle loading={urlLoading.youtube} title={urlTitles.youtube} />
        </div>

        {/* 인스타그램 */}
        <div>
          <Label className="text-xs">인스타그램</Label>
          <Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="h-8 text-sm" placeholder="https://www.instagram.com/계정명" />
          <UrlTitle loading={urlLoading.instagram} title={urlTitles.instagram} />
        </div>

        {/* 추가 링크 (복수) */}
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">추가 링크</Label>
            <button
              type="button"
              onClick={() => setRefLinks([...refLinks, ""])}
              className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800"
            >
              <Plus className="h-3.5 w-3.5" />추가
            </button>
          </div>
          {refLinks.map((link, idx) => (
            <div key={idx} className="mt-1.5">
              <div className="flex items-center gap-1">
                <Input
                  value={link}
                  onChange={(e) => {
                    const next = [...refLinks];
                    next[idx] = e.target.value;
                    setRefLinks(next);
                  }}
                  className="h-8 text-sm flex-1"
                  placeholder="https://"
                />
                {refLinks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRefLinks(refLinks.filter((_, i) => i !== idx))}
                    className="shrink-0 h-8 w-8 flex items-center justify-center rounded border border-gray-200 text-muted-foreground hover:text-red-500 hover:border-red-300"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <UrlTitle loading={urlLoading[`ref_${idx}`]} title={urlTitles[`ref_${idx}`]} />
            </div>
          ))}
        </div>

        {/* 이메일 */}
        <div>
          <Label className="text-xs">이메일</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 text-sm" />
        </div>

        {/* 메모 */}
        <div>
          <Label className="text-xs">메모</Label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none h-20" />
        </div>
        {/* 출처는 "강사모집" 기본값으로 자동 설정 */}
      </div>

      {/* 버튼 */}
      <div className="pt-1 space-y-2">
        {editing ? (
          <>
            <Button className="w-full h-9 text-sm" onClick={() => handleSubmit(false)} disabled={saving}>
              {saving ? "저장 중..." : "수정"}
            </Button>
            <Button variant="outline" className="w-full h-9 text-sm" onClick={resetForm}>
              취소
            </Button>
          </>
        ) : nameCheck?.type === "duplicate" ? (
          <Button className="w-full h-9 text-sm" onClick={() => handleSubmit(true)} disabled={saving}>
            {saving ? "저장 중..." : "그래도 추가"}
          </Button>
        ) : (
          <Button
            className="w-full h-9 text-sm"
            onClick={() => handleSubmit(false)}
            disabled={saving || nameCheck?.type === "banned"}
          >
            {saving ? "저장 중..." : "추가"}
          </Button>
        )}
      </div>
      </div>
    </div>
  );
}

/* ── URL 제목 미리보기 ── */
function UrlTitle({ loading, title }: { loading?: boolean; title?: string }) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 mt-1 px-2 py-1 rounded bg-gray-50 border border-gray-100">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
        <span className="text-xs text-muted-foreground">확인 중...</span>
      </div>
    );
  }
  if (!title) return null;
  return (
    <div className="mt-1 px-2 py-1 rounded bg-blue-50 border border-blue-100">
      <p className="text-xs text-blue-700 font-medium truncate">{title}</p>
    </div>
  );
}
