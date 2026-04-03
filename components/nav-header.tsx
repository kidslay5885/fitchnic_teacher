"use client";

import { useOutreach } from "@/hooks/use-outreach-store";
import type { TabId } from "@/lib/types";
import {
  LayoutDashboard, Users, MessageSquare, Calendar,
  FileText, Ban, Mail, Activity,
} from "lucide-react";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "현황판", icon: LayoutDashboard },
  { id: "instructors", label: "강사찾기", icon: Users },
  { id: "contact", label: "컨택관리", icon: MessageSquare },
  { id: "meeting", label: "미팅관리", icon: Calendar },
  { id: "applications", label: "지원서", icon: FileText },
  { id: "banned", label: "연락금지", icon: Ban },
  { id: "messages", label: "메시지", icon: Mail },
];

export default function NavHeader() {
  const { state, dispatch } = useOutreach();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-52 border-r bg-card flex flex-col">
      <div className="h-14 flex items-center px-5 border-b">
        <h1 className="text-base font-bold tracking-tight">핏크닉 아웃리치</h1>
      </div>

      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = state.tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => dispatch({ type: "SET_TAB", tab: t.id })}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4.5 w-4.5 flex-shrink-0" />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t px-3 py-2 space-y-1">
        <button
          onClick={() => dispatch({ type: "SET_TAB", tab: "activity" })}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            state.tab === "activity"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Activity className="h-4.5 w-4.5 flex-shrink-0" />
          활동 로그
        </button>
        <p className="text-xs text-muted-foreground px-3 py-1">
          {state.instructors.length}명 관리 중
        </p>
      </div>
    </aside>
  );
}
