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
  const [addSearch, setAddSearch] = useState("");
  const [addReason, setAddReason] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => { if (state.bannedPlatforms.length === 0) loadBannedPlatforms(); }, []);

  const bannedInstructors = useMemo(() =>
    state.instructors.filter((i) => i.is_banned && (!search || i.name.toLowerCase().includes(search.toLowerCase()))),
  [state.instructors, search]);

  const addCandidates = useMemo(() =>
    addSearch.trim() ? state.instructors.filter((i) => !i.is_banned && i.name.toLowerCase().includes(addSearch.toLowerCase())).slice(0, 8) : [],
  [state.instructors, addSearch]);

  const handleToggleBan = async (id: string, ban: boolean, reason?: string) => {
    try {
      const res = await fetch(`/api/instructors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_banned: ban, ban_reason: reason ?? "" }) });
      if (!res.ok) throw new Error("Failed");
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: await res.json() });
      toast.success(ban ? "연락금지 설정" : "연락금지 해제");
    } catch { toast.error("실패"); }
  };

  const handleAddBan = async () => {
    if (!selectedId) return;
    await handleToggleBan(selectedId, true, addReason.trim());
    setSelectedId(null);
    setAddSearch("");
    setAddReason("");
    setShowDropdown(false);
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
        <CardContent className="px-5 pb-4 space-y-3">
          <div className="flex gap-2 items-end">
            <div className="relative w-[200px]">
              <Input
                placeholder="강사 이름 검색..."
                className="h-8 text-sm"
                value={addSearch}
                onChange={(e) => { setAddSearch(e.target.value); setSelectedId(null); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              />
              {showDropdown && addCandidates.length > 0 && (
                <div className="absolute z-10 top-9 left-0 w-full bg-popover border rounded-md shadow-md max-h-[200px] overflow-y-auto">
                  {addCandidates.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
                      onMouseDown={() => { setSelectedId(i.id); setAddSearch(i.name); setShowDropdown(false); }}
                    >
                      {i.name} <span className="text-muted-foreground text-xs ml-1">{i.lecture_platform || ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Input placeholder="사유 (선택)" className="h-8 text-sm max-w-[200px]" value={addReason} onChange={(e) => setAddReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddBan()} />
            <Button size="sm" className="h-8 text-sm" onClick={handleAddBan} disabled={!selectedId}>
              <Ban className="h-4 w-4 mr-1" />추가
            </Button>
          </div>
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
