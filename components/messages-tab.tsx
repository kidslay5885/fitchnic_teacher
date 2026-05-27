"use client";

import { useEffect, useState, Fragment } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { MessageTemplate } from "@/lib/types";
import { toast } from "sonner";
import { Mail, MessageSquare, Plus, Save } from "lucide-react";

// 이메일 발신 계정 → 섹션 정보 (컨택관리 발송수단 색과 동일 기준: ceo→대표/파랑, business.center→팀/청록)
type SenderSection = { key: string; label: string; headerClass: string; dotClass: string; borderClass: string };

function senderSection(
  senderId: string | null | undefined,
  accountMap: Record<string, { label: string; email: string }>,
): SenderSection {
  const acc = senderId ? accountMap[senderId] : null;
  const local = acc ? acc.email.split("@")[0] : null;
  if (local === "business.center")
    return { key: "team", label: "콘텐츠개발팀 이메일", headerClass: "text-teal-700", dotClass: "bg-teal-500", borderClass: "border-l-4 border-l-teal-400" };
  // sender 미지정(공용) 또는 ceo → 대표님 이메일
  if (!acc || local === "ceo")
    return { key: "ceo", label: "대표님 이메일", headerClass: "text-blue-700", dotClass: "bg-blue-500", borderClass: "border-l-4 border-l-blue-400" };
  return { key: `etc:${senderId}`, label: `${acc.label} 이메일`, headerClass: "text-slate-700", dotClass: "bg-slate-400", borderClass: "border-l-4 border-l-slate-300" };
}

// 이메일 외 채널 카드 좌측 테두리 색 (컨택관리 발송수단 색과 동일: DM→보라, SMS→amber)
function channelBorderClass(channel: string): string {
  if (channel === "DM") return "border-l-4 border-l-purple-400";
  if (channel === "SMS") return "border-l-4 border-l-amber-400";
  return "";
}

// 차수(1차/2차/3차) 오름차순 정렬
function byVariant(a: MessageTemplate, b: MessageTemplate) {
  const n = (x: MessageTemplate) => parseInt(String(x.variant_label || "").replace(/\D/g, ""), 10) || 99;
  return n(a) - n(b);
}

// 이메일 템플릿을 발신 계정 섹션별로 묶음 (대표 → 팀 → 기타 순, 섹션 내 차수 순)
function groupEmailBySender(templates: MessageTemplate[], accountMap: Record<string, { label: string; email: string }>) {
  const buckets: Record<string, SenderSection & { items: MessageTemplate[] }> = {};
  for (const t of templates) {
    const sec = senderSection(t.sender_account_id, accountMap);
    if (!buckets[sec.key]) buckets[sec.key] = { ...sec, items: [] };
    buckets[sec.key].items.push(t);
  }
  const order: Record<string, number> = { ceo: 0, team: 1 };
  return Object.values(buckets)
    .sort((a, b) => (order[a.key] ?? 9) - (order[b.key] ?? 9))
    .map((s) => ({ ...s, items: [...s.items].sort(byVariant) }));
}

