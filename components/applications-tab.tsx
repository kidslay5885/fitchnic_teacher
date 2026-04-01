"use client";

import { useEffect, useMemo, useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

  useEffect(() => {
    if (state.applications.length === 0) loadApplications();
  }, []);

  const filtered = useMemo(() => {
    if (activeSource === "전체") return state.applications;
    return state.applications.filter((a) => a.source_platform === activeSource);
  }, [state.applications, activeSource]);

  const handleReviewStatus = async (app: Application, status: string) => {
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_status: status }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadApplications();
      toast.success("검토 상태가 업데이트되었습니다.");
    } catch {
      toast.error("업데이트에 실패했습니다.");
    }
  };

  const handleAddToInstructors = async (app: Application) => {
    try {
      const res = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: app.applicant_name || app.activity_name,
          phone: app.contact,
          sns_link: app.sns_link,
          source: "지원서",
          notes: `지원서: ${app.source_platform} | 강의경험: ${app.experience} | 주제: ${app.topic}`,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const instructor = await res.json();
      dispatch({ type: "ADD_INSTRUCTOR", instructor });
      toast.success(`${app.applicant_name}이(가) 강사DB에 추가되었습니다.`);
    } catch {
      toast.error("추가에 실패했습니다.");
    }
  };

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of state.applications) {
      counts[a.source_platform] = (counts[a.source_platform] || 0) + 1;
    }
    return counts;
  }, [state.applications]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">지원서</h2>
        <span className="text-sm text-muted-foreground">
          총 {state.applications.length}건
        </span>
      </div>

      {/* 소스 탭 */}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={activeSource === "전체" ? "default" : "outline"}
          onClick={() => setActiveSource("전체")}
        >
          전체 ({state.applications.length})
        </Button>
        {APPLICATION_SOURCES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={activeSource === s ? "default" : "outline"}
            onClick={() => setActiveSource(s)}
          >
            {s} ({sourceCounts[s] || 0})
          </Button>
        ))}
      </div>

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>활동명</TableHead>
              <TableHead>채널</TableHead>
              <TableHead>강의주제</TableHead>
              <TableHead>검토상태</TableHead>
              <TableHead className="w-[100px]">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  지원서가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.applicant_name}</TableCell>
                  <TableCell className="text-sm">{a.activity_name}</TableCell>
                  <TableCell className="text-sm">{a.source_platform}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{a.topic}</TableCell>
                  <TableCell>
                    <Select
                      value={a.review_status}
                      onValueChange={(v) => handleReviewStatus(a, v)}
                    >
                      <SelectTrigger className="w-[100px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="미확인">미확인</SelectItem>
                        <SelectItem value="확인완료">확인완료</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setDetailApp(a)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => handleAddToInstructors(a)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 상세 다이얼로그 */}
      {detailApp && (
        <Dialog open onOpenChange={() => setDetailApp(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{detailApp.applicant_name} 지원서</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3 text-sm">
                <Row label="이름" value={detailApp.applicant_name} />
                <Row label="활동명" value={detailApp.activity_name} />
                <Row label="채널" value={detailApp.source_platform} />
                <Row label="연락처" value={detailApp.contact} />
                <Row label="강의경험" value={detailApp.experience} />
                <Row label="강의주제" value={detailApp.topic} />
                <Row label="지원동기" value={detailApp.motivation} />
                <Row label="경력/성과" value={detailApp.career} />
                <Row label="수강생 성과" value={detailApp.student_results} />
                <Row label="수강생이 얻는 것" value={detailApp.student_benefits} />
                <Row label="SNS" value={detailApp.sns_link} />
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>
      <p className="whitespace-pre-wrap mt-0.5">{value}</p>
    </div>
  );
}
