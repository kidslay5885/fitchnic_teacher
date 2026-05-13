"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type {
  Instructor,
  InstructorStatus,
  StatusHistory,
  OutreachWave,
  Application,
  MessageTemplate,
  BannedPlatform,
  YouTubeChannel,
  DashboardStats,
  TabId,
  FilterState,
} from "@/lib/types";

// ===== State =====
interface AppState {
  hydrated: boolean;
  loading: boolean;
  tab: TabId;
  instructors: Instructor[];
  selectedId: string | null;
  // 다른 탭에서 컨택관리 탭으로 진입 시 특정 강사를 상단에 스크롤·하이라이트하기 위한 1회성 신호
  focusInstructorId: string | null;
  history: StatusHistory[];
  waves: OutreachWave[];
  applications: Application[];
  templates: MessageTemplate[];
  bannedPlatforms: BannedPlatform[];
  youtubeChannels: YouTubeChannel[];
  filters: FilterState;
  stats: DashboardStats | null;
  unackedFailureCount: number;
  gmailHealth: GmailHealth | null;
}

export interface GmailHealth {
  ok: boolean;
  kind?: string;
  label?: string;
  message?: string;
  checkedAt: string;
}

const initialState: AppState = {
  hydrated: false,
  loading: false,
  tab: "dashboard",
  instructors: [],
  selectedId: null,
  focusInstructorId: null,
  history: [],
  waves: [],
  applications: [],
  templates: [],
  bannedPlatforms: [],
  youtubeChannels: [],
  filters: {
    search: "",
    status: "전체",
    assignee: "",
    field: "",
    source: "전체",
  },
  stats: null,
  unackedFailureCount: 0,
  gmailHealth: null,
};

// ===== Actions =====
type Action =
  | { type: "HYDRATE"; instructors: Instructor[]; stats: DashboardStats }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_TAB"; tab: TabId }
  | { type: "SET_INSTRUCTORS"; instructors: Instructor[] }
  | { type: "UPDATE_INSTRUCTOR"; instructor: Instructor }
  | { type: "ADD_INSTRUCTOR"; instructor: Instructor }
  | { type: "DELETE_INSTRUCTOR"; id: string }
  | { type: "SELECT_INSTRUCTOR"; id: string | null }
  | { type: "FOCUS_INSTRUCTOR"; id: string | null }
  | { type: "SET_HISTORY"; history: StatusHistory[] }
  | { type: "SET_WAVES"; waves: OutreachWave[] }
  | { type: "SET_APPLICATIONS"; applications: Application[] }
  | { type: "SET_TEMPLATES"; templates: MessageTemplate[] }
  | { type: "SET_BANNED_PLATFORMS"; platforms: BannedPlatform[] }
  | { type: "SET_YOUTUBE_CHANNELS"; channels: YouTubeChannel[] }
  | { type: "SET_FILTER"; filters: Partial<FilterState> }
  | { type: "SET_STATS"; stats: DashboardStats }
  | { type: "SET_UNACKED_FAILURE_COUNT"; count: number }
  | { type: "SET_GMAIL_HEALTH"; health: GmailHealth | null };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        hydrated: true,
        loading: false,
        instructors: action.instructors,
        stats: action.stats,
      };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_TAB":
      return { ...state, tab: action.tab, selectedId: null, focusInstructorId: null };
    case "SET_INSTRUCTORS":
      return { ...state, instructors: action.instructors };
    case "UPDATE_INSTRUCTOR":
      return {
        ...state,
        instructors: state.instructors.map((i) =>
          i.id === action.instructor.id ? action.instructor : i
        ),
      };
    case "ADD_INSTRUCTOR":
      return {
        ...state,
        instructors: [action.instructor, ...state.instructors],
      };
    case "DELETE_INSTRUCTOR":
      return {
        ...state,
        instructors: state.instructors.filter((i) => i.id !== action.id),
        selectedId:
          state.selectedId === action.id ? null : state.selectedId,
      };
    case "SELECT_INSTRUCTOR":
      return { ...state, selectedId: action.id };
    case "FOCUS_INSTRUCTOR":
      return { ...state, focusInstructorId: action.id };
    case "SET_HISTORY":
      return { ...state, history: action.history };
    case "SET_WAVES":
      return { ...state, waves: action.waves };
    case "SET_APPLICATIONS":
      return { ...state, applications: action.applications };
    case "SET_TEMPLATES":
      return { ...state, templates: action.templates };
    case "SET_BANNED_PLATFORMS":
      return { ...state, bannedPlatforms: action.platforms };
    case "SET_YOUTUBE_CHANNELS":
      return { ...state, youtubeChannels: action.channels };
    case "SET_FILTER":
      return {
        ...state,
        filters: { ...state.filters, ...action.filters },
      };
    case "SET_STATS":
      return { ...state, stats: action.stats };
    case "SET_UNACKED_FAILURE_COUNT":
      return { ...state, unackedFailureCount: action.count };
    case "SET_GMAIL_HEALTH":
      return { ...state, gmailHealth: action.health };
    default:
      return state;
  }
}

