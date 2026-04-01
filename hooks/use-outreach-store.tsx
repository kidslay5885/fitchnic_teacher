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
  history: StatusHistory[];
  waves: OutreachWave[];
  applications: Application[];
  templates: MessageTemplate[];
  bannedPlatforms: BannedPlatform[];
  filters: FilterState;
  stats: DashboardStats | null;
}

const initialState: AppState = {
  hydrated: false,
  loading: false,
  tab: "dashboard",
  instructors: [],
  selectedId: null,
  history: [],
  waves: [],
  applications: [],
  templates: [],
  bannedPlatforms: [],
  filters: {
    search: "",
    status: "전체",
    assignee: "",
    field: "",
    source: "전체",
  },
  stats: null,
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
  | { type: "SET_HISTORY"; history: StatusHistory[] }
  | { type: "SET_WAVES"; waves: OutreachWave[] }
  | { type: "SET_APPLICATIONS"; applications: Application[] }
  | { type: "SET_TEMPLATES"; templates: MessageTemplate[] }
  | { type: "SET_BANNED_PLATFORMS"; platforms: BannedPlatform[] }
  | { type: "SET_FILTER"; filters: Partial<FilterState> }
  | { type: "SET_STATS"; stats: DashboardStats };

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
      return { ...state, tab: action.tab, selectedId: null };
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
    case "SET_FILTER":
      return {
        ...state,
        filters: { ...state.filters, ...action.filters },
      };
    case "SET_STATS":
      return { ...state, stats: action.stats };
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
