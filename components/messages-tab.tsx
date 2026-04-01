"use client";

import { useEffect, useState } from "react";
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

export default function MessagesTab() {
  const { state, loadTemplates } = useOutreach();
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => { if (state.templates.length === 0) loadTemplates(); }, []);

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">메시지 템플릿</h2>
        <Button size="sm" className="h-7 text-xs" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />템플릿 추가
        </Button>
      </div>

      {state.templates.length === 0 && !showNew ? (
        <div className="text-center py-8 text-xs text-muted-foreground">등록된 템플릿이 없습니다.</div>
      ) : (
        Object.entries(grouped).map(([channel, templates]) => (
          <div key={channel} className="space-y-2">
            <div className="flex items-center gap-1.5">
              {channel === "DM" ? <MessageSquare className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{channel}</h3>
            </div>
            {templates.map((t) => (
              <Card key={t.id} className="py-0">
                <CardHeader className="py-2 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs flex items-center gap-1.5">
                      {t.name}
                      {t.variant_label && <Badge variant="outline" className="text-[10px] px-1 py-0">{t.variant_label}</Badge>}
                    </CardTitle>
                    <button className="text-[10px] text-primary hover:underline" onClick={() => setEditing(t)}>수정</button>
                  </div>
                  {t.subject && <p className="text-[10px] text-muted-foreground">제목: {t.subject}</p>}
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <pre className="text-[11px] whitespace-pre-wrap bg-muted p-2.5 rounded-md max-h-[150px] overflow-y-auto leading-relaxed">{t.body}</pre>
                </CardContent>
              </Card>
            ))}
            <Separator />
          </div>
        ))
      )}

      {(editing || showNew) && (
        <TemplateEditor template={editing} onSave={handleSave} onClose={() => { setEditing(null); setShowNew(false); }} />
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
      <CardContent className="p-4 space-y-2.5">
        <p className="text-xs font-semibold">{template ? "템플릿 수정" : "새 템플릿"}</p>
        <div className="grid grid-cols-3 gap-2">
          <div><Label className="text-[10px]">이름</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-7 text-xs" placeholder="1차메시지" /></div>
          <div>
            <Label className="text-[10px]">채널</Label>
            <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="DM">DM</SelectItem><SelectItem value="이메일">이메일</SelectItem><SelectItem value="SMS">SMS</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="text-[10px]">변형</Label><Input value={form.variant_label} onChange={(e) => setForm({ ...form, variant_label: e.target.value })} className="h-7 text-xs" /></div>
        </div>
        {form.channel === "이메일" && <div><Label className="text-[10px]">제목</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="h-7 text-xs" /></div>}
        <div><Label className="text-[10px]">본문</Label><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={8} className="text-xs" /></div>
        <div className="flex gap-1.5">
          <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={saving}><Save className="h-3 w-3 mr-1" />{saving ? "저장 중..." : "저장"}</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onClose}>취소</Button>
        </div>
      </CardContent>
    </Card>
  );
}
