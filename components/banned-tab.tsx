"use client";

import { useEffect, useMemo, useState } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Ban, Plus, Trash2, Search } from "lucide-react";

export default function BannedTab() {
  const { state, dispatch, loadBannedPlatforms, loadInstructors } = useOutreach();
  const [search, setSearch] = useState("");
  const [newPlatform, setNewPlatform] = useState("");

  useEffect(() => {
    if (state.bannedPlatforms.length === 0) loadBannedPlatforms();
  }, []);

  const bannedInstructors = useMemo(() => {
    return state.instructors.filter((i) => {
      if (!i.is_banned) return false;
      if (search) {
        return i.name.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });
  }, [state.instructors, search]);

  const handleToggleBan = async (instructorId: string, ban: boolean, reason?: string) => {
    try {
      const res = await fetch(`/api/instructors/${instructorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_banned: ban, ban_reason: reason || "" }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      dispatch({ type: "UPDATE_INSTRUCTOR", instructor: updated });
      toast.success(ban ? "연락금지로 설정되었습니다." : "연락금지가 해제되었습니다.");
    } catch {
      toast.error("업데이트에 실패했습니다.");
    }
  };

  const handleAddPlatform = async () => {
    if (!newPlatform.trim()) return;
    try {
      const res = await fetch("/api/banned-platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPlatform.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadBannedPlatforms();
      setNewPlatform("");
      toast.success("금지 플랫폼이 추가되었습니다.");
    } catch {
      toast.error("추가에 실패했습니다.");
    }
  };

  const handleDeletePlatform = async (id: string) => {
    try {
      const res = await fetch("/api/banned-platforms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadBannedPlatforms();
      toast.success("삭제되었습니다.");
    } catch {
      toast.error("삭제에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">연락금지</h2>

      {/* 금지 플랫폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Ban className="h-4 w-4" />
            금지 플랫폼
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {state.bannedPlatforms.map((p) => (
              <Badge
                key={p.id}
                variant="destructive"
                className="flex items-center gap-1 cursor-pointer"
                onClick={() => handleDeletePlatform(p.id)}
              >
                {p.name}
                <Trash2 className="h-3 w-3" />
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="플랫폼 이름 추가..."
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddPlatform()}
              className="max-w-[200px]"
            />
            <Button size="sm" onClick={handleAddPlatform}>
              <Plus className="h-4 w-4 mr-1" />
              추가
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* 연락금지 강사 목록 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">연락금지 강사 ({bannedInstructors.length}명)</h3>
          <div className="relative w-[250px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름 검색..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>금지 사유</TableHead>
                <TableHead>강의 플랫폼</TableHead>
                <TableHead className="w-[80px]">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bannedInstructors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    연락금지 강사가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                bannedInstructors.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="text-sm">{i.ban_reason || "-"}</TableCell>
                    <TableCell className="text-sm">{i.lecture_platform || "-"}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleToggleBan(i.id, false)}
                      >
                        해제
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
