"use client";

import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useOutreach } from "@/hooks/use-outreach-store";
import { toast } from "sonner";
import { Send, Mail, AlertTriangle, Check, X } from "lucide-react";
import type { Instructor, OutreachWave } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  selectedIds: Set<string>;
  instructors: Instructor[];
  wavesMap: Record<string, OutreachWave[]>;
  onComplete: () => void;
}

type Wave = 1 | 2 | 3;

interface SendResult {
  sent: { id: string; name: string }[];
  skipped: { id: string; name: string; reason: string }[];
  failed: { id: string; name: string; error: string }[];
  aborted?: { kind: string; label: string } | null;
}

// 클라이언트에서도 동일한 치환 (미리보기용)
function renderTemplate(template: string, vars: { name: string; field: string }) {
  return template
    .replaceAll("'채널이름'", vars.name || "")
    .replaceAll("'채널분야'", vars.field || "");
}

export default function SendEmailModal({ open, onClose, selectedIds, instructors, wavesMap, onComplete }: Props) {
  const { state, loadTemplates } = useOutreach();
  const [wave, setWave] = useState<Wave>(1);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    if (open && state.templates.length === 0) loadTemplates();
  }, [open, state.templates.length, loadTemplates]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setWave(1);
    }
  }, [open]);

  const selectedInstructors = useMemo(
    () => instructors.filter((i) => selectedIds.has(i.id)),
    [instructors, selectedIds],
  );

  const template = useMemo(
    () => state.templates.find((t) => t.channel === "이메일" && t.variant_label === `${wave}차`),
    [state.templates, wave],
  );

  // 분류
  const categorized = useMemo(() => {
    const toSend: Instructor[] = [];
    const noEmail: Instructor[] = [];
    const alreadySent: Instructor[] = [];
    const methodLocked: Instructor[] = [];
    for (const inst of selectedInstructors) {
      if (!inst.email || !inst.email.trim()) {
        noEmail.push(inst);
        continue;
      }
      // 발송 수단이 "이메일"이 아니면 발송 스킵 (DM, 기타 임의 값 모두)
      if (inst.send_method && inst.send_method !== "이메일") {
        methodLocked.push(inst);
        continue;
      }
      const waves = wavesMap[inst.id] || [];
      const has = waves.some((w) => w.wave_number === wave);
      if (has) {
        alreadySent.push(inst);
        continue;
      }
      toSend.push(inst);
    }
    return { toSend, noEmail, alreadySent, methodLocked };
  }, [selectedInstructors, wavesMap, wave]);

  // 미리보기 (발송 가능 첫 강사 기준)
  const previewInst = categorized.toSend[0] || selectedInstructors[0];
  const previewSubject = template && previewInst
    ? renderTemplate(template.subject, { name: previewInst.name, field: previewInst.field })
    : "";
  const previewBody = template && previewInst
    ? renderTemplate(template.body, { name: previewInst.name, field: previewInst.field })
    : "";

  const handleSend = async () => {
    if (categorized.toSend.length === 0) {
      toast.error("발송할 강사가 없습니다");
      return;
    }
    if (!template) {
      toast.error(`${wave}차 템플릿이 없습니다`);
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/outreach/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructorIds: categorized.toSend.map((i) => i.id),
          waveNumber: wave,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "발송 실패");
      setResult(data);
      if (data.sent.length > 0) toast.success(`${data.sent.length}명 발송 완료`);
      if (data.failed.length > 0) toast.error(`${data.failed.length}명 발송 실패`);
      onComplete();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> 이메일 자동 발송
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <ResultView result={result} onClose={onClose} />
        ) : (
          <div className="space-y-4">
            {/* 차수 선택 */}
            <div>
              <Label className="text-xs">차수 선택</Label>
              <div className="flex gap-2 mt-1.5">
                {([1, 2, 3] as Wave[]).map((n) => (
                  <button
                    key={n}
                    onClick={() => setWave(n)}
                    className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                      wave === n
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    }`}
                  >
                    {n}차
                  </button>
                ))}
              </div>
            </div>

            {/* 발송 요약 */}
            <div className="border rounded-md p-3 bg-muted/30 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">선택된 강사</span>
                <span className="font-semibold">{selectedInstructors.length}명</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-green-700 flex items-center gap-1">
                  <Send className="h-3.5 w-3.5" /> 발송 예정
                </span>
                <span className="font-semibold text-green-700">{categorized.toSend.length}명</span>
              </div>
              {categorized.noEmail.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-orange-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> 이메일 없음 (스킵)
                  </span>
                  <span className="font-semibold text-orange-700">{categorized.noEmail.length}명</span>
                </div>
              )}
              {categorized.alreadySent.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> 이미 {wave}차 발송됨 (스킵)
                  </span>
                  <span className="font-semibold text-gray-600">{categorized.alreadySent.length}명</span>
                </div>
              )}
              {categorized.methodLocked.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-purple-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> 발송 수단 이메일 아님 (스킵)
                  </span>
                  <span className="font-semibold text-purple-700">{categorized.methodLocked.length}명</span>
                </div>
              )}
            </div>

            {/* 스킵 대상 상세 */}
            {(categorized.noEmail.length > 0 || categorized.alreadySent.length > 0 || categorized.methodLocked.length > 0) && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  스킵 대상 보기
                </summary>
                <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                  {categorized.noEmail.map((i) => (
                    <div key={i.id} className="text-orange-700">· {i.name} — 이메일 없음</div>
                  ))}
                  {categorized.alreadySent.map((i) => (
                    <div key={i.id} className="text-gray-600">· {i.name} — 이미 {wave}차 발송됨</div>
                  ))}
                  {categorized.methodLocked.map((i) => (
                    <div key={i.id} className="text-purple-700">· {i.name} — 발송 수단 {i.send_method}</div>
                  ))}
                </div>
              </details>
            )}

            {/* 템플릿 미리보기 */}
            {!template ? (
              <div className="border rounded-md p-3 bg-red-50 text-sm text-red-700">
                {wave}차 이메일 템플릿이 등록되어 있지 않습니다. 메시지 탭에서 먼저 등록하세요.
              </div>
            ) : previewInst ? (
              <div>
                <Label className="text-xs">
                  미리보기 — <span className="font-normal text-muted-foreground">{previewInst.name} ({previewInst.field})</span>
                </Label>
                <div className="mt-1.5 border rounded-md divide-y">
                  <div className="px-3 py-2 text-xs">
                    <span className="text-muted-foreground">제목 · </span>
                    <span className="font-medium">{previewSubject}</span>
                  </div>
                  <pre className="px-3 py-2 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed bg-muted/20">
                    {previewBody}
                  </pre>
                </div>
              </div>
            ) : null}

            <div className="text-xs text-muted-foreground border-t pt-3">
              · 발송 계정: <span className="font-medium">대표님 Gmail</span> ·
              발송 후 <span className="font-medium">{wave}차 기록이 자동 추가</span>되고
              발송 예정 상태는 <span className="font-medium">진행 중</span>으로 변경됩니다.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={sending}>취소</Button>
              <Button
                onClick={handleSend}
                disabled={sending || categorized.toSend.length === 0 || !template}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                {sending ? "발송 중..." : `${categorized.toSend.length}명에게 발송`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultView({ result, onClose }: { result: SendResult; onClose: () => void }) {
  const handleReauth = () => {
    // 새 창에서 OAuth flow 진행 — 콜백이 자동 닫힘
    window.open("/api/gmail-oauth/start", "gmail-oauth", "width=520,height=640");
  };

  return (
    <div className="space-y-4">
      {result.aborted && (
        <div className="border border-red-300 rounded-md p-3 bg-red-50 text-sm">
          <div className="flex items-center gap-1.5 font-semibold text-red-700">
            <AlertTriangle className="h-4 w-4" /> 발송이 중단되었습니다 — {result.aborted.label}
          </div>
          <div className="mt-1.5 text-xs text-red-700">
            {result.aborted.kind === "token_expired"
              ? "OAuth 토큰이 만료/폐기되었습니다. 아래 [Gmail 재인증] 버튼을 눌러 새 창에서 대표님 계정으로 로그인하면 자동으로 갱신됩니다."
              : result.aborted.kind === "quota"
              ? "Gmail 일일 발송 한도를 초과했습니다. 24시간 후 자동 복구됩니다. Discord 채널에 알림이 전송되었습니다."
              : "Gmail API 인증 문제로 발송이 중단되었습니다. Discord 채널의 상세 메시지를 확인하세요."}
          </div>
          {result.aborted.kind === "token_expired" && (
            <div className="mt-2.5">
              <Button size="sm" onClick={handleReauth} className="gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Gmail 재인증
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="border rounded-md p-3 bg-muted/30 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-green-700 flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> 성공
          </span>
          <span className="font-semibold text-green-700">{result.sent.length}명</span>
        </div>
        {result.skipped.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600">스킵</span>
            <span className="font-semibold text-gray-600">{result.skipped.length}명</span>
          </div>
        )}
        {result.failed.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-red-700 flex items-center gap-1">
              <X className="h-3.5 w-3.5" /> 실패
            </span>
            <span className="font-semibold text-red-700">{result.failed.length}명</span>
          </div>
        )}
      </div>

      {result.failed.length > 0 && (
        <div>
          <Label className="text-xs text-red-700">실패 목록</Label>
          <div className="mt-1.5 border border-red-200 rounded-md p-2 max-h-40 overflow-y-auto text-xs space-y-1">
            {result.failed.map((f) => (
              <div key={f.id} className="text-red-700">
                · {f.name} — {f.error}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.skipped.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">스킵 상세</summary>
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
            {result.skipped.map((s) => (
              <div key={s.id} className="text-gray-600">· {s.name} — {s.reason}</div>
            ))}
          </div>
        </details>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onClose}>닫기</Button>
      </div>
    </div>
  );
}
