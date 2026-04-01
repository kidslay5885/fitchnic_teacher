"use client";

import { useOutreach } from "@/hooks/use-outreach-store";
import type { TabId } from "@/lib/types";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Calendar,
  FileText,
  Ban,
  Mail,
} from "lucide-react";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "현황판", icon: LayoutDashboard },
  { id: "instructors", label: "강사DB", icon: Users },
  { id: "contact", label: "컨택관리", icon: MessageSquare },
  { id: "meeting", label: "미팅관리", icon: Calendar },
  { id: "applications", label: "지원서", icon: FileText },
  { id: "banned", label: "연락금지", icon: Ban },
  { id: "messages", label: "메시지", icon: Mail },
];

export default function NavHeader() {
  const { state, dispatch } = useOutreach();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-48 border-r bg-card flex flex-col">
      {/* 로고 */}
      <div className="h-12 flex items-center px-4 border-b">
        <h1 className="text-sm font-bold tracking-tight">핏크닉 아웃리치</h1>
      </div>

      {/* 네비 */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = state.tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => dispatch({ type: "SET_TAB", tab: t.id })}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* 하단 */}
      <div className="border-t px-4 py-2">
        <p className="text-[11px] text-muted-foreground">
          {state.instructors.length}명 관리 중
        </p>
      </div>
    </aside>
  );
}
