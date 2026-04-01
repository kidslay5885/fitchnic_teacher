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

interface Props {
  onClose: () => void;
}

export default function InstructorForm({ onClose }: Props) {
  const { dispatch, loadStats } = useOutreach();
  const [form, setForm] = useState({
    name: "", field: "", assignee: "", email: "",
    instagram: "", youtube: "", phone: "", ref_link: "",
    source: "강사모집", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("강사 이름을 입력하세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const instructor = await res.json();
      dispatch({ type: "ADD_INSTRUCTOR", instructor });
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">강사 추가</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-[10px]">이름 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus className="h-7 text-xs" /></div>
          <div><Label className="text-[10px]">분야</Label><Input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} className="h-7 text-xs" /></div>
          <div>
            <Label className="text-[10px]">담당자</Label>
            <Select value={form.assignee || "_none"} onValueChange={(v) => setForm({ ...form, assignee: v === "_none" ? "" : v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">미지정</SelectItem>
                {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">출처</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-[10px]">이메일</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-7 text-xs" /></div>
          <div><Label className="text-[10px]">인스타그램</Label><Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="h-7 text-xs" /></div>
          <div><Label className="text-[10px]">유튜브</Label><Input value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} className="h-7 text-xs" /></div>
          <div><Label className="text-[10px]">전화번호</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-7 text-xs" /></div>
          <div className="col-span-2"><Label className="text-[10px]">참조 링크</Label><Input value={form.ref_link} onChange={(e) => setForm({ ...form, ref_link: e.target.value })} className="h-7 text-xs" /></div>
        </div>
        <div className="flex justify-end gap-1.5 mt-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>취소</Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={saving}>{saving ? "저장 중..." : "추가"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
