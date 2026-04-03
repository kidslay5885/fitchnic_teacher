"use client";

import { useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STATUSES, ASSIGNEES } from "@/lib/constants";
import { requiresReason } from "@/lib/status-machine";
import type { InstructorStatus } from "@/lib/types";
import { toast } from "sonner";

interface Props {
  selectedIds: string[];
  onDone: () => void;
}

export default function BulkActions({ selectedIds, onDone }: Props) {
  const { loadInstructors, loadStats } = useOutreach();
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [changedBy, setChangedBy] = useState("");
  const [loading, setLoading] = useState(false);

  const handleBulkUpdate = async () => {
    if (!status) { toast.error("상태를 선택하세요."); return; }
    if (requiresReason(status as InstructorStatus) && !reason) { toast.error("사유를 입력하세요."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/instructors/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, status, reason, changed_by: changedBy }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await Promise.all([loadInstructors(), loadStats()]);
      toast.success(`${selectedIds.length}명 상태 변경 완료`);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium">{selectedIds.length}명 선택</span>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-[110px] h-8 text-sm">
          <SelectValue placeholder="상태 선택" />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={changedBy} onValueChange={setChangedBy}>
        <SelectTrigger className="w-[100px] h-8 text-sm">
          <SelectValue placeholder="변경자" />
        </SelectTrigger>
        <SelectContent>
          {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
        </SelectContent>
      </Select>
      {status && requiresReason(status as InstructorStatus) && (
        <Input placeholder="사유" value={reason} onChange={(e) => setReason(e.target.value)} className="w-[150px] h-8 text-sm" />
      )}
      <Button size="sm" className="h-8 text-sm" onClick={handleBulkUpdate} disabled={loading}>
        {loading ? "처리 중..." : "일괄 변경"}
      </Button>
    </div>
  );
}
