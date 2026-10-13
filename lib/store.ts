"use client";

import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { DEFAULT_SETTINGS } from "./settings";
import type { Lang, Row, Settings } from "./types";

const SETTINGS_KEY = "echo:settings";
const CURRENT_KEY = "echo:current-session";

type Session = { id: string; startedAt: number };

type State = {
  session: Session;
  rows: Row[];
  settings: Settings;
  langHint: Lang | null; // 수동 언어 지정 (단축키 0~3)
  speaker: number | null; // 현재 화자 (단축키 Q W E R)
  listening: boolean;
  hasKey: boolean | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  addRow: (row: Row) => void;
  updateRow: (seq: number, patch: Partial<Row>) => void;
  newSession: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  setLangHint: (lang: Lang | null) => void;
  setSpeaker: (speaker: number | null) => void;
  setListening: (v: boolean) => void;
  setHasKey: (v: boolean) => void;
};

const newSessionObj = (): Session => ({ id: `s-${Date.now()}`, startedAt: Date.now() });

export const useEcho = create<State>((set, get) => ({
  session: newSessionObj(),
  rows: [],
  settings: DEFAULT_SETTINGS,
  langHint: null,
  speaker: null,
  listening: false,
  hasKey: null,
  hydrated: false,

  // 새로고침해도 이어서 보이도록: 설정은 localStorage, 발화 기록은 IndexedDB
  hydrate: async () => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const s = JSON.parse(saved) as Partial<Settings>;
        set({
          settings: {
            ...DEFAULT_SETTINGS,
            ...s,
            vad: { ...DEFAULT_SETTINGS.vad, ...s.vad },
            speakers: DEFAULT_SETTINGS.speakers.map((d, i) => s.speakers?.[i] ?? d),
          },
        });
      }
    } catch {}
    try {
      const current = await idbGet<{ session: Session; rows: Row[] }>(CURRENT_KEY);
      if (current) {
        // 새로고침 순간 처리 중이던 줄은 오디오가 사라졌으므로 멈춘 상태로 표시
        const rows = current.rows.map((r): Row =>
          r.status === "transcribing" || r.status === "translating" || r.refining
            ? { ...r, refining: false, status: r.original ? "error" : "empty", error: "Interrupted by page reload" }
            : r,
        );
        set({ session: current.session, rows });
      }
    } catch {}
    set({ hydrated: true });
  },

  addRow: (row) => {
    set((s) => ({ rows: [...s.rows, row].sort((a, b) => a.seq - b.seq) }));
    persist();
  },

  updateRow: (seq, patch) => {
    set((s) => ({ rows: s.rows.map((r) => (r.seq === seq ? { ...r, ...patch } : r)) }));
    persist();
  },

  newSession: () => {
    const { session, rows } = get();
    if (rows.length) void idbSet(`echo:session:${session.id}`, { session, rows }); // 이전 세션은 보관
    set({ session: newSessionObj(), rows: [] });
    persist();
  },

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  },

  setLangHint: (langHint) => set({ langHint }),
  setSpeaker: (speaker) => set({ speaker }),
  setListening: (listening) => set({ listening }),
  setHasKey: (hasKey) => set({ hasKey }),
}));

// 잦은 갱신을 묶어서 저장
let timer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const { session, rows, hydrated } = useEcho.getState();
    if (hydrated) void idbSet(CURRENT_KEY, { session, rows });
  }, 300);
}

export function nextSeq(): number {
  const rows = useEcho.getState().rows;
  return rows.length ? rows[rows.length - 1].seq + 1 : 1;
}
