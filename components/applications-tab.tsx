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
        body: JSON.stringify({ name: app.applicant_name || app.activity_name, phone: app.contact, source: "지원서", notes: `${app.source_platform} | ${app.experience} | ${app.topic}` }),
      });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "ADD_INSTRUCTOR", instructor: await res.json() });
      toast.success(`${app.applicant_name} 강사DB 추가`);
    } catch { toast.error("추가 실패"); }
  };

  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of state.applications) c[a.source_platform] = (c[a.source_platform] || 0) + 1;
    return c;
  }, [state.applications]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">지원서</h2>
        <span className="text-xs text-muted-foreground">{state.applications.length}건</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {[{ key: "전체", label: `전체 (${state.applications.length})` }, ...APPLICATION_SOURCES.map((s) => ({ key: s, label: `${s} (${sourceCounts[s] || 0})` }))].map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveSource(f.key)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
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
              <TableHead className="py-1.5 text-xs">이름</TableHead>
              <TableHead className="py-1.5 text-xs">활동명</TableHead>
              <TableHead className="py-1.5 text-xs">채널</TableHead>
              <TableHead className="py-1.5 text-xs">강의주제</TableHead>
              <TableHead className="py-1.5 text-xs">검토</TableHead>
              <TableHead className="py-1.5 text-xs w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">지원서가 없습니다.</TableCell></TableRow>
            ) : (
              filtered.map((a, idx) => (
                <TableRow key={a.id} className={idx % 2 === 1 ? "bg-muted/20" : ""}>
                  <TableCell className="py-1 text-xs font-medium">{a.applicant_name}</TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">{a.activity_name}</TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">{a.source_platform}</TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground max-w-[180px] truncate">{a.topic}</TableCell>
                  <TableCell className="py-1">
                    <Select value={a.review_status} onValueChange={(v) => handleReviewStatus(a, v)}>
                      <SelectTrigger className="w-[80px] h-6 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="미확인">미확인</SelectItem>
                        <SelectItem value="확인완료">확인완료</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-1">
                    <div className="flex gap-0.5">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDetailApp(a)}><Eye className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleAddToInstructors(a)}><UserPlus className="h-3 w-3" /></Button>
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
            <DialogHeader><DialogTitle className="text-sm">{detailApp.applicant_name} 지원서</DialogTitle></DialogHeader>
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-2 text-xs">
                {[
                  ["이름", detailApp.applicant_name], ["활동명", detailApp.activity_name], ["채널", detailApp.source_platform],
                  ["연락처", detailApp.contact], ["강의경험", detailApp.experience], ["강의주제", detailApp.topic],
                  ["지원동기", detailApp.motivation], ["경력/성과", detailApp.career],
                  ["수강생 성과", detailApp.student_results], ["수강생이 얻는 것", detailApp.student_benefits], ["SNS", detailApp.sns_link],
                ].map(([l, v]) => v ? (
                  <div key={l}><span className="text-muted-foreground">{l}:</span><p className="whitespace-pre-wrap">{v}</p></div>
                ) : null)}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
