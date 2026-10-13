import type { Lang } from "@/lib/types";

// 언어마다 고유 색 — 머리줄 칩과 원문 칸에 같은 색을 써서 "누가 어느 언어로 말했는지" 한눈에 보이게.
// (Tailwind 가 클래스를 찾을 수 있도록 전체 문자열로 적는다)
export const LANG_THEME: Record<Lang, { dot: string; chip: string; card: string; tag: string }> = {
  ko: {
    dot: "bg-rose-400",
    chip: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
    card: "bg-rose-50 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/30",
    tag: "text-rose-500 dark:text-rose-300",
  },
  en: {
    dot: "bg-sky-400",
    chip: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30",
    card: "bg-sky-50 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/30",
    tag: "text-sky-600 dark:text-sky-300",
  },
  zh: {
    dot: "bg-emerald-400",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
    card: "bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30",
    tag: "text-emerald-600 dark:text-emerald-300",
  },
};

// 원문이 아닌 칸
export const PLAIN_CARD = "bg-neutral-50 dark:bg-neutral-900/70";
