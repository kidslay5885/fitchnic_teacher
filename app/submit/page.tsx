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
import type { Instructor, InstructorStatus } from "@/lib/types";
import { Search, ChevronUp, ChevronDown, AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type SortKey = "name" | "status" | "field" | "assignee" | "source" | "has_lecture_history" | "lecture_platform" | "email";
type SortDir = "asc" | "desc";

const ROW_H = 36;
// 상태 | 분야 | 찾은 사람 | 이름 | 참조 | 강의 | 플랫폼 | 유튜브 | 인스타 | 이메일 | 비고 | 출처
const GRID = "84px 1.2fr 72px 1fr 48px 64px 1fr 48px 48px 1.2fr 1.5fr 80px";
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
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [highlightId, setHighlightId] = useState<string | null>(null);
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
        const q = search.toLowerCase();
        return (
          i.name?.toLowerCase().includes(q) ||
          i.email?.toLowerCase().includes(q) ||
          i.field?.toLowerCase().includes(q) ||
          i.lecture_platform?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [instructors, search, statusFilter, assigneeFilter]);

  // 정렬
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a[sortKey] || "") as string;
      const bv = (b[sortKey] || "") as string;
      const cmp = av.localeCompare(bv, "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

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
      </div>

      {/* 메인: 왼쪽 테이블 + 오른쪽 입력 폼 */}
      <div className="flex flex-1 min-h-0 px-6 pb-6 gap-5">
        {/* 왼쪽 — 테이블 */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={scrollRef} className="border rounded flex-1 min-h-0 overflow-auto">
            <div
              className="sticky top-0 z-10 grid items-center bg-[#f8f9fa] border-b text-xs font-semibold text-muted-foreground select-none"
              style={{ gridTemplateColumns: GRID, minWidth: MIN_W }}
            >
              <SortHeader label="상태" col="status" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <SortHeader label="분야" col="field" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <SortHeader label="찾은 사람" col="assignee" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <SortHeader label="이름" col="name" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <SortHeader label="참조" />
              <SortHeader label="강의" col="has_lecture_history" sk={sortKey} sd={sortDir} onSort={handleSort} center />
              <SortHeader label="플랫폼" col="lecture_platform" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <div className="px-1 py-2.5 border-r border-gray-200 text-center whitespace-nowrap">유튜브</div>
              <div className="px-1 py-2.5 border-r border-gray-200 text-center whitespace-nowrap">인스타</div>
              <SortHeader label="이메일" col="email" sk={sortKey} sd={sortDir} onSort={handleSort} />
              <SortHeader label="비고" />
              <SortHeader label="출처" col="source" sk={sortKey} sd={sortDir} onSort={handleSort} last />
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
                      className={`grid items-center border-b text-sm ${highlightId === i.id ? "!bg-yellow-200 ring-2 ring-yellow-400 ring-inset transition-all duration-300" : ROW_BG[i.status] || "bg-white"}`}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, height: ROW_H, gridTemplateColumns: GRID, transform: `translateY(${vRow.start}px)` }}
                    >
                      <div className="px-2 flex items-center border-r border-gray-200/60">
                        <Badge className={`text-xs px-1.5 py-0 whitespace-nowrap ${STATUS_COLORS[i.status as InstructorStatus] || ""}`}>
                          {i.status}
                        </Badge>
                      </div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 overflow-hidden"><span className="truncate">{i.field}</span></div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.assignee}</span></div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 font-medium overflow-hidden">
                        <span className="truncate">{i.name}</span>
                        {i.is_banned && <span className="text-red-500 ml-1 text-xs shrink-0">[금지]</span>}
                      </div>
                      <div className="px-2 flex items-center border-r border-gray-200/60">
                        {i.ref_link ? <a href={i.ref_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">링크</a> : ""}
                      </div>
                      <div className="px-2 flex items-center justify-center border-r border-gray-200/60 text-muted-foreground">{i.has_lecture_history}</div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.lecture_platform}</span></div>
                      <div className="px-2 flex items-center border-r border-gray-200/60">
                        {i.youtube ? <a href={i.youtube} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">링크</a> : ""}
                      </div>
                      <div className="px-2 flex items-center border-r border-gray-200/60">
                        {igUrl ? <a href={igUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">링크</a> : ""}
                      </div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.email}</span></div>
                      <div className="px-2 flex items-center border-r border-gray-200/60 text-muted-foreground overflow-hidden"><span className="truncate">{i.notes}</span></div>
                      <div className="px-2 flex items-center text-muted-foreground overflow-hidden"><span className="truncate">{i.source}</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 — 강사 추가 폼 */}
        <div className="w-[320px] shrink-0">
          <SubmitForm
            instructors={instructors}
            onAdded={(inst) => setInstructors((prev) => [...prev, inst])}
            onScrollTo={scrollToInstructor}
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

/* ── 강사 추가 폼 (실시간 중복/금지 체크) ── */
function SubmitForm({ instructors, onAdded, onScrollTo }: {
  instructors: Instructor[];
  onAdded: (inst: Instructor) => void;
  onScrollTo: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: "", field: "", assignee: "", email: "",
    instagram: "", youtube: "", phone: "", ref_link: "",
    has_lecture_history: "", lecture_platform: "", lecture_platform_url: "",
    source: "강사모집" as string, notes: "",
  });
  const [saving, setSaving] = useState(false);

  // 실시간 중복/금지 체크
  const nameCheck = useMemo(() => {
    const name = form.name.trim();
    if (!name) return null;
    // 공백 제거 후 비교 (예: "감동 상영관" === "감동상영관")
    const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    const normalized = normalize(name);
    const duplicates = instructors.filter((i) =>
      normalize(i.name) === normalized
    );
    if (duplicates.length === 0) return { type: "ok" as const };
    const banned = duplicates.some((d) => d.is_banned);
    if (banned) return { type: "banned" as const, matches: duplicates };
    return { type: "duplicate" as const, matches: duplicates };
  }, [form.name, instructors]);

  // 중복/금지 감지 시 자동 스크롤
  useEffect(() => {
    if (nameCheck && nameCheck.type !== "ok" && nameCheck.matches.length > 0) {
      onScrollTo(nameCheck.matches[0].id);
    }
  }, [nameCheck, onScrollTo]);

  const resetForm = () => {
    setForm({
      name: "", field: "", assignee: "", email: "",
      instagram: "", youtube: "", phone: "", ref_link: "",
      has_lecture_history: "", lecture_platform: "", lecture_platform_url: "",
      source: "강사모집", notes: "",
    });
  };

  const handleSubmit = async (force = false) => {
    if (!form.name.trim()) { toast.error("강사 이름을 입력하세요."); return; }
    if (nameCheck?.type === "banned") { toast.error("연락 금지 대상입니다. 추가할 수 없습니다."); return; }
    if (nameCheck?.type === "duplicate" && !force) return;
    setSaving(true);
    try {
      const res = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, _force: force }),
      });
      const data = await res.json();
      if (data.warning === "duplicate_name" && !force) return;
      if (!res.ok && !data.warning) throw new Error(data.error);
      toast.success(`${form.name} 추가 완료`);
      onAdded(data);
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg bg-white h-full overflow-y-auto flex flex-col">
      <div className="p-4 space-y-4 flex-1 overflow-y-auto">

      <div className="space-y-3">
        {/* 이름 + 실시간 체크 */}
        <div>
          <Label className="text-xs">이름 *</Label>
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
              </div>
              {nameCheck.matches.map((d) => (
                <div key={d.id} className="text-xs text-orange-600 bg-orange-100 rounded px-2 py-1">
                  {d.name} {d.field && `| ${d.field}`} | {d.status}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label className="text-xs">분야</Label>
          <Input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} className="h-8 text-sm" />
        </div>
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
        <div>
          <Label className="text-xs">유튜브</Label>
          <Input value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">인스타그램</Label>
          <Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">참조 링크</Label>
          <Input value={form.ref_link} onChange={(e) => setForm({ ...form, ref_link: e.target.value })} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">이메일</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">비고</Label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="h-8 text-sm" />
        </div>
        <div className="relative">
          <Label className="text-xs">찾은 사람</Label>
          <Input
            value={form.assignee}
            onChange={(e) => setForm({ ...form, assignee: e.target.value })}
            className="h-8 text-sm"
            placeholder="이름 입력"
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
        <div>
          <Label className="text-xs">출처</Label>
          <div className="flex gap-1.5 mt-1">
            {SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, source: s })}
                className={`h-8 px-2.5 rounded border text-xs font-medium transition-colors ${
                  form.source === s
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-muted-foreground border-gray-200 hover:border-gray-400"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 버튼 */}
      <div className="pt-1">
        {nameCheck?.type === "duplicate" ? (
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
