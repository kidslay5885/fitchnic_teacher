"use client";

import { useMemo } from "react";
import { useOutreach } from "@/hooks/use-outreach-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_COLORS } from "@/lib/constants";
import type { InstructorStatus } from "@/lib/types";
import { Calendar, User, MessageSquare } from "lucide-react";

export default function MeetingTab() {
  const { state, dispatch } = useOutreach();

  const meetings = useMemo(() => {
    return state.instructors
      .filter((i) => i.meeting_date)
      .sort((a, b) => {
        if (!a.meeting_date) return 1;
        if (!b.meeting_date) return -1;
        return a.meeting_date.localeCompare(b.meeting_date);
      });
  }, [state.instructors]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">미팅관리</h2>
        <span className="text-sm text-muted-foreground">{meetings.length}건</span>
      </div>

      {meetings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          예정된 미팅이 없습니다.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {meetings.map((i) => (
            <Card
              key={i.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => {
                dispatch({ type: "SET_TAB", tab: "instructors" });
                setTimeout(() => dispatch({ type: "SELECT_INSTRUCTOR", id: i.id }), 100);
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{i.name}</CardTitle>
                  <Badge className={STATUS_COLORS[i.status as InstructorStatus] || ""}>
                    {i.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{i.meeting_date}</span>
                </div>
                {i.field && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    <span>{i.field}</span>
                  </div>
                )}
                {i.instructor_info && (
                  <p className="text-xs text-muted-foreground">{i.instructor_info}</p>
                )}
                {i.meeting_memo && (
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                    <p className="text-xs">{i.meeting_memo}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
