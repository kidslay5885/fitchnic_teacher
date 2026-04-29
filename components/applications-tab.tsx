"use client";

import { useEffect, useMemo, useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { APPLICATION_SOURCES } from "@/lib/constants";
import type { Application } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, UserPlus, Trash2, Search, ChevronUp, ChevronDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";

// 채널 표시 라벨 (DB 값 → UI 표시값). DB/Apps Script 값은 건드리지 않음
const SOURCE_LABELS: Record<string, string> = {
  "핏크닉카": "핏크닉카페",
  "머니업카": "머니업카페",
};

// 검토 상태 표시 라벨 (DB 값은 "미확인" 유지, UI에서만 "미검토"로 표시)
const REVIEW_LABELS: Record<string, string> = {
  "미확인": "미검토",
};
const reviewLabel = (k: string) => REVIEW_LABELS[k] ?? k;

// 출처별 상세 필드 순서
function getDetailFields(app: Application): [string, string][] {
  const common: [string, string][] = [
    ["채널", app.source_platform],
    ["이름", app.applicant_name],
    ["강사명", app.activity_name],
    ["연락처", app.contact],
    ["강의 경험", app.experience],
  ];

  if (app.source_platform === "핏크닉메타") {
    return [
      ...common,
      ["강의 형태", app.lecture_format],
      ["지원 동기", app.motivation],
      ["강의 주제", app.topic],
      ["경력/성과", app.career],
      ["수강생이 얻는 것", app.student_benefits],
      ["SNS 종류", app.sns_types],
      ["SNS 링크", app.sns_link],
    ];
  }

  // 핏크닉홈, 핏크닉카, 머니업홈, 머니업카
  return [
    ...common,
    ["강의 주제", app.topic],
    ["지원 동기", app.motivation],
    ["경력/성과", app.career],
    ["수강생 성과 경험", app.student_results],
    ["수강생이 얻는 것", app.student_benefits],
    ["SNS 링크", app.sns_link],
  ];
}

export default function ApplicationsTab() {
  const { state, dispatch, loadApplications } = useOutreach();
  const [activeSource, setActiveSource] = useState<string>("전체");
  const [reviewFilter, setReviewFilter] = useState<string>("전체");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<keyof Application | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [detailApp, setDetailApp] = useState<Application | null>(null);
  const [confirmAdd, setConfirmAdd] = useState<Application | null>(null);
  const [confirmBulkAdd, setConfirmBulkAdd] = useState<Application[] | null>(null);

  // 강사 등록 시 사용할 이름 (강사 등록 로직과 동일)
  const getRegisterName = (app: Application) => app.applicant_name || app.activity_name;
  // 같은 이름의 기존 강사 찾기 (공백 trim, 대소문자 무시)
  const findDuplicates = (name: string) => {
    const k = (name || "").trim().toLowerCase();
    if (!k) return [];
    return state.instructors.filter((i) => (i.name || "").trim().toLowerCase() === k);
  };

  const handleSort = (key: keyof Application) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((a) => a.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  useEffect(() => { if (state.applications.length === 0) loadApplications(); }, []);

  const filtered = useMemo(() => {
    return state.applications.filter((a) => {
      if (activeSource !== "전체" && a.source_platform !== activeSource) return false;
      if (reviewFilter !== "전체" && a.review_status !== reviewFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          a.applicant_name?.toLowerCase().includes(q) ||
          a.activity_name?.toLowerCase().includes(q) ||
          a.topic?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [state.applications, activeSource, reviewFilter, search]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = (a[sortKey] || "") as string;
      const bv = (b[sortKey] || "") as string;
      const cmp = av.localeCompare(bv, "ko");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const handleReviewStatus = async (app: Application, status: string) => {
    // 낙관적 업데이트: 즉시 UI 반영
    const prev = state.applications;
    dispatch({
      type: "SET_APPLICATIONS",
      applications: prev.map((a) => (a.id === app.id ? { ...a, review_status: status as Application["review_status"] } : a)),
    });
    try {
      const res = await fetch(`/api/applications/${app.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_status: status }) });
      if (!res.ok) throw new Error("Failed");
    } catch {
      dispatch({ type: "SET_APPLICATIONS", applications: prev });
      toast.error("검토 상태 업데이트 실패");
    }
  };

  const handleAddToInstructors = async (app: Application) => {
    if (app.instructor_id && state.instructors.some((i) => i.id === app.instructor_id)) { toast.error("이미 등록된 지원서입니다."); return; }
    try {
      const res = await fetch("/api/instructors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: app.applicant_name || app.activity_name, phone: app.contact, source: "지원서", notes: `${app.source_platform} | ${app.experience} | ${app.topic}`, _force: true }),
      });
      if (!res.ok) throw new Error("Failed");
      const instructor = await res.json();
      dispatch({ type: "ADD_INSTRUCTOR", instructor });
      // 지원서에 instructor_id 연결
      await fetch(`/api/applications/${app.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructor_id: instructor.id }) });
      await loadApplications();
      toast.success(`${app.applicant_name} 강사찾기에 추가`);
    } catch { toast.error("추가 실패"); }
  };

  // 일괄 검토 상태 변경
  const handleBulkReview = async (status: string) => {
    const ids = selected;
    const count = ids.size;
    const prev = state.applications;
    // 낙관적 업데이트
    dispatch({
      type: "SET_APPLICATIONS",
      applications: prev.map((a) => (ids.has(a.id) ? { ...a, review_status: status as Application["review_status"] } : a)),
    });
    setSelected(new Set());
    try {
      await Promise.all(
        Array.from(ids).map((id) =>
          fetch(`/api/applications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_status: status }) })
        )
      );
      toast.success(`${count}건 ${reviewLabel(status)}로 변경`);
    } catch {
      dispatch({ type: "SET_APPLICATIONS", applications: prev });
      toast.error("실패");
    }
  };

  // 일괄 강사 등록 — 모달 열기
  const handleBulkAddToInstructors = () => {
    const apps = state.applications.filter((a) => selected.has(a.id) && !a.instructor_id);
    if (apps.length === 0) { toast.error("등록 가능한 지원서가 없습니다."); return; }
    setConfirmBulkAdd(apps);
  };

  // 일괄 강사 등록 — 실제 실행
  const runBulkAdd = async (apps: Application[]) => {
    try {
      for (const app of apps) {
        const res = await fetch("/api/instructors", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: getRegisterName(app), phone: app.contact, source: "지원서", notes: `${app.source_platform} | ${app.experience} | ${app.topic}`, _force: true }),
        });
        if (res.ok) {
          const instructor = await res.json();
          dispatch({ type: "ADD_INSTRUCTOR", instructor });
          await fetch(`/api/applications/${app.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructor_id: instructor.id }) });
        }
      }
      await loadApplications();
      setSelected(new Set());
      toast.success(`${apps.length}명 강사찾기에 추가`);
    } catch { toast.error("추가 실패"); }
  };

  // 개별 삭제
  const handleDelete = async (id: string) => {
    if (!confirm("이 지원서를 삭제하시겠습니까?")) return;
    try {
      await fetch(`/api/applications/${id}`, { method: "DELETE" });
      await loadApplications();
      toast.success("삭제 완료");
    } catch { toast.error("삭제 실패"); }
  };

  // 일괄 삭제
  const handleBulkDelete = async () => {
    if (!confirm(`${selected.size}건의 지원서를 삭제하시겠습니까?`)) return;
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/applications/${id}`, { method: "DELETE" })
        )
      );
      await loadApplications();
      setSelected(new Set());
      toast.success(`${selected.size}건 삭제 완료`);
    } catch { toast.error("삭제 실패"); }
  };

  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of state.applications) c[a.source_platform] = (c[a.source_platform] || 0) + 1;
    return c;
  }, [state.applications]);

  const reviewCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of state.applications) {
      if (activeSource !== "전체" && a.source_platform !== activeSource) continue;
      c[a.review_status] = (c[a.review_status] || 0) + 1;
    }
    return c;
  }, [state.applications, activeSource]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">지원서</h2>

      <div className="flex gap-2 flex-wrap">
        {[{ key: "전체", label: `전체 (${state.applications.length})` }, ...APPLICATION_SOURCES.map((s) => ({ key: s, label: `${SOURCE_LABELS[s] ?? s} (${sourceCounts[s] || 0})` }))].map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveSource(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeSource === f.key ? "border-primary/50 bg-primary/10 text-primary" : "border-transparent bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{selected.size}건 선택</span>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleBulkReview("확인완료")}>
            확인완료
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleBulkReview("미확인")}>
            미검토
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleBulkAddToInstructors}>
            <UserPlus className="h-3.5 w-3.5 mr-1" />강사 등록
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleBulkDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />삭제
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름, 활동명, 주제 검색..."
            className="h-8 text-sm pl-8 w-[220px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">{sorted.length}건</span>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="py-2 w-10"><Checkbox checked={sorted.length > 0 && selected.size === sorted.length} onCheckedChange={toggleAll} /></TableHead>
              <SortableHead label="이름" col="applicant_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableHead label="활동명" col="activity_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableHead label="채널" col="source_platform" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <TableHead className="py-2 text-xs font-semibold">강의주제</TableHead>
              <TableHead className="py-2 text-xs font-semibold">
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center gap-0.5 outline-none hover:text-foreground select-none">
                    <span className={reviewFilter !== "전체" ? "text-primary" : ""}>
                      검토{reviewFilter !== "전체" ? `: ${reviewLabel(reviewFilter)}` : ""}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {[
                      { key: "전체", count: (reviewCounts["미확인"] || 0) + (reviewCounts["확인완료"] || 0) },
                      { key: "미확인", count: reviewCounts["미확인"] || 0 },
                      { key: "확인완료", count: reviewCounts["확인완료"] || 0 },
                    ].map((f) => (
                      <DropdownMenuItem key={f.key} onClick={() => setReviewFilter(f.key)} className="text-xs">
                        <span className="flex-1">{reviewLabel(f.key)} ({f.count})</span>
                        {reviewFilter === f.key && <Check className="ml-2 h-3.5 w-3.5" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableHead>
              <TableHead className="py-2 text-xs font-semibold w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">지원서가 없습니다.</TableCell></TableRow>
            ) : (
              sorted.map((a, idx) => (
                <TableRow key={a.id} className={`${idx % 2 === 1 ? "bg-muted/20" : ""} ${selected.has(a.id) ? "!bg-primary/10" : ""}`}>
                  <TableCell className="py-2"><Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleOne(a.id)} /></TableCell>
                  <TableCell className="py-2 text-sm font-medium">
                    {a.applicant_name}
                    {a.instructor_id && state.instructors.some((i) => i.id === a.instructor_id) && <span className="ml-1.5 text-xs text-green-600 font-normal">등록됨</span>}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">{a.activity_name}</TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">{a.source_platform}</TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground max-w-[200px] truncate">{a.topic}</TableCell>
                  <TableCell className="py-2">
                    <Select value={a.review_status} onValueChange={(v) => handleReviewStatus(a, v)}>
                      <SelectTrigger className={`w-[90px] h-7 text-xs font-medium ${
                        a.review_status === "확인완료"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                          : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
                      }`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="미확인">미검토</SelectItem>
                        <SelectItem value="확인완료">확인완료</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDetailApp(a)}><Eye className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setConfirmAdd(a)} disabled={!!a.instructor_id && state.instructors.some((i) => i.id === a.instructor_id)}><UserPlus className={`h-4 w-4 ${a.instructor_id && state.instructors.some((i) => i.id === a.instructor_id) ? "text-muted-foreground/40" : ""}`} /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {detailApp && (
        <Dialog open onOpenChange={() => setDetailApp(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg">{detailApp.applicant_name} 지원서</DialogTitle>
              <p className="text-sm text-muted-foreground">{detailApp.source_platform} · {detailApp.submitted_at ? new Date(detailApp.submitted_at).toLocaleDateString("ko-KR") : ""}</p>
            </DialogHeader>
            <ScrollArea className="max-h-[65vh]">
              <div className="space-y-4 text-sm pr-3">
                {getDetailFields(detailApp).map(([l, v]) => v ? (
                  <div key={l}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{l}</p>
                    <p className="whitespace-pre-wrap leading-relaxed">{v}</p>
                  </div>
                ) : null)}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}

      {confirmAdd && (() => {
        const name = getRegisterName(confirmAdd);
        const dups = findDuplicates(name);
        return (
          <Dialog open onOpenChange={() => setConfirmAdd(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base">강사 추가 확인</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className="font-semibold">{name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {confirmAdd.source_platform}{confirmAdd.contact ? ` · ${confirmAdd.contact}` : ""}
                  </p>
                </div>
                {dups.length > 0 ? (
                  <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                    <p className="font-medium">⚠ 같은 이름의 기존 강사 {dups.length}명</p>
                    <ul className="mt-1 space-y-0.5 text-orange-700">
                      {dups.slice(0, 5).map((i) => (
                        <li key={i.id}>· {i.name}{i.phone ? ` (${i.phone})` : ""}</li>
                      ))}
                      {dups.length > 5 && <li>· 외 {dups.length - 5}명</li>}
                    </ul>
                    <p className="mt-1.5 text-orange-700/80">그래도 추가하면 별도 강사로 등록됩니다.</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground px-1">이름이 동일한 기존 강사가 없습니다.</p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmAdd(null)}>취소</Button>
                <Button onClick={async () => {
                  const app = confirmAdd;
                  setConfirmAdd(null);
                  await handleAddToInstructors(app);
                }}>추가</Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {confirmBulkAdd && (() => {
        const items = confirmBulkAdd.map((a) => {
          const name = getRegisterName(a);
          return { app: a, name, dups: findDuplicates(name) };
        });
        const dupTotal = items.filter((i) => i.dups.length > 0).length;
        return (
          <Dialog open onOpenChange={() => setConfirmBulkAdd(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base">{confirmBulkAdd.length}명 강사 추가 확인</DialogTitle>
                {dupTotal > 0 && (
                  <p className="text-xs text-orange-700">
                    ⚠ 이름 중복 {dupTotal}명 — 그래도 추가하면 별도 강사로 등록됩니다.
                  </p>
                )}
              </DialogHeader>
              <ScrollArea className="max-h-[55vh] -mx-2 px-2">
                <div className="space-y-1 py-1">
                  {items.map(({ app, name, dups }) => (
                    <div key={app.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
                      <div className="text-sm min-w-0">
                        <span className="font-medium">{name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{app.source_platform}</span>
                      </div>
                      {dups.length > 0 && (
                        <span
                          className="shrink-0 text-xs text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded"
                          title={dups.map((d) => `${d.name}${d.phone ? ` (${d.phone})` : ""}`).join("\n")}
                        >
                          중복 {dups.length}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmBulkAdd(null)}>취소</Button>
                <Button onClick={async () => {
                  const apps = confirmBulkAdd;
                  setConfirmBulkAdd(null);
                  await runBulkAdd(apps);
                }}>{confirmBulkAdd.length}명 추가</Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

function SortableHead({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: keyof Application;
  sortKey: keyof Application | null; sortDir: "asc" | "desc";
  onSort: (key: keyof Application) => void;
}) {
  const active = sortKey === col;
  return (
    <TableHead
      className="py-2 text-xs font-semibold cursor-pointer hover:bg-muted select-none"
      onClick={() => onSort(col)}
    >
      <div className="flex items-center gap-0.5">
        {label}
        {active && (sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
      </div>
    </TableHead>
  );
}
