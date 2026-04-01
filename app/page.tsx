"use client";

import { OutreachProvider, useOutreach } from "@/hooks/use-outreach-store";
import NavHeader from "@/components/nav-header";
import DashboardTab from "@/components/dashboard-tab";
import InstructorsTab from "@/components/instructors-tab";
import ContactTab from "@/components/contact-tab";
import MeetingTab from "@/components/meeting-tab";
import ApplicationsTab from "@/components/applications-tab";
import BannedTab from "@/components/banned-tab";
import MessagesTab from "@/components/messages-tab";

function MainContent() {
  const { state } = useOutreach();

  if (!state.hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <main className="p-4">
        {state.tab === "dashboard" && <DashboardTab />}
        {state.tab === "instructors" && <InstructorsTab />}
        {state.tab === "contact" && <ContactTab />}
        {state.tab === "meeting" && <MeetingTab />}
        {state.tab === "applications" && <ApplicationsTab />}
        {state.tab === "banned" && <BannedTab />}
        {state.tab === "messages" && <MessagesTab />}
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
