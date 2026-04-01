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

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "현황판", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "instructors", label: "강사DB", icon: <Users className="h-4 w-4" /> },
  { id: "contact", label: "컨택관리", icon: <MessageSquare className="h-4 w-4" /> },
  { id: "meeting", label: "미팅관리", icon: <Calendar className="h-4 w-4" /> },
  { id: "applications", label: "지원서", icon: <FileText className="h-4 w-4" /> },
  { id: "banned", label: "연락금지", icon: <Ban className="h-4 w-4" /> },
  { id: "messages", label: "메시지", icon: <Mail className="h-4 w-4" /> },
];

export default function NavHeader() {
  const { state, dispatch } = useOutreach();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 gap-6">
        <h1 className="text-base font-bold whitespace-nowrap">
          핏크닉 아웃리치
        </h1>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => dispatch({ type: "SET_TAB", tab: t.id })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                state.tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
