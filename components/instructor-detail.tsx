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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STATUS_COLORS, STATUSES, ASSIGNEES, WAVE_RESULTS } from "@/lib/constants";
import { requiresReason } from "@/lib/status-machine";
import type { Instructor, InstructorStatus, StatusHistory, OutreachWave } from "@/lib/types";
import { toast } from "sonner";
import { ExternalLink, Clock, Send, Pencil, Trash2, ArrowRight, Plus, Minus } from "lucide-react";

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
  const [refLinks, setRefLinks] = useState<string[]>([""]);
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
        body: JSON.stringify({ ...form, _expected_updated_at: instructor.updated_at }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error("다른 사용자가 이미 수정했습니다. 새로고침합니다.");
        const refreshRes = await fetch(`/api/instructors/${instructor.id}`);
        if (refreshRes.ok) {
          const refreshed = await refreshRes.json();
          dispatch({ type: "UPDATE_INSTRUCTOR", instructor: refreshed });
          setForm(refreshed);
        }
        return;
      }
      if (!res.ok) throw new Error(data.error);
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: data });
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
        _expected_updated_at: instructor.updated_at,
      };
      if (requiresReason(statusChange.to as InstructorStatus)) {
        body.exclude_reason = statusChange.reason;
      }
      if (statusChange.to === "컨펌 필요") {
        body.confirm_reason = statusChange.reason;
      }
      const res = await fetch(`/api/instructors/${instructor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.error("다른 사용자가 이미 수정했습니다. 새로고침합니다.");
        const refreshRes = await fetch(`/api/instructors/${instructor.id}`);
        if (refreshRes.ok) {
          const refreshed = await refreshRes.json();
          dispatch({ type: "UPDATE_INSTRUCTOR", instructor: refreshed });
          setForm(refreshed);
        }
        return;
      }
      if (!res.ok) throw new Error(data.error);
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: data });
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

  const nextStatuses = STATUSES.filter(s => s !== instructor.status);

  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent className="w-[460px] sm:max-w-[460px] p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold">{instructor.name}</SheetTitle>
            <Badge className={`text-xs px-2 py-0.5 ${STATUS_COLORS[instructor.status as InstructorStatus] || ""}`}>
              {instructor.status}
            </Badge>
          </div>
          {instructor.field && <p className="text-sm text-muted-foreground">{instructor.field} | {instructor.assignee || "미지정"}</p>}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-90px)]">
          <div className="px-5 py-4 space-y-5">
            {/* 상태 변경 */}
            {nextStatuses.length > 0 && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <p className="text-sm font-semibold">상태 변경</p>
                <div className="flex gap-1.5 flex-wrap">
                  {nextStatuses.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={statusChange.to === s ? "default" : "outline"}
                      className="h-8 text-xs"
                      onClick={() => setStatusChange({ ...statusChange, to: s })}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
                {statusChange.to && (
                  <div className="space-y-2 mt-2">
                    <Select
                      value={statusChange.changed_by}
                      onValueChange={(v) => setStatusChange({ ...statusChange, changed_by: v })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="변경자 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {(requiresReason(statusChange.to as InstructorStatus) || statusChange.to === "컨펌 필요") && (
                      <Input
                        placeholder={statusChange.to === "컨펌 필요" ? "메모 입력 (선택)..." : "사유 입력 (필수)"}
                        className="h-8 text-sm"
                        value={statusChange.reason}
                        onChange={(e) => setStatusChange({ ...statusChange, reason: e.target.value })}
                      />
                    )}
                    <Button size="sm" className="h-8 text-sm" onClick={handleStatusChange}>변경 확인</Button>
                  </div>
                )}
              </div>
            )}

            {/* 기본 정보 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">기본 정보</p>
                {!editing && (
                  <button className="text-xs text-primary hover:underline flex items-center gap-1" onClick={() => {
                    const links = form.ref_link ? form.ref_link.split(/\s*,\s*/).filter(Boolean) : [""];
                    setRefLinks(links.length ? links : [""]);
                    setEditing(true);
                  }}>
                    <Pencil className="h-3 w-3" />수정
                  </button>
                )}
              </div>
              {editing ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <div><Label className="text-xs">이름</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-sm" /></div>
                  <div><Label className="text-xs">분야</Label><Input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} className="h-8 text-sm" /></div>
                  <div>
                    <Label className="text-xs">담당자</Label>
                    <Select value={form.assignee} onValueChange={(v) => setForm({ ...form, assignee: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{ASSIGNEES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">이메일</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 text-sm" /></div>
                  <div><Label className="text-xs">인스타그램</Label><Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="h-8 text-sm" /></div>
                  <div><Label className="text-xs">유튜브</Label><Input value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} className="h-8 text-sm" /></div>
                  <div><Label className="text-xs">전화번호</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-8 text-sm" /></div>
                  <div>
                    <Label className="text-xs">강의이력</Label>
                    <Select value={form.has_lecture_history || ""} onValueChange={(v) => setForm({ ...form, has_lecture_history: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="O">O</SelectItem>
                        <SelectItem value="X">X</SelectItem>
                        <SelectItem value="?">?</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                  <div className="col-span-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">참조 링크</Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        onClick={() => {
                          const next = [...refLinks, ""];
                          setRefLinks(next);
                          setForm({ ...form, ref_link: next.filter((l) => l.trim()).join(" , ") });
                        }}
                      >
                        <Plus className="h-3 w-3" />추가
                      </button>
                    </div>
                    {refLinks.map((link, idx) => (
                      <div key={idx} className="flex gap-1 mt-1">
                        <Input
                          value={link}
                          placeholder="https://"
                          onChange={(e) => {
                            const next = [...refLinks];
                            next[idx] = e.target.value;
                            setRefLinks(next);
                            setForm({ ...form, ref_link: next.filter((l) => l.trim()).join(" , ") });
                          }}
                          className="h-8 text-sm"
                        />
                        {refLinks.length > 1 && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={() => {
                              const next = refLinks.filter((_, i) => i !== idx);
                              setRefLinks(next);
                              setForm({ ...form, ref_link: next.filter((l) => l.trim()).join(" , ") });
                            }}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="col-span-2"><Label className="text-xs">미팅 일정</Label><Input value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} className="h-8 text-sm" /></div>
                  <div className="col-span-2"><Label className="text-xs">미팅 메모</Label><Textarea value={form.meeting_memo} onChange={(e) => setForm({ ...form, meeting_memo: e.target.value })} rows={3} className="text-sm" /></div>
                  <div className="col-span-2"><Label className="text-xs">비고</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm" /></div>
                  <div className="col-span-2 flex gap-2">
                    <Button size="sm" className="h-8 text-sm" onClick={handleSave}>저장</Button>
                    <Button size="sm" variant="outline" className="h-8 text-sm" onClick={() => { setForm(instructor); setEditing(false); }}>취소</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 text-sm">
                  <InfoRow label="이메일" value={instructor.email} />
                  <InfoRow label="인스타" value={instructor.instagram} link />
                  <InfoRow label="유튜브" value={instructor.youtube} link />
                  <InfoRow label="전화" value={instructor.phone} />
                  <InfoRow label="강의이력" value={instructor.has_lecture_history} />
                  {instructor.lecture_platform && (
                    <div className="flex items-start gap-2 py-0.5">
                      <span className="text-xs text-muted-foreground min-w-[60px] shrink-0 pt-0.5">플랫폼</span>
                      {instructor.lecture_platform_url ? (
                        <a
                          href={instructor.lecture_platform_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1 break-all"
                        >
                          {instructor.lecture_platform}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-sm break-all">{instructor.lecture_platform}</span>
                      )}
                    </div>
                  )}
                  {instructor.ref_link && (() => {
                    const links = instructor.ref_link.split(/\s*,\s*/).filter(Boolean);
                    if (links.length <= 1) return <InfoRow label="참조링크" value={instructor.ref_link} link />;
                    return (
                      <div className="flex items-start gap-2 py-0.5">
                        <span className="text-xs text-muted-foreground min-w-[60px] shrink-0 pt-0.5">참조링크</span>
                        <div className="space-y-0.5">
                          {links.map((l, i) => (
                            <a key={i} href={l} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1 break-all">
                              {l.length > 35 ? l.slice(0, 35) + "..." : l}
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <InfoRow label="미팅일정" value={instructor.meeting_date} />
                  <InfoRow label="출처" value={instructor.source} />
                  {instructor.exclude_reason && <InfoRow label="제외사유" value={instructor.exclude_reason} />}
                  {instructor.meeting_memo && (
                    <div className="pt-1">
                      <span className="text-xs text-muted-foreground">미팅메모</span>
                      <p className="whitespace-pre-wrap text-sm bg-muted p-2 rounded mt-0.5">{instructor.meeting_memo}</p>
                    </div>
                  )}
                  {instructor.notes && (
                    <div className="pt-1">
                      <span className="text-xs text-muted-foreground">비고</span>
                      <p className="whitespace-pre-wrap text-sm bg-muted p-2 rounded mt-0.5">{instructor.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* 발송 타임라인 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  <p className="text-sm font-semibold">발송 타임라인</p>
                </div>
                <button
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                  onClick={() => { dispatch({ type: "SET_TAB", tab: "contact" }); onClose(); }}
                >
                  컨택관리에서 수정
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map((n) => {
                  const wave = waves.find((w) => w.wave_number === n);
                  return (
                    <div key={n} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs px-2 py-0.5 w-10 justify-center">{n}차</Badge>
                      <span className="w-[140px] h-7 text-xs flex items-center px-2 border rounded-md bg-muted/40 text-muted-foreground">
                        {wave?.sent_date || "날짜 없음"}
                      </span>
                      <span className="w-[100px] h-7 text-xs flex items-center px-2 border rounded-md bg-muted/40 text-muted-foreground">
                        {wave?.result || "무응답"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* 상태 이력 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <p className="text-sm font-semibold">상태 변경 이력</p>
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">이력이 없습니다.</p>
              ) : (
                <div className="space-y-1.5">
                  {history.map((h) => (
                    <div key={h.id} className="border-l-2 border-muted pl-3 py-1">
                      <div className="flex items-center gap-1 text-xs">
                        {h.from_status && (
                          <>
                            <Badge variant="outline" className="text-xs px-1.5 py-0">{h.from_status}</Badge>
                            <span className="text-muted-foreground">→</span>
                          </>
                        )}
                        <Badge variant="outline" className="text-xs px-1.5 py-0">{h.to_status}</Badge>
                        {h.changed_by && <span className="text-muted-foreground ml-1">{h.changed_by}</span>}
                      </div>
                      {h.reason && <p className="text-xs text-muted-foreground mt-0.5">{h.reason}</p>}
                      <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("ko-KR")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <Button variant="destructive" size="sm" className="h-8 text-sm" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />강사 삭제
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
    <div className="flex items-start gap-2 py-0.5">
      <span className="text-xs text-muted-foreground min-w-[60px] shrink-0 pt-0.5">{label}</span>
      {link && value.startsWith("http") ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1 break-all">
          {value.length > 35 ? value.slice(0, 35) + "..." : value}
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      ) : (
        <span className="text-sm break-all">{value}</span>
      )}
    </div>
  );
}
