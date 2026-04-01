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

  useEffect(() => { if (state.bannedPlatforms.length === 0) loadBannedPlatforms(); }, []);

  const bannedInstructors = useMemo(() =>
    state.instructors.filter((i) => i.is_banned && (!search || i.name.toLowerCase().includes(search.toLowerCase()))),
  [state.instructors, search]);

  const handleToggleBan = async (id: string, ban: boolean) => {
    try {
      const res = await fetch(`/api/instructors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_banned: ban, ban_reason: "" }) });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      toast.success(ban ? "연락금지 설정" : "연락금지 해제");
    } catch { toast.error("실패"); }
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
    <div className="space-y-4">
      <h2 className="text-base font-semibold">연락금지</h2>

      <Card className="py-0">
        <CardHeader className="py-2.5 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Ban className="h-3 w-3" /> 금지 플랫폼
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {state.bannedPlatforms.map((p) => (
              <Badge key={p.id} variant="destructive" className="text-[10px] px-1.5 py-0 cursor-pointer hover:opacity-80" onClick={() => handleDeletePlatform(p.id)}>
                {p.name} <Trash2 className="h-2.5 w-2.5 ml-0.5" />
              </Badge>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input placeholder="플랫폼 추가..." value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddPlatform()} className="h-7 text-xs max-w-[160px]" />
            <Button size="sm" className="h-7 text-xs" onClick={handleAddPlatform}><Plus className="h-3 w-3 mr-0.5" />추가</Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">연락금지 강사 ({bannedInstructors.length})</h3>
        <div className="relative w-[200px]">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="이름 검색..." className="h-7 text-xs pl-7" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="py-1.5 text-xs">이름</TableHead>
              <TableHead className="py-1.5 text-xs">사유</TableHead>
              <TableHead className="py-1.5 text-xs">플랫폼</TableHead>
              <TableHead className="py-1.5 text-xs w-14"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bannedInstructors.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">연락금지 강사가 없습니다.</TableCell></TableRow>
            ) : (
              bannedInstructors.map((i, idx) => (
                <TableRow key={i.id} className={idx % 2 === 1 ? "bg-muted/20" : ""}>
                  <TableCell className="py-1 text-xs font-medium">{i.name}</TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">{i.ban_reason || "-"}</TableCell>
                  <TableCell className="py-1 text-xs text-muted-foreground">{i.lecture_platform || "-"}</TableCell>
                  <TableCell className="py-1">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => handleToggleBan(i.id, false)}>해제</Button>
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
