"use client";

import { useMemo } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS_COLORS } from "@/lib/constants";
import type { InstructorStatus } from "@/lib/types";

const CONTACT_STATUSES: InstructorStatus[] = ["진행 중", "계약 완료", "보류", "거절"];

export default function ContactTab() {
  const { state, dispatch } = useOutreach();

  const filtered = useMemo(() => {
    return state.instructors.filter((i) =>
      CONTACT_STATUSES.includes(i.status as InstructorStatus)
    );
  }, [state.instructors]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">컨택관리</h2>
        <span className="text-sm text-muted-foreground">{filtered.length}명</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {CONTACT_STATUSES.map((s) => {
          const count = filtered.filter((i) => i.status === s).length;
          return (
            <Badge key={s} variant="outline" className={STATUS_COLORS[s]}>
              {s} ({count})
            </Badge>
          );
        })}
      </div>
      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>분야</TableHead>
              <TableHead>담당자</TableHead>
              <TableHead>발송채널</TableHead>
              <TableHead>DM</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>최종상태</TableHead>
              <TableHead>미팅메모</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  진행 중인 컨택이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((i) => (
                <TableRow
                  key={i.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    dispatch({ type: "SET_TAB", tab: "instructors" });
                    setTimeout(() => dispatch({ type: "SELECT_INSTRUCTOR", id: i.id }), 100);
                  }}
                >
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[i.status as InstructorStatus] || ""}>
                      {i.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{i.field}</TableCell>
                  <TableCell className="text-sm">{i.assignee}</TableCell>
                  <TableCell className="text-sm">{i.outreach_channel || "-"}</TableCell>
                  <TableCell className="text-sm">{i.dm_sent ? "O" : "-"}</TableCell>
                  <TableCell className="text-sm">{i.email_sent ? "O" : "-"}</TableCell>
                  <TableCell className="text-sm">{i.final_status || "-"}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">
                    {i.meeting_memo || "-"}
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