export default function MessagesTab() {
  const { state, loadTemplates } = useOutreach();
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [showNew, setShowNew] = useState(false);
  // 발신 계정 id → {label, email} 매핑. 이메일 템플릿을 계정별 섹션으로 묶고 색 분기하는 데 사용
  const [accountMap, setAccountMap] = useState<Record<string, { label: string; email: string }>>({});

  useEffect(() => { if (state.templates.length === 0) loadTemplates(); }, []);

  // 발신 계정 목록 로드 (컨택관리 발송수단 색과 동일 기준)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/gmail-accounts", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const map: Record<string, { label: string; email: string }> = {};
        for (const a of data.accounts ?? []) map[a.id] = { label: a.label, email: a.email };
        setAccountMap(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const grouped = state.templates.reduce<Record<string, MessageTemplate[]>>((acc, t) => {
    const key = t.channel || "기타";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const handleSave = async (template: Partial<MessageTemplate>) => {
    try {
      const res = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(template) });
      if (!res.ok) throw new Error("Failed");
      await loadTemplates();
      setEditing(null);
      setShowNew(false);
      toast.success("저장 완료");
    } catch { toast.error("저장 실패"); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">메시지 템플릿</h2>
        <Button size="sm" className="h-8 text-sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-1" />템플릿 추가
        </Button>
      </div>

      {state.templates.length === 0 && !showNew ? (
        <div className="text-center py-12 text-sm text-muted-foreground">등록된 템플릿이 없습니다.</div>
      ) : (
        Object.entries(grouped).map(([channel, templates]) => {
          // 이메일은 발신 계정별 색 섹션으로, 그 외 채널은 단일 그룹으로 렌더
          const sections =
            channel === "이메일"
              ? groupEmailBySender(templates, accountMap)
              : [{ key: "_all", label: "", headerClass: "", dotClass: "", borderClass: channelBorderClass(channel), items: templates }];
          return (
            <div key={channel} className="space-y-3">
              <div className="flex items-center gap-2">
                {channel === "DM" ? <MessageSquare className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{channel}</h3>
              </div>
              {sections.map((sec) => (
                <div key={sec.key} className="space-y-2.5">
                  {sec.label && (
                    <div className="flex items-center gap-1.5 pl-0.5 pt-1">
                      <span className={`h-2 w-2 rounded-full ${sec.dotClass}`} />
                      <span className={`text-xs font-semibold ${sec.headerClass}`}>{sec.label}</span>
                    </div>
                  )}
                  {sec.items.map((t) => (
                    <Fragment key={t.id}>
                      <Card className={`py-0 ${sec.borderClass}`}>
                        <CardHeader className="py-3 px-5">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm flex items-center gap-2">
                              {t.name}
                              {t.variant_label && <Badge variant="outline" className="text-xs px-2 py-0">{t.variant_label}</Badge>}
                            </CardTitle>
                            <button
                              className="text-xs text-primary hover:underline"
                              onClick={() => setEditing(editing?.id === t.id ? null : t)}
                            >
                              {editing?.id === t.id ? "닫기" : "수정"}
                            </button>
                          </div>
                          {t.subject && <p className="text-xs text-muted-foreground">제목: {t.subject}</p>}
                        </CardHeader>
                        <CardContent className="px-5 pb-4">
                          <pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md max-h-[180px] overflow-y-auto leading-relaxed">{t.body}</pre>
                        </CardContent>
                      </Card>
                      {editing?.id === t.id && (
                        <TemplateEditor template={editing} onSave={handleSave} onClose={() => setEditing(null)} />
                      )}
                    </Fragment>
                  ))}
                </div>
              ))}
              <Separator />
            </div>
          );
        })
      )}

      {showNew && (
        <TemplateEditor template={null} onSave={handleSave} onClose={() => setShowNew(false)} />
      )}
    </div>
  );
}

function TemplateEditor({ template, onSave, onClose }: { template: MessageTemplate | null; onSave: (t: Partial<MessageTemplate>) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState({ id: template?.id, name: template?.name || "", channel: template?.channel || "DM", subject: template?.subject || "", body: template?.body || "", variant_label: template?.variant_label || "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name || !form.body) { toast.error("이름과 본문 필수"); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Card className="border-primary py-0">
      <CardContent className="p-5 space-y-3">
        <p className="text-sm font-semibold">{template ? "템플릿 수정" : "새 템플릿"}</p>
        <div className="grid grid-cols-3 gap-3">
          <div><Label className="text-xs">이름</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-sm" placeholder="1차메시지" /></div>
          <div>
            <Label className="text-xs">채널</Label>
            <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="DM">DM</SelectItem><SelectItem value="이메일">이메일</SelectItem><SelectItem value="SMS">SMS</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">변형</Label><Input value={form.variant_label} onChange={(e) => setForm({ ...form, variant_label: e.target.value })} className="h-8 text-sm" /></div>
        </div>
        {form.channel === "이메일" && <div><Label className="text-xs">제목</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="h-8 text-sm" /></div>}
        <div><Label className="text-xs">본문</Label><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={8} className="text-sm" /></div>
        {form.channel === "이메일" && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 leading-relaxed">
            <span className="font-semibold">자동 치환 변수</span>: 제목/본문 안의 <code className="bg-background px-1 rounded">&apos;채널이름&apos;</code> → 강사명, <code className="bg-background px-1 rounded">&apos;채널분야&apos;</code> → 분야로 자동 치환됩니다. (컨택관리 · 메일 자동 발송 기준)
            <br />
            <span className="font-semibold">변형 이름</span>: 자동 발송에 사용하려면 <code className="bg-background px-1 rounded">1차</code> / <code className="bg-background px-1 rounded">2차</code> / <code className="bg-background px-1 rounded">3차</code> 중 하나를 정확히 입력하세요.
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" className="h-8 text-sm" onClick={handleSubmit} disabled={saving}><Save className="h-3.5 w-3.5 mr-1" />{saving ? "저장 중..." : "저장"}</Button>
          <Button size="sm" variant="outline" className="h-8 text-sm" onClick={onClose}>취소</Button>
        </div>
      </CardContent>
    </Card>
  );
}
