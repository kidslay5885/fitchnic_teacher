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
import { ASSIGNEES, SOURCES, STATUSES } from "@/lib/constants";
import { toast } from "sonner";
import { AlertTriangle, Plus, Minus } from "lucide-react";

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
    has_lecture_history: "", lecture_platform: "", lecture_platform_url: "",
    source: "강사모집", notes: "", status: "미검토",
  });
  const [refLinks, setRefLinks] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[] | null>(null);

  const handleSubmit = async (force = false) => {
    if (!form.name.trim()) { toast.error("강사 이름을 입력하세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ref_link: refLinks.filter((l) => l.trim()).join(" , "), _force: force }),
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
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
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {/* 이름 */}
              <div className="col-span-2">
                <Label className="text-xs">이름 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus className="h-8 text-sm" />
              </div>

              {/* 분야 */}
              <div>
                <Label className="text-xs">분야</Label>
                <Input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} className="h-8 text-sm" />
              </div>

              {/* 상태 */}
              <div>
                <Label className="text-xs">상태</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 강의 여부 */}
              <div className="col-span-2">
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
              <div className="col-span-2">
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
                <Input value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} className="h-8 text-sm" />
              </div>

              {/* 인스타그램 */}
              <div>
                <Label className="text-xs">인스타그램</Label>
                <Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="h-8 text-sm" />
              </div>

              {/* 참조 링크 (복수) */}
              <div className="col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">참조 링크</Label>
                  <button
                    type="button"
                    onClick={() => setRefLinks([...refLinks, ""])}
                    className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <Plus className="h-3.5 w-3.5" />추가
                  </button>
                </div>
                {refLinks.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-1 mt-1.5">
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
                ))}
              </div>

              {/* 이메일 */}
              <div>
                <Label className="text-xs">이메일</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 text-sm" />
              </div>

              {/* 전화번호 */}
              <div>
                <Label className="text-xs">전화번호</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-8 text-sm" />
              </div>

              {/* 비고 */}
              <div className="col-span-2">
                <Label className="text-xs">비고</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="h-8 text-sm" />
              </div>

              {/* 찾은 사람 + 출처 */}
              <div className="col-span-2 flex items-end gap-4">
                <div className="w-[140px] shrink-0 relative">
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
                <div className="flex-1">
                  <Label className="text-xs">출처</Label>
                  <div className="flex gap-1.5 mt-1">
                    {SOURCES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm({ ...form, source: s })}
                        className={`h-8 px-2.5 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
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
            </div>

            <div className="flex justify-end gap-2 mt-1">
              <Button variant="outline" size="sm" className="h-8 text-sm" onClick={onClose}>취소</Button>
              <Button size="sm" className="h-8 text-sm" onClick={() => handleSubmit(false)} disabled={saving}>
                {saving ? "저장 중..." : "추가"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
