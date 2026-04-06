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
import { APPLICATION_SOURCES } from "@/lib/constants";
import type { Application } from "@/lib/types";
import { toast } from "sonner";
import { Eye, UserPlus } from "lucide-react";

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
  const [detailApp, setDetailApp] = useState<Application | null>(null);

  useEffect(() => { if (state.applications.length === 0) loadApplications(); }, []);

  const filtered = useMemo(() => {
    if (activeSource === "전체") return state.applications;
    return state.applications.filter((a) => a.source_platform === activeSource);
  }, [state.applications, activeSource]);

  const handleReviewStatus = async (app: Application, status: string) => {
    try {
      const res = await fetch(`/api/applications/${app.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_status: status }) });
      if (!res.ok) throw new Error("Failed");
      await loadApplications();
      toast.success("검토 상태 업데이트");
    } catch { toast.error("실패"); }
  };

  const handleAddToInstructors = async (app: Application) => {
    try {
      const res = await fetch("/api/instructors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: app.applicant_name || app.activity_name, phone: app.contact, source: "지원서", notes: `${app.source_platform} | ${app.experience} | ${app.topic}`, _force: true }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "ADD_INSTRUCTOR", instructor: await res.json() });
      toast.success(`${app.applicant_name} 강사찾기에 추가`);
    } catch { toast.error("추가 실패"); }
  };

  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of state.applications) c[a.source_platform] = (c[a.source_platform] || 0) + 1;
    return c;
  }, [state.applications]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">지원서</h2>
        <span className="text-sm text-muted-foreground">{state.applications.length}건</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[{ key: "전체", label: `전체 (${state.applications.length})` }, ...APPLICATION_SOURCES.map((s) => ({ key: s, label: `${s} (${sourceCounts[s] || 0})` }))].map((f) => (
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="py-2 text-xs font-semibold">이름</TableHead>
              <TableHead className="py-2 text-xs font-semibold">활동명</TableHead>
              <TableHead className="py-2 text-xs font-semibold">채널</TableHead>
              <TableHead className="py-2 text-xs font-semibold">강의주제</TableHead>
              <TableHead className="py-2 text-xs font-semibold">검토</TableHead>
              <TableHead className="py-2 text-xs font-semibold w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">지원서가 없습니다.</TableCell></TableRow>
            ) : (
              filtered.map((a, idx) => (
                <TableRow key={a.id} className={idx % 2 === 1 ? "bg-muted/20" : ""}>
                  <TableCell className="py-2 text-sm font-medium">{a.applicant_name}</TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">{a.activity_name}</TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">{a.source_platform}</TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground max-w-[200px] truncate">{a.topic}</TableCell>
                  <TableCell className="py-2">
                    <Select value={a.review_status} onValueChange={(v) => handleReviewStatus(a, v)}>
                      <SelectTrigger className="w-[90px] h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="미확인">미확인</SelectItem>
                        <SelectItem value="확인완료">확인완료</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDetailApp(a)}><Eye className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleAddToInstructors(a)}><UserPlus className="h-4 w-4" /></Button>
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
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-base">{detailApp.applicant_name} 지원서</DialogTitle></DialogHeader>
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-3 text-sm">
                {getDetailFields(detailApp).map(([l, v]) => v ? (
                  <div key={l}><span className="text-muted-foreground text-xs">{l}</span><p className="whitespace-pre-wrap">{v}</p></div>
                ) : null)}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
