"use client";

import { useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ASSIGNEES, SOURCES } from "@/lib/constants";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

interface Props {
  onClose: () => void;
}

interface DuplicateInfo {
  id: string; name: string; field: string; assignee: string; status: string;
}

export default function InstructorForm({ onClose }: Props) {
  const { dispatch, loadStats } = useOutreach();
  const [form, setForm] = useState({
    name: "", field: "", assignee: "", email: "",
    instagram: "", youtube: "", phone: "", ref_link: "",
    source: "강사모집", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[] | null>(null);

  const handleSubmit = async (force = false) => {
    if (!form.name.trim()) { toast.error("강사 이름을 입력하세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, _force: force }),
      });
      const data = await res.json();
      if (data.warning === "duplicate_name" && !force) {
        setDuplicates(data.duplicates);
        setSaving(false);
        return;
      }
      if (!res.ok && !data.warning) throw new Error(data.error);
      dispatch({ type: "ADD_INSTRUCTOR", instructor: data });
      await loadStats();
      toast.success(`${form.name} 추가 완료`);
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">강사 추가</DialogTitle>
        </DialogHeader>

        {duplicates && (
          <div className="rounded-lg border border-orange-300 bg-orange-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-5 w-5" />
              <p className="text-sm font-semibold">동일한 이름의 강사가 존재합니다</p>
            </div>
            <div className="space-y-1">
              {duplicates.map((d) => (
                <div key={d.id} className="text-sm text-orange-800 bg-orange-100 rounded px-3 py-1.5">
                  <span className="font-medium">{d.name}</span>
                  {d.field && <span> | {d.field}</span>}
                  {d.assignee && <span> | {d.assignee}</span>}
                  <span> | {d.status}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-orange-700">그래도 추가하시겠습니까?</p>
            <div className="flex gap-2">
              <Button size="sm" className="h-8 text-sm" onClick={() => handleSubmit(true)} disabled={saving}>
                {saving ? "저장 중..." : "그래도 추가"}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-sm" onClick={() => setDuplicates(null)}>취소</Button>
            </div>
          </div>
        )}

        {!duplicates && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">이름 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus className="h-8 text-sm" /></div>
              <div><Label className="text-xs">분야</Label><Input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} className="h-8 text-sm" /></div>
              <div>
                <Label className="text-xs">담당자</Label>
                <Select value={form.assignee || "_none"} onValueChange={(v) => setForm({ ...form, assignee: v === "_none" ? "" : v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">미지정</SelectItem>
                    {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">출처</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">이메일</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 text-sm" /></div>
              <div><Label className="text-xs">인스타그램</Label><Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="h-8 text-sm" /></div>
              <div><Label className="text-xs">유튜브</Label><Input value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} className="h-8 text-sm" /></div>
              <div><Label className="text-xs">전화번호</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-8 text-sm" /></div>
              <div className="col-span-2"><Label className="text-xs">참조 링크</Label><Input value={form.ref_link} onChange={(e) => setForm({ ...form, ref_link: e.target.value })} className="h-8 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-1">
              <Button variant="outline" size="sm" className="h-8 text-sm" onClick={onClose}>취소</Button>
              <Button size="sm" className="h-8 text-sm" onClick={() => handleSubmit(false)} disabled={saving}>{saving ? "저장 중..." : "추가"}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