// ===== Context =====
interface StoreCtx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  loadInstructors: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadHistory: (instructorId: string) => Promise<void>;
  loadWaves: (instructorId: string) => Promise<void>;
  loadApplications: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  loadBannedPlatforms: () => Promise<void>;
  loadYoutubeChannels: () => Promise<void>;
  loadUnackedFailureCount: () => Promise<void>;
  loadGmailHealth: () => Promise<void>;
}

const Ctx = createContext<StoreCtx | null>(null);

export function OutreachProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadInstructors = useCallback(async () => {
    try {
      const res = await fetch("/api/instructors");
      const data = await res.json();
      dispatch({ type: "SET_INSTRUCTORS", instructors: data });
    } catch (e) {
      console.error("Failed to load instructors", e);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      dispatch({ type: "SET_STATS", stats: data });
    } catch (e) {
      console.error("Failed to load stats", e);
    }
  }, []);

  const loadHistory = useCallback(async (instructorId: string) => {
    try {
      const res = await fetch(`/api/instructors/${instructorId}/history`);
      const data = await res.json();
      dispatch({ type: "SET_HISTORY", history: data });
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);

  const loadWaves = useCallback(async (instructorId: string) => {
    try {
      const res = await fetch(`/api/instructors/${instructorId}/waves`);
      const data = await res.json();
      dispatch({ type: "SET_WAVES", waves: data });
    } catch (e) {
      console.error("Failed to load waves", e);
    }
  }, []);

  const loadApplications = useCallback(async () => {
    try {
      const res = await fetch("/api/applications");
      const data = await res.json();
      dispatch({ type: "SET_APPLICATIONS", applications: data });
    } catch (e) {
      console.error("Failed to load applications", e);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      dispatch({ type: "SET_TEMPLATES", templates: data });
    } catch (e) {
      console.error("Failed to load templates", e);
    }
  }, []);

  const loadBannedPlatforms = useCallback(async () => {
    try {
      const res = await fetch("/api/banned-platforms");
      const data = await res.json();
      dispatch({ type: "SET_BANNED_PLATFORMS", platforms: data });
    } catch (e) {
      console.error("Failed to load banned platforms", e);
    }
  }, []);

  const loadYoutubeChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/youtube-channels");
      const data = await res.json();
      dispatch({ type: "SET_YOUTUBE_CHANNELS", channels: Array.isArray(data) ? data : [] });
    } catch (e) {
      console.error("Failed to load youtube channels", e);
    }
  }, []);

  const loadUnackedFailureCount = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/unacked-failures");
      if (!res.ok) return;
      const data = await res.json();
      dispatch({ type: "SET_UNACKED_FAILURE_COUNT", count: data.total || 0 });
    } catch {}
  }, []);

  const loadGmailHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/health");
      if (!res.ok) return;
      const data = (await res.json()) as GmailHealth;
      dispatch({ type: "SET_GMAIL_HEALTH", health: data });
    } catch {}
  }, []);

  // Initial hydration
  useEffect(() => {
    async function hydrate() {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const [instructorsRes, statsRes] = await Promise.all([
          fetch("/api/instructors"),
          fetch("/api/stats"),
        ]);
        const [instructors, stats] = await Promise.all([
          instructorsRes.json(),
          statsRes.json(),
        ]);
        dispatch({ type: "HYDRATE", instructors, stats });
      } catch (e) {
        console.error("Hydration failed", e);
        dispatch({ type: "SET_LOADING", loading: false });
      }
    }
    hydrate();
  }, []);

  // 경량 동기화: 변경 여부만 확인 후 필요할 때만 전체 로드
  useEffect(() => {
    let syncRef = { count: 0, ts: "" };
    const checkSync = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/sync");
        if (!res.ok) return;
        const { count, latest_updated_at } = await res.json();
        if (syncRef.count !== count || syncRef.ts !== latest_updated_at) {
          syncRef = { count, ts: latest_updated_at };
          loadInstructors();
          loadStats();
        }
      } catch {}
    };
    // 초기값 세팅
    fetch("/api/sync").then(r => r.json()).then(d => {
      syncRef = { count: d.count, ts: d.latest_updated_at };
    }).catch(() => {});
    const interval = setInterval(checkSync, 15000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkSync();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadInstructors, loadStats]);

  // 미확인 자동 발송 실패 카운트 폴링 (초기 1회 + 60초 + 탭 가시화 시)
  useEffect(() => {
    loadUnackedFailureCount();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadUnackedFailureCount();
    }, 60000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadUnackedFailureCount();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadUnackedFailureCount]);

  // Gmail 토큰 헬스 폴링 (초기 1회 + 5분 + 탭 가시화 시)
  useEffect(() => {
    loadGmailHealth();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadGmailHealth();
    }, 5 * 60 * 1000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadGmailHealth();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadGmailHealth]);


  return React.createElement(
    Ctx.Provider,
    {
      value: {
        state,
        dispatch,
        loadInstructors,
        loadStats,
        loadHistory,
        loadWaves,
        loadApplications,
        loadTemplates,
        loadBannedPlatforms,
        loadYoutubeChannels,
        loadUnackedFailureCount,
        loadGmailHealth,
      },
    },
    children
  );
}

export function useOutreach() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOutreach must be used within OutreachProvider");
  return ctx;
}
