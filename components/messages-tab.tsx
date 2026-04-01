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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { MessageTemplate } from "@/lib/types";
import { toast } from "sonner";
import { Mail, MessageSquare, Plus, Save } from "lucide-react";

export default function MessagesTab() {
  const { state, loadTemplates } = useOutreach();
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (state.templates.length === 0) loadTemplates();
  }, []);

  const grouped = state.templates.reduce<Record<string, MessageTemplate[]>>(
    (acc, t) => {
      const key = t.channel || "기타";
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    },
    {}
  );

  const handleSave = async (template: Partial<MessageTemplate>) => {
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      });
      if (!res.ok) throw new Error("Failed");
      await loadTemplates();
      setEditing(null);
      setShowNew(false);
      toast.success("저장되었습니다.");
    } catch {
      toast.error("저장에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">메시지 템플릿</h2>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-1" />
          템플릿 추가
        </Button>
      </div>

      {state.templates.length === 0 && !showNew ? (
        <div className="text-center py-12 text-muted-foreground">
          등록된 템플릿이 없습니다. 템플릿을 추가하세요.
        </div>
      ) : (
        Object.entries(grouped).map(([channel, templates]) => (
          <div key={channel} className="space-y-3">
            <div className="flex items-center gap-2">
              {channel === "DM" ? (
                <MessageSquare className="h-4 w-4" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <h3 className="text-base font-medium">{channel}</h3>
            </div>
            <div className="grid gap-3">
              {templates.map((t) => (
                <Card key={t.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        {t.name}
                        {t.variant_label && (
                          <Badge variant="outline" className="text-xs">
                            {t.variant_label}
                          </Badge>
                        )}
                      </CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(t)}
                      >
                        수정
                      </Button>
                    </div>
                    {t.subject && (
                      <p className="text-xs text-muted-foreground">
                        제목: {t.subject}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs whitespace-pre-wrap bg-muted p-3 rounded-md max-h-[200px] overflow-y-auto">
                      {t.body}
                    </pre>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Separator />
          </div>
        ))
      )}

      {/* 편집/추가 다이얼로그 */}
      {(editing || showNew) && (
        <TemplateEditor
          template={editing}
          onSave={handleSave}
          onClose={() => {
            setEditing(null);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onSave,
  onClose,
}: {
  template: MessageTemplate | null;
  onSave: (t: Partial<MessageTemplate>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    id: template?.id || undefined,
    name: template?.name || "",
    channel: template?.channel || "DM",
    subject: template?.subject || "",
    body: template?.body || "",
    variant_label: template?.variant_label || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name || !form.body) {
      toast.error("이름과 본문을 입력하세요.");
      return;
    }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle className="text-sm">
          {template ? "템플릿 수정" : "새 템플릿"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">이름</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="1차메시지"
            />
          </div>
          <div>
            <Label className="text-xs">채널</Label>
            <Select
              value={form.channel}
              onValueChange={(v) => setForm({ ...form, channel: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DM">DM</SelectItem>
                <SelectItem value="이메일">이메일</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">변형</Label>
            <Input
              value={form.variant_label}
              onChange={(e) => setForm({ ...form, variant_label: e.target.value })}
              placeholder="선택사항"
            />
          </div>
        </div>
        {form.channel === "이메일" && (
          <div>
            <Label className="text-xs">이메일 제목</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>
        )}
        <div>
          <Label className="text-xs">본문</Label>
          <Textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={10}
            placeholder="메시지 본문..."
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "저장 중..." : "저장"}
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            취소
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
