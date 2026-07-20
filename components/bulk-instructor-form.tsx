"use client";

import { useState, useMemo, useEffect } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import { isDupEmailReason } from "@/lib/duplicate-email";

interface Props {
  onClose: () => void;
}

// 붙여넣은 한 줄을 파싱한 결과
interface ParsedRow {
  idx: number;
  name: string;        // 최종 이름 (채널명 + " 채널")
  channelName: string; // 원본 채널명
  youtube: string;     // 채널링크
  email: string;
  // 중복/금지 판정
  dup: "banned" | "duplicate" | null;
  dupBy: "name" | "email" | null;
  dupSource: "instructors" | "youtube_channels" | null;
}

// 이름 비교용 정규화: 공백 제거 + 소문자 + 끝의 "채널" 제거
const coreName = (s: string) =>
  s.replace(/\s+/g, "").toLowerCase().replace(/채널$/, "");
const normEmail = (s: string) => s.trim().toLowerCase();

export default function BulkInstructorForm({ onClose }: Props) {
  const { state, dispatch, loadStats, loadYoutubeChannels } = useOutreach();
  const instructors = state.instructors;
  const ytChannels = state.youtubeChannels;

  const [raw, setRaw] = useState("");
  const [include, setInclude] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);

  // YT채널 목록이 없으면 로드 (중복 체크용)
  useEffect(() => {
    if (!ytChannels || ytChannels.length === 0) loadYoutubeChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 붙여넣은 텍스트 → 행 파싱 + 중복 판정
  const rows = useMemo<ParsedRow[]>(() => {
    // 기존 강사/YT채널 인덱스 (이름 core / 이메일)
    const instrNames = new Set<string>();
    const bannedNames = new Set<string>();
    const instrEmails = new Set<string>();
    const bannedEmails = new Set<string>();
    for (const i of instructors) {
      const cn = coreName(i.name);
      if (cn) { instrNames.add(cn); if (i.is_banned) bannedNames.add(cn); }
      if (i.email) {
        const e = normEmail(i.email);
        instrEmails.add(e); if (i.is_banned) bannedEmails.add(e);
      }
    }
    const ytNames = new Set<string>();
    const ytEmails = new Set<string>();
    for (const ch of ytChannels) {
      const cn = coreName(ch.channel_name);
      if (cn) ytNames.add(cn);
      if (ch.email) ytEmails.add(normEmail(ch.email));
    }

    return raw
      .split("\n")
      .map((line) => line.replace(/\r$/, ""))
      .filter((line) => line.trim())
      .map((line, idx) => {
        const cols = line.split("\t");
        // 컬럼: 채널명 / 채널링크 / 구독자 / 총회수 / 영상수 / 이메일 / 검색어 / 날짜 / 비고
        const channelName = (cols[0] || "").trim();
        const youtube = (cols[1] || "").trim();
        const email = (cols[5] || "").trim();

        const cn = coreName(channelName);
        const en = email ? normEmail(email) : "";

        let dup: ParsedRow["dup"] = null;
        let dupBy: ParsedRow["dupBy"] = null;
        let dupSource: ParsedRow["dupSource"] = null;

        // 금지 우선 → 중복(이름) → 중복(이메일)
        if ((cn && bannedNames.has(cn)) || (en && bannedEmails.has(en))) {
          dup = "banned";
          dupBy = en && bannedEmails.has(en) ? "email" : "name";
          dupSource = "instructors";
        } else if (cn && instrNames.has(cn)) {
          dup = "duplicate"; dupBy = "name"; dupSource = "instructors";
        } else if (en && instrEmails.has(en)) {
          dup = "duplicate"; dupBy = "email"; dupSource = "instructors";
        } else if (cn && ytNames.has(cn)) {
          dup = "duplicate"; dupBy = "name"; dupSource = "youtube_channels";
        } else if (en && ytEmails.has(en)) {
          dup = "duplicate"; dupBy = "email"; dupSource = "youtube_channels";
        }

        return {
          idx,
          name: channelName ? `${channelName} 채널` : "",
          channelName,
          youtube,
          email,
          dup,
          dupBy,
          dupSource,
        };
      });
  }, [raw, instructors, ytChannels]);

  // 붙여넣기가 바뀌면 포함 여부 기본값 재설정
  // 정상=포함, 이메일 중복=포함(서버가 '제외' 상태로 자동 등록), 이름 중복=미포함, 금지=불가
  useEffect(() => {
    const next: Record<number, boolean> = {};
    for (const r of rows) {
      if (r.dup === "banned") next[r.idx] = false;
      else if (r.dup === "duplicate") next[r.idx] = r.dupBy === "email";
      else next[r.idx] = true;
    }
    setInclude(next);
  }, [rows]);

  const validRows = rows.filter((r) => r.name); // 채널명 있는 행만
  const selectedRows = validRows.filter((r) => r.dup !== "banned" && include[r.idx]);
  const dupCount = validRows.filter((r) => r.dup === "duplicate").length;
  const bannedCount = validRows.filter((r) => r.dup === "banned").length;

  const handleSubmit = async () => {
    if (selectedRows.length === 0) { toast.error("추가할 강사가 없습니다."); return; }
    setSaving(true);
    try {
      const payload = selectedRows.map((r) => ({
        name: r.name,
        field: "유튜브",
        youtube: r.youtube,
        email: r.email,
        assignee: "크롤링",
        source: "콘텐츠팀",
        status: "미검토",
      }));
      const res = await fetch("/api/instructors/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructors: payload, performedBy: "크롤링" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "일괄 등록 실패");
      // 최신순으로 앞에 쌓이도록 역순 dispatch
      for (const inst of [...data].reverse()) {
        dispatch({ type: "ADD_INSTRUCTOR", instructor: inst });
      }
      await loadStats();
      const excluded = data.filter((d: any) => isDupEmailReason(d.reason)).length;
      toast.success(
        `${data.length}명 추가 완료${excluded ? ` (이메일 중복 ${excluded}명은 '제외' 처리)` : ""}`
      );
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">강사 일괄 추가 (크롤링 채널 붙여넣기)</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* 안내 + 붙여넣기 */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">
              스프레드시트에서 행을 복사해 붙여넣으세요. 컬럼 순서:
              <span className="font-medium"> 채널명 · 채널링크 · 구독자 · 총회수 · 영상수 · 이메일 · 검색어 · 날짜</span>
              <br />
              이름=<span className="font-medium">채널명 채널</span>, 분야=<span className="font-medium">유튜브</span>,
              유튜브=<span className="font-medium">채널링크</span>, 찾은사람=<span className="font-medium">크롤링</span>,
              출처=<span className="font-medium">콘텐츠팀</span>로 등록됩니다.
            </p>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="시민 김상식TV&#9;https://www.youtube.com/@시민김상식tv&#9;109,000&#9;...&#9;koreasangsik@gmail.com&#9;음악추천&#9;2026. 7. 14"
              className="w-full h-40 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* 미리보기 */}
          {validRows.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">
                  총 <b>{validRows.length}</b>건 · 추가 대상 <b className="text-green-600">{selectedRows.length}</b>건
                  {dupCount > 0 && <> · 중복 <b className="text-orange-600">{dupCount}</b>건</>}
                  {bannedCount > 0 && <> · 금지 <b className="text-red-600">{bannedCount}</b>건</>}
                </span>
              </div>

              <div className="border rounded max-h-[55vh] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="text-left text-muted-foreground">
                      <th className="w-10 px-2 py-1.5 text-center">추가</th>
                      <th className="px-2 py-1.5">이름</th>
                      <th className="px-2 py-1.5">이메일</th>
                      <th className="px-2 py-1.5">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((r) => {
                      const banned = r.dup === "banned";
                      return (
                        <tr key={r.idx} className="border-t">
                          <td className="px-2 py-1.5 text-center">
                            <Checkbox
                              checked={!banned && !!include[r.idx]}
                              disabled={banned}
                              onCheckedChange={(v) =>
                                setInclude((prev) => ({ ...prev, [r.idx]: !!v }))
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5 font-medium">
                            {r.name}
                            {r.youtube && (
                              <span className="block text-[10px] text-muted-foreground font-normal truncate max-w-[220px]">
                                {r.youtube}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">{r.email || "-"}</td>
                          <td className="px-2 py-1.5">
                            {banned && (
                              <span className="inline-flex items-center gap-1 text-red-600">
                                <Ban className="h-3.5 w-3.5" />금지({r.dupBy === "email" ? "이메일" : "이름"})
                              </span>
                            )}
                            {r.dup === "duplicate" && (
                              <span className="inline-flex items-center gap-1 text-orange-600">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                중복({r.dupBy === "email" ? "이메일" : "이름"}
                                {r.dupSource === "youtube_channels" ? "·YT" : ""})
                                {r.dupBy === "email" && (
                                  <span className="text-[10px] text-orange-500">→ 제외로 등록</span>
                                )}
                              </span>
                            )}
                            {!r.dup && (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <CheckCircle2 className="h-3.5 w-3.5" />등록 가능
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 text-sm" onClick={onClose}>취소</Button>
            <Button
              size="sm"
              className="h-8 text-sm"
              onClick={handleSubmit}
              disabled={saving || selectedRows.length === 0}
            >
              {saving ? "저장 중..." : `${selectedRows.length}명 추가`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
