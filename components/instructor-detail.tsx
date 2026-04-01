"use client";

import { useState, useEffect, useCallback } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STATUS_COLORS, ASSIGNEES, OUTREACH_CHANNELS, WAVE_RESULTS } from "@/lib/constants";
import { getNextStatuses, requiresReason } from "@/lib/status-machine";
import type { Instructor, InstructorStatus, StatusHistory, OutreachWave } from "@/lib/types";
import { toast } from "sonner";
import { ExternalLink, Clock, Send, Pencil, Trash2 } from "lucide-react";

interface Props {
  instructor: Instructor;
  onClose: () => void;
}

export default function InstructorDetail({ instructor, onClose }: Props) {
  const { dispatch, loadInstructors, loadStats } = useOutreach();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(instructor);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [waves, setWaves] = useState<OutreachWave[]>([]);
  const [statusChange, setStatusChange] = useState({ to: "", reason: "", changed_by: "" });

  const loadDetails = useCallback(async () => {
    const [hRes, wRes] = await Promise.all([
      fetch(`/api/instructors/${instructor.id}/history`),
      fetch(`/api/instructors/${instructor.id}/waves`),
    ]);
    const [h, w] = await Promise.all([hRes.json(), wRes.json()]);
    setHistory(h);
    setWaves(w);
  }, [instructor.id]);

  useEffect(() => { loadDetails(); }, [loadDetails]);
  useEffect(() => { setForm(instructor); }, [instructor]);

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/instructors/${instructor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = await res.json();
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: updated });
      setEditing(false);
      toast.success("저장되었습니다.");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleStatusChange = async () => {
    if (!statusChange.to) return;
    try {
      const body: any = {
        status: statusChange.to,
        _changed_by: statusChange.changed_by,
        _reason: statusChange.reason,
      };
      if (requiresReason(statusChange.to as InstructorStatus)) {
        body.exclude_reason = statusChange.reason;
      }
      const res = await fetch(`/api/instructors/${instructor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = await res.json();
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: updated });
      await Promise.all([loadDetails(), loadStats()]);
      setStatusChange({ to: "", reason: "", changed_by: "" });
      toast.success(`상태가 '${statusChange.to}'(으)로 변경되었습니다.`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleWaveUpdate = async (waveNumber: number, field: string, value: string) => {
    try {
      const existing = waves.find((w) => w.wave_number === waveNumber);
      const body: any = { wave_number: waveNumber, [field]: value };
      if (existing) {
        body.sent_date = existing.sent_date;
        body.result = existing.result;
        body[field] = value;
      }
      const res = await fetch(`/api/instructors/${instructor.id}/waves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadDetails();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await fetch(`/api/instructors/${instructor.id}`, { method: "DELETE" });
      dispatch({ type: "DELETE_INSTRUCTOR", id: instructor.id });
      onClose();
      toast.success("삭제되었습니다.");
    } catch {
      toast.error("삭제에 실패했습니다.");
    }
  };

  const nextStatuses = getNextStatuses(instructor.status as InstructorStatus);

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent className="w-[420px] sm:max-w-[420px] p-0">
        <SheetHeader className="px-4 pt-4 pb-2.5 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-semibold">{instructor.name}</SheetTitle>
            <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[instructor.status as InstructorStatus] || ""}`}>
              {instructor.status}
            </Badge>
          </div>
          {instructor.field && <p className="text-[11px] text-muted-foreground">{instructor.field} | {instructor.assignee || "미지정"}</p>}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="px-4 py-3 space-y-4">
            {/* 상태 전이 */}
            {nextStatuses.length > 0 && (
              <div className="space-y-1.5 p-2.5 rounded-md border bg-muted/30">
                <p className="text-[11px] font-semibold">상태 변경</p>
                <div className="flex gap-1 flex-wrap">
                  {nextStatuses.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={statusChange.to === s ? "default" : "outline"}
                      className="h-6 text-[10px] px-2"
                      onClick={() => setStatusChange({ ...statusChange, to: s })}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
                {statusChange.to && (
                  <div className="space-y-1.5 mt-1.5">
                    <Select
                      value={statusChange.changed_by}
                      onValueChange={(v) => setStatusChange({ ...statusChange, changed_by: v })}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="변경자 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNEES.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {requiresReason(statusChange.to as InstructorStatus) && (
                      <Input
                        placeholder="사유 입력 (필수)"
                        className="h-7 text-xs"
                        value={statusChange.reason}
                        onChange={(e) => setStatusChange({ ...statusChange, reason: e.target.value })}
                      />
                    )}
                    <Button size="sm" className="h-7 text-xs" onClick={handleStatusChange}>변경 확인</Button>
                  </div>
                )}
              </div>
            )}

            {/* 기본 정보 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold">기본 정보</p>
                {!editing && (
                  <button className="text-[10px] text-primary hover:underline flex items-center gap-0.5" onClick={() => setEditing(true)}>
                    <Pencil className="h-2.5 w-2.5" />수정
                  </button>
                )}
              </div>
              {editing ? (
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-[10px]">이름</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-7 text-xs" /></div>
                  <div><Label className="text-[10px]">분야</Label><Input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} className="h-7 text-xs" /></div>
                  <div>
                    <Label className="text-[10px]">담당자</Label>
                    <Select value={form.assignee} onValueChange={(v) => setForm({ ...form, assignee: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px]">이메일</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-7 text-xs" /></div>
                  <div><Label className="text-[10px]">인스타그램</Label><Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="h-7 text-xs" /></div>
                  <div><Label className="text-[10px]">유튜브</Label><Input value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} className="h-7 text-xs" /></div>
                  <div><Label className="text-[10px]">전화번호</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-7 text-xs" /></div>
                  <div>
                    <Label className="text-[10px]">강의이력</Label>
                    <Select value={form.has_lecture_history || ""} onValueChange={(v) => setForm({ ...form, has_lecture_history: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="O">O</SelectItem>
                        <SelectItem value="X">X</SelectItem>
                        <SelectItem value="?">?</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Label className="text-[10px]">강의 플랫폼</Label><Input value={form.lecture_platform} onChange={(e) => setForm({ ...form, lecture_platform: e.target.value })} className="h-7 text-xs" /></div>
                  <div className="col-span-2"><Label className="text-[10px]">참조 링크</Label><Input value={form.ref_link} onChange={(e) => setForm({ ...form, ref_link: e.target.value })} className="h-7 text-xs" /></div>
                  <div className="col-span-2"><Label className="text-[10px]">미팅 일정</Label><Input value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} className="h-7 text-xs" /></div>
                  <div className="col-span-2"><Label className="text-[10px]">미팅 메모</Label><Textarea value={form.meeting_memo} onChange={(e) => setForm({ ...form, meeting_memo: e.target.value })} rows={3} className="text-xs" /></div>
                  <div className="col-span-2"><Label className="text-[10px]">비고</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-xs" /></div>
                  <div className="col-span-2 flex gap-1.5">
                    <Button size="sm" className="h-7 text-xs" onClick={handleSave}>저장</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setForm(instructor); setEditing(false); }}>취소</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-xs">
                  <InfoRow label="이메일" value={instructor.email} />
                  <InfoRow label="인스타" value={instructor.instagram} link />
                  <InfoRow label="유튜브" value={instructor.youtube} link />
                  <InfoRow label="전화" value={instructor.phone} />
                  <InfoRow label="강의이력" value={instructor.has_lecture_history} />
                  <InfoRow label="플랫폼" value={instructor.lecture_platform} />
                  <InfoRow label="참조링크" value={instructor.ref_link} link />
                  <InfoRow label="미팅일정" value={instructor.meeting_date} />
                  <InfoRow label="출처" value={instructor.source} />
                  {instructor.exclude_reason && <InfoRow label="제외사유" value={instructor.exclude_reason} />}
                  {instructor.meeting_memo && (
                    <div className="pt-1">
                      <span className="text-muted-foreground text-[10px]">미팅메모</span>
                      <p className="whitespace-pre-wrap text-[11px] bg-muted p-1.5 rounded mt-0.5">{instructor.meeting_memo}</p>
                    </div>
                  )}
                  {instructor.notes && (
                    <div className="pt-1">
                      <span className="text-muted-foreground text-[10px]">비고</span>
                      <p className="whitespace-pre-wrap text-[11px] bg-muted p-1.5 rounded mt-0.5">{instructor.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* 발송 타임라인 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Send className="h-3 w-3" />
                <p className="text-[11px] font-semibold">발송 타임라인</p>
              </div>
              <div className="space-y-1.5">
                {[1, 2, 3].map((n) => {
                  const wave = waves.find((w) => w.wave_number === n);
                  return (
                    <div key={n} className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 w-9 justify-center">{n}차</Badge>
                      <Input
                        type="date"
                        className="w-[120px] h-6 text-[10px]"
                        value={wave?.sent_date || ""}
                        onChange={(e) => handleWaveUpdate(n, "sent_date", e.target.value)}
                      />
                      <Select
                        value={wave?.result || "_none"}
                        onValueChange={(v) => handleWaveUpdate(n, "result", v === "_none" ? "" : v)}
                      >
                        <SelectTrigger className="w-[80px] h-6 text-[10px]">
                          <SelectValue placeholder="결과" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">미발송</SelectItem>
                          {WAVE_RESULTS.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* 상태 이력 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <p className="text-[11px] font-semibold">상태 변경 이력</p>
              </div>
              {history.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">이력이 없습니다.</p>
              ) : (
                <div className="space-y-1">
                  {history.map((h) => (
                    <div key={h.id} className="border-l-2 border-muted pl-2 py-0.5">
                      <div className="flex items-center gap-1 text-[10px]">
                        {h.from_status && (
                          <>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">{h.from_status}</Badge>
                            <span className="text-muted-foreground">→</span>
                          </>
                        )}
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{h.to_status}</Badge>
                        {h.changed_by && <span className="text-muted-foreground ml-0.5">{h.changed_by}</span>}
                      </div>
                      {h.reason && <p className="text-[10px] text-muted-foreground">{h.reason}</p>}
                      <p className="text-[10px] text-muted-foreground">{new Date(h.created_at).toLocaleString("ko-KR")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDelete}>
              <Trash2 className="h-3 w-3 mr-1" />강사 삭제
            </Button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ label, value, link }: { label: string; value?: string; link?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-1.5 py-0.5">
      <span className="text-muted-foreground text-[10px] min-w-[52px] shrink-0">{label}</span>
      {link && value.startsWith("http") ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5 break-all">
          {value.length > 40 ? value.slice(0, 40) + "..." : value}
          <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
        </a>
      ) : (
        <span className="text-[11px] break-all">{value}</span>
      )}
    </div>
  );
}
