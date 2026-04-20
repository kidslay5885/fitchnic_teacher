"use client";

import { useEffect, useMemo, useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Ban, Plus, Trash2, Search } from "lucide-react";

export default function BannedTab() {
  const { state, dispatch, loadBannedPlatforms } = useOutreach();
  const [search, setSearch] = useState("");
  const [newPlatform, setNewPlatform] = useState("");
  const [banName, setBanName] = useState("");
  const [banEmail, setBanEmail] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banPlatform, setBanPlatform] = useState("");
  const [banSaving, setBanSaving] = useState(false);

  useEffect(() => { if (state.bannedPlatforms.length === 0) loadBannedPlatforms(); }, []);

  const bannedInstructors = useMemo(() =>
    state.instructors.filter((i) => i.is_banned && (!search || i.name.toLowerCase().includes(search.toLowerCase()))),
  [state.instructors, search]);

  const handleToggleBan = async (id: string, ban: boolean, reason?: string) => {
    try {
      const res = await fetch(`/api/instructors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_banned: ban, ban_reason: reason ?? "" }) });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      toast.success(ban ? "연락금지 설정" : "연락금지 해제");
    } catch { toast.error("실패"); }
  };

  const handleAddBan = async () => {
    const name = banName.trim();
    if (!name) { toast.error("이름을 입력하세요."); return; }
    setBanSaving(true);

    // 공백·대소문자 무시로 기존 강사 찾기
    const normalized = name.replace(/\s+/g, "").toLowerCase();
    const existing = state.instructors.find(
      (i) => i.name.replace(/\s+/g, "").toLowerCase() === normalized,
    );

    try {
      if (existing) {
        // 기존 강사 → is_banned=true 업데이트 (입력값이 있으면 덮어쓰기)
        const patch: Record<string, unknown> = {
          is_banned: true,
          ban_reason: banReason.trim() || existing.ban_reason || "",
        };
        if (banEmail.trim()) patch.email = banEmail.trim();
        if (banPlatform.trim()) patch.lecture_platform = banPlatform.trim();
        const res = await fetch(`/api/instructors/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error((await res.json()).error || "업데이트 실패");
        dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
        toast.success(`${name} — 기존 강사를 연락금지로 전환`);
      } else {
        // 신규 강사로 추가 (is_banned=true, 상태 제외)
        const res = await fetch("/api/instructors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email: banEmail.trim(),
            lecture_platform: banPlatform.trim(),
            ban_reason: banReason.trim(),
            is_banned: true,
            status: "제외",
            _force: true,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "추가 실패");
        const data = await res.json();
        dispatch({ type: "ADD_INSTRUCTOR", instructor: data });
        toast.success(`${name} — 연락금지 등록 완료`);
      }
      setBanName("");
      setBanEmail("");
      setBanReason("");
      setBanPlatform("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "실패";
      toast.error(msg);
    } finally {
      setBanSaving(false);
    }
  };

  const handleAddPlatform = async () => {
    if (!newPlatform.trim()) return;
    try {
      await fetch("/api/banned-platforms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newPlatform.trim() }) });
      await loadBannedPlatforms();
      setNewPlatform("");
      toast.success("추가 완료");
    } catch { toast.error("실패"); }
  };

  const handleDeletePlatform = async (id: string) => {
    try {
      await fetch("/api/banned-platforms", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      await loadBannedPlatforms();
      toast.success("삭제 완료");
    } catch { toast.error("실패"); }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">연락금지</h2>

      <Card className="py-0">
        <CardHeader className="py-3 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Ban className="h-4 w-4" /> 금지 플랫폼
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {state.bannedPlatforms.map((p) => (
              <Badge key={p.id} variant="destructive" className="text-xs px-2 py-0.5 cursor-pointer hover:opacity-80" onClick={() => handleDeletePlatform(p.id)}>
                {p.name} <Trash2 className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="플랫폼 추가..." value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddPlatform()} className="h-8 text-sm max-w-[200px]" />
            <Button size="sm" className="h-8 text-sm" onClick={handleAddPlatform}><Plus className="h-4 w-4 mr-1" />추가</Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card className="py-0">
        <CardHeader className="py-3 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Plus className="h-4 w-4" /> 강사 연락금지 추가
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-2">
          <div className="flex gap-2 items-end flex-wrap">
            <Input
              placeholder="이름 *"
              className="h-8 text-sm w-[160px]"
              value={banName}
              onChange={(e) => setBanName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBan()}
            />
            <Input
              placeholder="이메일 (선택)"
              className="h-8 text-sm w-[200px]"
              value={banEmail}
              onChange={(e) => setBanEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBan()}
            />
            <Input
              placeholder="플랫폼 (선택)"
              className="h-8 text-sm w-[140px]"
              value={banPlatform}
              onChange={(e) => setBanPlatform(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBan()}
            />
            <Input
              placeholder="사유 (선택)"
              className="h-8 text-sm w-[180px]"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBan()}
            />
            <Button
              size="sm"
              className="h-8 text-sm"
              onClick={handleAddBan}
              disabled={banSaving || !banName.trim()}
            >
              <Ban className="h-4 w-4 mr-1" />
              {banSaving ? "추가 중..." : "추가"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            이미 같은 이름의 강사가 있으면 해당 강사를 연락금지로 전환합니다. 등록 후 /submit 에서 동일 이름·이메일로 추가 시도 시 자동 차단됩니다.
          </p>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">연락금지 강사 ({bannedInstructors.length})</h3>
        <div className="relative w-[220px]">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="이름 검색..." className="h-8 text-sm pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="py-2 text-xs font-semibold">이름</TableHead>
              <TableHead className="py-2 text-xs font-semibold">사유</TableHead>
              <TableHead className="py-2 text-xs font-semibold">플랫폼</TableHead>
              <TableHead className="py-2 text-xs font-semibold w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bannedInstructors.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">연락금지 강사가 없습니다.</TableCell></TableRow>
            ) : (
              bannedInstructors.map((i, idx) => (
                <TableRow key={i.id} className={idx % 2 === 1 ? "bg-muted/20" : ""}>
                  <TableCell className="py-2 text-sm font-medium">{i.name}</TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">{i.ban_reason || "-"}</TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">{i.lecture_platform || "-"}</TableCell>
                  <TableCell className="py-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleToggleBan(i.id, false)}>해제</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
