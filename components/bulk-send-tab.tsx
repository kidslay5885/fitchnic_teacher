"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STATUS_COLORS } from "@/lib/constants";
import {
  BULK_SEND_TO_IN_PROGRESS, BULK_SEND_STATUS_ORDER, badgeColor, classifyEmails, parseEmailList,
  type ClassifiedEmail,
} from "@/lib/bulk-send";
import type { BulkSend, BulkSendRecipient, InstructorStatus } from "@/lib/types";
import { toast } from "sonner";
import { KeyRound, Send, Loader2, RefreshCw } from "lucide-react";

interface GmailAccountListItem {
  id: string;
  email: string;
  label: string;
  is_default: boolean;
  is_cron_sender: boolean;
  authenticated: boolean;
}

// 발송 결과별 표시 색
const RESULT_COLORS: Record<string, string> = {
  발송: "bg-green-100 text-green-800",
  대기: "bg-gray-100 text-gray-700",
  실패: "bg-red-100 text-red-700",
  미등록: "bg-slate-100 text-slate-700",
  연락금지: "bg-rose-100 text-rose-700",
  상태제외: "bg-orange-100 text-orange-800",
  형식오류: "bg-yellow-100 text-yellow-800",
};
const RESULT_ORDER = ["발송", "실패", "대기", "상태제외", "연락금지", "미등록", "형식오류"];

const CHUNK = 20; // 서버 1회 호출당 발송 건수

