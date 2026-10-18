"use client";

import { useEffect, useSyncExternalStore } from "react";
import { PILL } from "./langTheme";

type Mode = "system" | "light" | "dark";
const KEY = "echo:theme"; // app/layout.tsx 의 인라인 스크립트와 같은 키
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "◐ Auto", light: "☀ Light", dark: "☾ Dark" };
const dark = matchMediaSafe();

function matchMediaSafe() {
  return typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)");
}

function readMode(): Mode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(mode: Mode) {
  const isDark = mode === "dark" || (mode === "system" && Boolean(dark?.matches));
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

// 누를 때마다 자동(시스템) → 라이트 → 다크
export default function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "system" as Mode);

  // 자동일 때는 시스템 설정이 바뀌면 따라간다
  useEffect(() => {
    if (mode !== "system" || !dark) return;
    const onChange = () => apply("system");
    dark.addEventListener("change", onChange);
    return () => dark.removeEventListener("change", onChange);
  }, [mode]);

  const cycle = () => {
    const next = NEXT[mode];
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {}
    apply(next);
    listeners.forEach((fn) => fn());
  };

  return (
    <button type="button" onClick={cycle} title="Theme: auto → light → dark" className={`${PILL} w-[5.5rem]`}>
      {LABEL[mode]}
    </button>
  );
}
