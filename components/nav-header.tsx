"use client";

import { useOutreach } from "@/hooks/use-outreach-store";
import type { TabId } from "@/lib/types";
import {
  LayoutDashboard, Users, MessageSquare, Calendar,
  FileText, Ban, Mail, Activity, PanelLeftClose, PanelLeftOpen,
  CalendarDays, CalendarClock,
} from "lucide-react";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "현황판", icon: LayoutDashboard },
  { id: "instructors", label: "강사찾기", icon: Users },
  { id: "contact", label: "컨택관리", icon: MessageSquare },
  { id: "meeting", label: "미팅관리", icon: Calendar },
  { id: "applications", label: "지원서", icon: FileText },
  { id: "banned", label: "연락금지", icon: Ban },
  { id: "messages", label: "메시지", icon: Mail },
  { id: "schedule", label: "강의현황", icon: CalendarDays },
  { id: "timeline", label: "무료강의 타임라인", icon: CalendarClock },
];

export default function NavHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { state, dispatch } = useOutreach();

  // 미확인 지원서 카운트: 지원서 탭 진입 후엔 로컬 상태로 실시간 반영, 진입 전엔 폴링값 사용
  const unreviewedCount = state.applications.length > 0
    ? state.applications.filter((a) => a.review_status === "미확인").length
    : state.unreviewedApplicationCount;

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
          const showAlert = t.id === "dashboard" && !!(state.gmailHealth && !state.gmailHealth.ok);
          const badgeCount = t.id === "applications" ? unreviewedCount : 0;
          const badgeColor = active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground";
          return (
            <button
              key={t.id}
              onClick={() => dispatch({ type: "SET_TAB", tab: t.id })}
              title={collapsed ? `${t.label}${showAlert ? " · Gmail 연결 만료" : ""}${badgeCount > 0 ? ` · 미확인 ${badgeCount}` : ""}` : undefined}
              className={`relative w-full flex items-center gap-3 rounded-md text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-0 py-2" : "px-3 py-2"
              } ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <span className="relative inline-flex flex-shrink-0">
                <Icon className="h-4.5 w-4.5" />
                {showAlert && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card" />
                )}
                {collapsed && badgeCount > 0 && (
                  <span className={`absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full text-[9px] font-bold leading-none ring-2 ring-card ${badgeColor}`}>
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </span>
              {!collapsed && t.label}
              {!collapsed && badgeCount > 0 && (
                <span className={`ml-auto min-w-[18px] h-[18px] px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold leading-none ${badgeColor}`}>
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t px-2 py-2 space-y-1">
        <button
          onClick={() => dispatch({ type: "SET_TAB", tab: "activity" })}
          title={collapsed ? `활동 로그${state.unackedFailureCount > 0 ? ` · 미확인 실패 ${state.unackedFailureCount}` : ""}` : undefined}
          className={`relative w-full flex items-center gap-3 rounded-md text-sm font-medium transition-colors ${
            collapsed ? "justify-center px-0 py-2" : "px-3 py-2"
          } ${
            state.tab === "activity"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <span className="relative inline-flex flex-shrink-0">
            <Activity className="h-4.5 w-4.5" />
            {state.unackedFailureCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card" />
            )}
          </span>
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
