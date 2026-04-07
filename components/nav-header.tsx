"use client";

import { useOutreach } from "@/hooks/use-outreach-store";
import type { TabId } from "@/lib/types";
import {
  LayoutDashboard, Users, MessageSquare, Calendar,
  FileText, Ban, Mail, Activity, PanelLeftClose, PanelLeftOpen,
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

export default function NavHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { state, dispatch } = useOutreach();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 border-r bg-card flex flex-col transition-[width] duration-200 ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      <div className="h-14 flex items-center border-b px-3 gap-2">
        {!collapsed && <h1 className="text-base font-bold tracking-tight flex-1 pl-2">핏크닉 아웃리치</h1>}
        <button
          onClick={onToggle}
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title={collapsed ? "사이드바 열기" : "사이드바 접기"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = state.tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => dispatch({ type: "SET_TAB", tab: t.id })}
              title={collapsed ? t.label : undefined}
              className={`w-full flex items-center gap-3 rounded-md text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-0 py-2" : "px-3 py-2"
              } ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4.5 w-4.5 flex-shrink-0" />
              {!collapsed && t.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t px-2 py-2 space-y-1">
        <button
          onClick={() => dispatch({ type: "SET_TAB", tab: "activity" })}
          title={collapsed ? "활동 로그" : undefined}
          className={`w-full flex items-center gap-3 rounded-md text-sm font-medium transition-colors ${
            collapsed ? "justify-center px-0 py-2" : "px-3 py-2"
          } ${
            state.tab === "activity"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Activity className="h-4.5 w-4.5 flex-shrink-0" />
          {!collapsed && "활동 로그"}
        </button>
        {!collapsed && (
          <p className="text-xs text-muted-foreground px-3 py-1">
            {state.instructors.length}명 관리 중
          </p>
        )}
      </div>
    </aside>
  );
}
