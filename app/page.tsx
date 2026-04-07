"use client";

import { useState } from "react";
import { OutreachProvider, useOutreach } from "@/hooks/use-outreach-store";
import NavHeader from "@/components/nav-header";
import DashboardTab from "@/components/dashboard-tab";
import InstructorsTab from "@/components/instructors-tab";
import ContactTab from "@/components/contact-tab";
import MeetingTab from "@/components/meeting-tab";
import ApplicationsTab from "@/components/applications-tab";
import BannedTab from "@/components/banned-tab";
import MessagesTab from "@/components/messages-tab";
import ActivityTab from "@/components/activity-tab";
import YouTubeChannelsTab from "@/components/youtube-channels-tab";

function MainContent() {
  const { state } = useOutreach();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!state.hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavHeader collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main className={`p-6 transition-[margin] duration-200 ${sidebarCollapsed ? "ml-14" : "ml-52"}`}>
        <div className={state.tab === "meeting" ? "" : "max-w-7xl"}>
          {state.tab === "dashboard" && <DashboardTab />}
          {state.tab === "instructors" && <InstructorsTab />}
          {state.tab === "contact" && <ContactTab />}
          {state.tab === "meeting" && <MeetingTab />}
          {state.tab === "applications" && <ApplicationsTab />}
          {state.tab === "banned" && <BannedTab />}
          {state.tab === "messages" && <MessagesTab />}
          {state.tab === "activity" && <ActivityTab />}
          {state.tab === "youtube-channels" && <YouTubeChannelsTab />}
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <OutreachProvider>
      <MainContent />
    </OutreachProvider>
  );
}