// 발송 탭 발송자 목록
const BULK_SENDERS = ["김보성", "정승희"];

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function BulkSendTab() {
  const { state, loadInstructors, loadStats } = useOutreach();

  // ===== 작성 폼 =====
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emailText, setEmailText] = useState("");
  const [changedBy, setChangedBy] = useState("");
  const [accounts, setAccounts] = useState<GmailAccountListItem[]>([]);
  const [senderAccountId, setSenderAccountId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // ===== 발송 기록 =====
  const [sends, setSends] = useState<BulkSend[]>([]);
  const [selectedSendId, setSelectedSendId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ send: BulkSend; recipients: BulkSendRecipient[] } | null>(null);
  const [resultFilter, setResultFilter] = useState<string>("전체");

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail-accounts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "계정 조회 실패");
      const list = (data.accounts ?? []) as GmailAccountListItem[];
      setAccounts(list);
      setSenderAccountId((prev) => {
        if (prev && list.some((a) => a.id === prev)) return prev;
        return (list.find((a) => a.is_default) ?? list[0])?.id ?? "";
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "계정 조회 실패");
    }
  }, []);

  const loadSends = useCallback(async () => {
    try {
      const res = await fetch("/api/bulk-sends", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "발송 기록 조회 실패");
      setSends(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "발송 기록 조회 실패");
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/bulk-sends/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "발송 상세 조회 실패");
      setDetail(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "발송 상세 조회 실패");
    }
  }, []);

  useEffect(() => { loadAccounts(); loadSends(); }, [loadAccounts, loadSends]);
  useEffect(() => {
    setResultFilter("전체");
    if (selectedSendId) loadDetail(selectedSendId);
    else setDetail(null);
  }, [selectedSendId, loadDetail]);

  // OAuth 팝업 완료 시 계정 목록 재로드
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === "gmail-oauth") {
        loadAccounts();
        if (ev.data.ok) toast.success("Gmail 재인증 완료");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [loadAccounts]);

  const selectedAccount = accounts.find((a) => a.id === senderAccountId) ?? null;
  const openReauth = (email: string) => {
    window.open(`/api/gmail-oauth/start?account=${encodeURIComponent(email)}`, "gmail-oauth", "width=520,height=640");
  };

  // ===== 미리보기 분류 (클라이언트 — 서버에서 발송 직전 재검증) =====
  const parsed = useMemo(() => parseEmailList(emailText), [emailText]);
  const classified = useMemo<ClassifiedEmail[]>(
    () => classifyEmails(parsed.emails, state.instructors.map((i) => ({
      id: i.id, name: i.name, email: i.email, status: i.status, is_banned: !!i.is_banned,
    }))),
    [parsed.emails, state.instructors],
  );
  const toSend = classified.filter((c) => c.result === "대기");
  const skipped = classified.filter((c) => c.result !== "대기");

  // 매칭된 강사의 상태별 인원 (이메일 기준이 아니라 강사 기준)
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    const seen = new Set<string>();
    for (const c of classified) {
      for (const i of c.instructors) {
        if (seen.has(i.id)) continue;
        seen.add(i.id);
        m[i.status] = (m[i.status] ?? 0) + 1;
      }
    }
    return m;
  }, [classified]);
  const countBy = (r: string) => classified.filter((c) => c.result === r).length;

  const handleSend = async () => {
    if (!name.trim()) return toast.error("발송명을 입력하세요");
    if (!selectedAccount) return toast.error("발송 계정을 선택하세요");
    if (!selectedAccount.authenticated) return toast.error(`${selectedAccount.email} 계정 인증이 필요합니다 — [재인증]을 눌러주세요`);
    if (!subject.trim()) return toast.error("메일 제목을 입력하세요");
    if (!body.trim()) return toast.error("문구를 입력하세요");
    if (toSend.length === 0) return toast.error("발송 가능한 이메일이 없습니다");
    if (!confirm(`[${name.trim()}] ${toSend.length}건을 ${selectedAccount.email} 계정으로 발송합니다.\n발송된 강사는 뱃지가 붙고, 진행 중·미팅 완료·계약 완료가 아니면 '진행 중'으로 바뀝니다.\n진행할까요?`)) return;

    setSending(true);
    setProgress({ done: 0, total: toSend.length });
    try {
      // 1) 발송 기록 생성 (서버에서 재분류 후 저장)
      const res = await fetch("/api/bulk-sends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), subject, body, senderAccountId, emails: parsed.emails, createdBy: changedBy,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "발송 기록 생성 실패");
      const sendId: string = data.send.id;
      const pendingIds: string[] = (data.recipients as BulkSendRecipient[])
        .filter((r) => r.result === "대기")
        .map((r) => r.id);
      setProgress({ done: 0, total: pendingIds.length });

      // 2) 20건씩 나눠서 발송
      let sentCount = 0;
      let failCount = 0;
      let abortedLabel: string | null = null;
      for (let k = 0; k < pendingIds.length; k += CHUNK) {
        const chunk = pendingIds.slice(k, k + CHUNK);
        const sRes = await fetch(`/api/bulk-sends/${sendId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientIds: chunk, changedBy }),
        });
        const sData = await sRes.json();
        if (!sRes.ok) { abortedLabel = sData.error || "발송 실패"; break; }
        for (const d of sData.done ?? []) {
          if (d.result === "발송") sentCount++;
          else if (d.result === "실패") failCount++;
        }
        setProgress({ done: Math.min(k + chunk.length, pendingIds.length), total: pendingIds.length });
        if (sData.aborted) { abortedLabel = sData.aborted.label; break; }
      }

      if (abortedLabel) toast.error(`발송 중단 — ${abortedLabel} (성공 ${sentCount}건)`);
      else toast.success(`발송 완료 — 성공 ${sentCount}건${failCount ? ` / 실패 ${failCount}건` : ""}`);

      setEmailText("");
      await Promise.all([loadInstructors(), loadStats(), loadSends()]);
      setSelectedSendId(sendId);
      loadDetail(sendId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "발송 실패");
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  const filteredRecipients = useMemo(() => {
    if (!detail) return [];
    const list = resultFilter === "전체" ? detail.recipients : detail.recipients.filter((r) => r.result === resultFilter);
    return [...list].sort((a, b) => RESULT_ORDER.indexOf(a.result) - RESULT_ORDER.indexOf(b.result));
  }, [detail, resultFilter]);

  const detailCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of detail?.recipients ?? []) m[r.result] = (m[r.result] ?? 0) + 1;
    return m;
  }, [detail]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
      {/* ===== 왼쪽: 발송 작성 ===== */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            <h2 className="text-base font-semibold">이메일 일괄 발송</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            1·2·3차와 별개로 발송합니다. 강사 상태와 관계없이 DB에 있는 이메일이면 모두 발송하고 이름 옆에 발송명 뱃지가 붙습니다.
            상태는 진행 중·미팅 완료·계약 완료는 그대로 두고, 나머지는 <b>진행 중</b>으로 바뀝니다.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">발송명 (뱃지 이름)</Label>
              <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 11월 재컨택" maxLength={30} />
              {name.trim() && (
                <span className={`inline-block mt-1.5 rounded border px-1 text-[10px] font-medium leading-4 ${badgeColor(name.trim())}`}>{name.trim()}</span>
              )}
            </div>
            <div>
              <Label className="text-xs">발송자</Label>
              <Select value={changedBy} onValueChange={(v) => setChangedBy(v ?? "")}>
                <SelectTrigger className="mt-1.5 w-full"><SelectValue placeholder="발송자 선택" /></SelectTrigger>
                <SelectContent>
                  {BULK_SENDERS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">발송 계정</Label>
            <div className="flex gap-2 mt-1.5 items-center">
              <Select value={senderAccountId} onValueChange={(v) => setSenderAccountId(v ?? "")} disabled={accounts.length === 0}>
                <SelectTrigger className="flex-1">
                  {selectedAccount ? (
                    <span className="truncate text-left">
                      <span className="font-medium">{selectedAccount.label}</span>
                      <span className="text-muted-foreground"> · {selectedAccount.email}</span>
                      {!selectedAccount.authenticated && <span className="text-red-600 ml-1">(미인증)</span>}
                    </span>
                  ) : (
                    <SelectValue placeholder="계정 선택" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-medium">{a.label}</span>
                      <span className="text-muted-foreground"> · {a.email}</span>
                      {!a.authenticated && <span className="text-red-600 ml-1">(미인증)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAccount && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openReauth(selectedAccount.email)}>
                  <KeyRound className="h-3.5 w-3.5" /> 재인증
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs">메일 제목</Label>
            <Input className="mt-1.5" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="메일 제목" />
          </div>

          <div>
            <Label className="text-xs">문구</Label>
            <Textarea className="mt-1.5 min-h-[180px] text-sm" value={body} onChange={(e) => setBody(e.target.value)} placeholder="메일 본문" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              &apos;채널이름&apos; → 강사 이름, &apos;채널분야&apos; → 분야로 바뀝니다 (따옴표 포함, 메시지 탭 템플릿과 동일)
            </p>
          </div>

          <div>
            <Label className="text-xs">받는 이메일 (줄바꿈·쉼표로 구분)</Label>
            <Textarea
              className="mt-1.5 min-h-[140px] font-mono text-xs"
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              placeholder={"abc@gmail.com\ndef@naver.com"}
            />
          </div>

          {/* 미리보기 */}
          {parsed.emails.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>입력 <b>{parsed.emails.length}</b>건{parsed.duplicateCount > 0 && <span className="text-muted-foreground"> (중복 {parsed.duplicateCount}건 제거)</span>}</span>
                <span className="text-green-700">발송 <b>{toSend.length}</b>건</span>
                <span className="text-muted-foreground">제외 <b>{skipped.length}</b>건</span>
              </div>

              {/* 상태별 인원 */}
              <div>
                <p className="text-xs font-semibold mb-1.5">매칭된 강사 상태별 인원</p>
                <div className="flex flex-wrap gap-1.5">
                  {BULK_SEND_STATUS_ORDER.map((s) => {
                    const n = statusCounts[s] ?? 0;
                    const toInProgress = BULK_SEND_TO_IN_PROGRESS.includes(s);
                    return (
                      <span key={s} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${n === 0 ? "opacity-40" : ""} ${STATUS_COLORS[s as InstructorStatus]}`}>
                        {s} <b>{n}</b>{toInProgress ? " → 진행 중" : " · 상태 유지"}
                      </span>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(["미등록", "연락금지", "형식오류"] as const).map((r) => (
                    <span key={r} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${countBy(r) === 0 ? "opacity-40" : ""} ${RESULT_COLORS[r]}`}>
                      {r} <b>{countBy(r)}</b> · 미발송
                    </span>
                  ))}
                </div>
              </div>

              {/* 제외 목록 */}
              {skipped.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1">발송 제외 ({skipped.length})</p>
                  <div className="max-h-48 overflow-y-auto rounded border bg-background text-xs divide-y">
                    {skipped.map((c) => (
                      <div key={c.email} className="flex items-center gap-2 px-2 py-1">
                        <span className={`shrink-0 rounded px-1 ${RESULT_COLORS[c.result]}`}>{c.result}</span>
                        <span className="font-mono truncate">{c.email}</span>
                        <span className="text-muted-foreground truncate">{c.result === "미등록" ? "" : c.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 발송 목록 */}
              {toSend.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1">발송 대상 ({toSend.length})</p>
                  <div className="max-h-48 overflow-y-auto rounded border bg-background text-xs divide-y">
                    {toSend.map((c) => (
                      <div key={c.email} className="flex items-center gap-2 px-2 py-1">
                        <span className="font-medium shrink-0">{c.instructors.map((i) => i.name).join(", ")}</span>
                        {c.instructors.map((i) => (
                          <span key={i.id} className={`shrink-0 rounded px-1 ${STATUS_COLORS[i.status as InstructorStatus] ?? ""}`}>{i.status}</span>
                        ))}
                        <span className="font-mono text-muted-foreground truncate">{c.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleSend} disabled={sending || toSend.length === 0} className="gap-1.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "발송 중..." : `보내기 (${toSend.length}건)`}
            </Button>
            {progress && (
              <div className="flex-1 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                {progress.done}/{progress.total}
              </div>
            )}
          </div>
          {sending && <p className="text-xs text-amber-700">발송 중에는 이 탭을 벗어나거나 창을 닫지 마세요 (1건당 약 1초).</p>}
        </CardContent>
      </Card>

      {/* ===== 오른쪽: 발송 기록 ===== */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">발송 기록</h2>
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => { loadSends(); if (selectedSendId) loadDetail(selectedSendId); }}>
              <RefreshCw className="h-3.5 w-3.5" /> 새로고침
            </Button>
          </div>

          {sends.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">아직 발송 기록이 없습니다.</p>
          ) : (
            <div className="max-h-[260px] overflow-y-auto rounded border divide-y">
              {sends.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSendId(s.id === selectedSendId ? null : s.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${s.id === selectedSendId ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 rounded border px-1 text-[10px] font-medium leading-4 ${badgeColor(s.name)}`}>{s.name}</span>
                    <span className="truncate flex-1">{s.subject}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(s.created_at)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground flex gap-2 flex-wrap">
                    <span>{s.sender_email}</span>
                    {s.created_by && <span>· {s.created_by}</span>}
                    <span>· 발송 {s.counts?.["발송"] ?? 0}</span>
                    {(s.counts?.["실패"] ?? 0) > 0 && <span className="text-red-600">· 실패 {s.counts?.["실패"]}</span>}
                    {(s.counts?.["대기"] ?? 0) > 0 && <span className="text-amber-700">· 미완료 {s.counts?.["대기"]}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 상세 */}
          {detail && (
            <div className="space-y-3 pt-2 border-t">
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`rounded border px-1 text-[11px] font-medium leading-5 ${badgeColor(detail.send.name)}`}>{detail.send.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtDateTime(detail.send.created_at)} · {detail.send.sender_email}{detail.send.created_by ? ` · ${detail.send.created_by}` : ""}
                  </span>
                </div>
                <p><span className="text-muted-foreground text-xs">제목</span> <span className="font-medium">{detail.send.subject}</span></p>
                <div className="rounded border bg-muted/30 p-2 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">{detail.send.body}</div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {["전체", ...RESULT_ORDER.filter((r) => detailCounts[r])].map((r) => (
                  <button
                    key={r}
                    onClick={() => setResultFilter(r)}
                    className={`rounded px-2 py-0.5 text-xs border ${resultFilter === r ? "border-primary ring-1 ring-primary" : "border-transparent"} ${r === "전체" ? "bg-muted" : RESULT_COLORS[r]}`}
                  >
                    {r} {r === "전체" ? detail.recipients.length : detailCounts[r]}
                  </button>
                ))}
              </div>

              <div className="max-h-[420px] overflow-y-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-medium">결과</th>
                      <th className="px-2 py-1.5 font-medium">강사</th>
                      <th className="px-2 py-1.5 font-medium">이메일</th>
                      <th className="px-2 py-1.5 font-medium">이전 상태 / 사유</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRecipients.map((r) => (
                      <tr key={r.id}>
                        <td className="px-2 py-1"><Badge className={`text-[10px] px-1.5 py-0 ${RESULT_COLORS[r.result] ?? ""}`}>{r.result}</Badge></td>
                        <td className="px-2 py-1 font-medium">{r.instructor_name || "-"}</td>
                        <td className="px-2 py-1 font-mono">{r.email}</td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {r.result === "발송" ? r.prev_status : r.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
