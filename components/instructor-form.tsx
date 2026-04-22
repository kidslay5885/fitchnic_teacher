"use client";

import { useState, useMemo, useEffect } from "react";
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
import { requiresReason } from "@/lib/status-machine";
import type { InstructorStatus } from "@/lib/types";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle2, Plus, Minus } from "lucide-react";

interface Props {
  onClose: () => void;
}

interface DuplicateInfo {
  id: string; name: string; field: string; assignee: string; status: string;
}

// 편집 거리 (Levenshtein) - 유사도 체크용
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

export default function InstructorForm({ onClose }: Props) {
  const { state, dispatch, loadStats, loadYoutubeChannels } = useOutreach();
  const instructors = state.instructors;
  const ytChannels = state.youtubeChannels;

  // YT채널 목록이 없으면 로드
  useEffect(() => {
    if (!ytChannels || ytChannels.length === 0) {
      loadYoutubeChannels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [form, setForm] = useState({
    name: "", field: "", assignee: "", email: "",
    instagram: "", youtube: "", phone: "", ref_link: "",
    has_lecture_history: "", lecture_platform: "", lecture_platform_url: "",
    source: "강사모집", notes: "", status: "미검토",
    status_memo: "",
  });
  const [refLinks, setRefLinks] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[] | null>(null);

  const statusNeedsMemo = requiresReason(form.status as InstructorStatus) || form.status === "컨펌 필요";

  // 실시간 강사명 중복/금지/유사 체크 (instructors + youtube_channels)
  const nameCheck = useMemo(() => {
    const name = form.name.trim();
    if (!name) return null;
    const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    const normalized = normalize(name);

    const duplicates = instructors.filter((i) => normalize(i.name) === normalized);
    if (duplicates.length > 0) {
      const banned = duplicates.some((d) => d.is_banned);
      if (banned) return { type: "banned" as const, matches: duplicates, source: "instructors" as const };
      return { type: "duplicate" as const, matches: duplicates, source: "instructors" as const };
    }

    const ytDuplicates = ytChannels.filter((ch) => normalize(ch.channel_name) === normalized);
    if (ytDuplicates.length > 0) {
      const ytMatches = ytDuplicates.map((ch) => ({
        id: ch.id,
        name: ch.channel_name,
        field: ch.keyword,
        status: ch.status,
        is_banned: false,
        assignee: "",
      })) as any[];
      return { type: "duplicate" as const, matches: ytMatches, source: "youtube_channels" as const };
    }

    if (normalized.length >= 2) {
      const similars = instructors.filter((i) => {
        const n = normalize(i.name);
        if (n === normalized) return false;
        if (n.includes(normalized) || normalized.includes(n)) return true;
        const maxLen = Math.max(n.length, normalized.length);
        const threshold = maxLen <= 3 ? 1 : 2;
        return editDistance(n, normalized) <= threshold;
      });
      if (similars.length > 0) return { type: "similar" as const, matches: similars, source: "instructors" as const };

      const ytSimilars = ytChannels.filter((ch) => {
        const n = normalize(ch.channel_name);
        if (n === normalized) return false;
        if (n.includes(normalized) || normalized.includes(n)) return true;
        const maxLen = Math.max(n.length, normalized.length);
        const threshold = maxLen <= 3 ? 1 : 2;
        return editDistance(n, normalized) <= threshold;
      });
      if (ytSimilars.length > 0) {
        const ytMatches = ytSimilars.map((ch) => ({
          id: ch.id,
          name: ch.channel_name,
          field: ch.keyword,
          status: ch.status,
          is_banned: false,
          assignee: "",
        })) as any[];
        return { type: "similar" as const, matches: ytMatches, source: "youtube_channels" as const };
      }
    }
    return { type: "ok" as const };
  }, [form.name, instructors, ytChannels]);

  // 실시간 이메일 중복/금지 체크 (정확 일치, instructors + youtube_channels)
  const emailCheck = useMemo(() => {
    const email = form.email.trim().toLowerCase();
    if (!email) return null;

    const duplicates = instructors.filter((i) =>
      i.email && i.email.trim().toLowerCase() === email
    );
    if (duplicates.length > 0) {
      const banned = duplicates.some((d) => d.is_banned);
      if (banned) return { type: "banned" as const, matches: duplicates, source: "instructors" as const };
      return { type: "duplicate" as const, matches: duplicates, source: "instructors" as const };
    }

    const ytDuplicates = ytChannels.filter((ch) =>
      ch.email && ch.email.trim().toLowerCase() === email
    );
    if (ytDuplicates.length > 0) {
      const ytMatches = ytDuplicates.map((ch) => ({
        id: ch.id,
        name: ch.channel_name,
        field: ch.keyword,
        status: ch.status,
        is_banned: false,
        assignee: "",
        email: ch.email,
      })) as any[];
      return { type: "duplicate" as const, matches: ytMatches, source: "youtube_channels" as const };
    }

    if (email.length >= 5) {
      const similars = instructors.filter((i) => {
        if (!i.email) return false;
        const e = i.email.trim().toLowerCase();
        if (e === email) return false;
        if (e.includes(email) || email.includes(e)) return true;
        const maxLen = Math.max(e.length, email.length);
        const threshold = maxLen <= 5 ? 1 : 2;
        return editDistance(e, email) <= threshold;
      });
      if (similars.length > 0) return { type: "similar" as const, matches: similars, source: "instructors" as const };

      const ytSimilars = ytChannels.filter((ch) => {
        if (!ch.email) return false;
        const e = ch.email.trim().toLowerCase();
        if (e === email) return false;
        if (e.includes(email) || email.includes(e)) return true;
        const maxLen = Math.max(e.length, email.length);
        const threshold = maxLen <= 5 ? 1 : 2;
        return editDistance(e, email) <= threshold;
      });
      if (ytSimilars.length > 0) {
        const ytMatches = ytSimilars.map((ch) => ({
          id: ch.id,
          name: ch.channel_name,
          field: ch.keyword,
          status: ch.status,
          is_banned: false,
          assignee: "",
          email: ch.email,
        })) as any[];
        return { type: "similar" as const, matches: ytMatches, source: "youtube_channels" as const };
      }
    }

    return { type: "ok" as const };
  }, [form.email, instructors, ytChannels]);

  const handleSubmit = async (force = false) => {
    if (!form.name.trim()) { toast.error("강사 이름을 입력하세요."); return; }
    if (requiresReason(form.status as InstructorStatus) && !form.status_memo.trim()) {
      toast.error(`'${form.status}' 상태는 사유 입력이 필요합니다.`);
      return;
    }
    if (nameCheck?.type === "banned" || emailCheck?.type === "banned") {
      toast.error("연락 금지 대상입니다. 추가할 수 없습니다.");
      return;
    }
    if ((nameCheck?.type === "duplicate" || emailCheck?.type === "duplicate") && !force) return;
    setSaving(true);
    try {
      const { status_memo, ...rest } = form;
      const payload: any = {
        ...rest,
        name: form.name.trimEnd(),
        field: form.field.trimEnd(),
        ref_link: refLinks.filter((l) => l.trim()).join(" , "),
        _force: force,
      };
      if (requiresReason(form.status as InstructorStatus)) {
        payload.exclude_reason = status_memo;
      } else if (form.status === "컨펌 필요") {
        payload.confirm_reason = status_memo;
      }
      const res = await fetch("/api/instructors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
              {/* 이름 + 실시간 중복 체크 */}
              <div className="col-span-2">
                <Label className="text-xs">이름 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus className="h-8 text-sm" />
                {nameCheck?.type === "ok" && form.name.trim() && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />등록 가능
                  </div>
                )}
                {nameCheck?.type === "banned" && (
                  <div className="mt-1.5 rounded border border-red-300 bg-red-50 p-2 space-y-1">
                    <div className="flex items-center gap-1 text-xs text-red-700 font-semibold">
                      <Ban className="h-3.5 w-3.5" />연락 금지 대상
                    </div>
                    {nameCheck.matches.map((d) => (
                      <div key={d.id} className="text-xs text-red-600 bg-red-100 rounded px-2 py-1">
                        {d.name} {d.field && `| ${d.field}`} | {d.status}
                      </div>
                    ))}
                  </div>
                )}
                {nameCheck?.type === "duplicate" && (
                  <div className="mt-1.5 rounded border border-orange-300 bg-orange-50 p-2 space-y-1">
                    <div className="flex items-center gap-1 text-xs text-orange-700 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />이미 등록된 이름
                      {nameCheck.source === "youtube_channels" && <span className="text-orange-500 font-normal">(YT채널수집)</span>}
                    </div>
                    {nameCheck.matches.map((d) => (
                      <div key={d.id} className="text-xs text-orange-600 bg-orange-100 rounded px-2 py-1">
                        {d.name} {d.field && `| ${d.field}`} | {d.status}
                      </div>
                    ))}
                  </div>
                )}
                {nameCheck?.type === "similar" && (
                  <div className="mt-1.5 rounded border border-yellow-300 bg-yellow-50 p-2 space-y-1">
                    <div className="flex items-center gap-1 text-xs text-yellow-700 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />비슷한 이름이 있습니다
                      {nameCheck.source === "youtube_channels" && <span className="text-yellow-500 font-normal">(YT채널수집)</span>}
                    </div>
                    {nameCheck.matches.map((d) => (
                      <div key={d.id} className="text-xs text-yellow-600 bg-yellow-100 rounded px-2 py-1">
                        {d.name} {d.field && `| ${d.field}`} | {d.status}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 분야 */}
              <div>
                <Label className="text-xs">분야</Label>
                <Input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} className="h-8 text-sm" />
              </div>

              {/* 상태 */}
              <div>
                <Label className="text-xs">상태</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v || "미검토", status_memo: "" })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 상태 메모 (컨펌 필요/제외/보류/거절) */}
              {statusNeedsMemo && (
                <div className="col-span-2">
                  <Label className="text-xs">
                    {requiresReason(form.status as InstructorStatus) ? `${form.status} 사유 *` : "컨펌 필요 메모"}
                  </Label>
                  <Input
                    value={form.status_memo}
                    onChange={(e) => setForm({ ...form, status_memo: e.target.value })}
                    className="h-8 text-sm"
                    placeholder={requiresReason(form.status as InstructorStatus) ? "사유 입력 (필수)" : "메모 입력 (선택)"}
                  />
                </div>
              )}

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

              {/* 이메일 + 실시간 중복 체크 */}
              <div className="col-span-2">
                <Label className="text-xs">이메일</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 text-sm" />
                {emailCheck?.type === "ok" && form.email.trim() && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />등록 가능
                  </div>
                )}
                {emailCheck?.type === "banned" && (
                  <div className="mt-1.5 rounded border border-red-300 bg-red-50 p-2 space-y-1">
                    <div className="flex items-center gap-1 text-xs text-red-700 font-semibold">
                      <Ban className="h-3.5 w-3.5" />연락 금지 대상
                    </div>
                    {emailCheck.matches.map((d) => (
                      <div key={d.id} className="text-xs text-red-600 bg-red-100 rounded px-2 py-1">
                        {d.name} {d.field && `| ${d.field}`} | {d.status}
                      </div>
                    ))}
                  </div>
                )}
                {emailCheck?.type === "duplicate" && (
                  <div className="mt-1.5 rounded border border-orange-300 bg-orange-50 p-2 space-y-1">
                    <div className="flex items-center gap-1 text-xs text-orange-700 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />이미 등록된 이메일
                      {emailCheck.source === "youtube_channels" && <span className="text-orange-500 font-normal">(YT채널수집)</span>}
                    </div>
                    {emailCheck.matches.map((d) => (
                      <div key={d.id} className="text-xs text-orange-600 bg-orange-100 rounded px-2 py-1">
                        {d.name} {d.field && `| ${d.field}`} | {d.status}
                      </div>
                    ))}
                  </div>
                )}
                {emailCheck?.type === "similar" && (
                  <div className="mt-1.5 rounded border border-yellow-300 bg-yellow-50 p-2 space-y-1">
                    <div className="flex items-center gap-1 text-xs text-yellow-700 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />비슷한 이메일이 있습니다
                      {emailCheck.source === "youtube_channels" && <span className="text-yellow-500 font-normal">(YT채널수집)</span>}
                    </div>
                    {emailCheck.matches.map((d) => (
                      <div key={d.id} className="text-xs text-yellow-600 bg-yellow-100 rounded px-2 py-1">
                        {d.email} | {d.name || "이름없음"} | {d.status}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 전화번호 */}
              <div className="col-span-2">
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
              {(nameCheck?.type === "duplicate" || emailCheck?.type === "duplicate") ? (
                <Button size="sm" className="h-8 text-sm" onClick={() => handleSubmit(true)} disabled={saving}>
                  {saving ? "저장 중..." : "그래도 추가"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 text-sm"
                  onClick={() => handleSubmit(false)}
                  disabled={saving || nameCheck?.type === "banned" || emailCheck?.type === "banned"}
                >
                  {saving ? "저장 중..." : "추가"}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
