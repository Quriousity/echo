import type { Lang } from "@/lib/types";

// 언어마다 고유 색 (globals.css 의 --ko/--en/--zh/--ja) — 칩과 원문 칸에 같은 색을 써서 "어느 언어로 말했는지" 한눈에 보이게.
// (Tailwind 가 클래스를 찾을 수 있도록 전체 문자열로 적는다. 원문 칸은 열을 끌어 겹칠 때 비치지 않게 불투명하게 섞는다)
export const LANG_THEME: Record<Lang, { dot: string; chip: string; card: string; tag: string }> = {
  ko: { dot: "bg-ko", chip: "bg-ko/10 text-ko ring-ko/30", card: "bg-[color-mix(in_oklab,var(--ko)_8%,var(--bg))] ring-1 ring-ko/25", tag: "text-ko" },
  en: { dot: "bg-en", chip: "bg-en/10 text-en ring-en/30", card: "bg-[color-mix(in_oklab,var(--en)_8%,var(--bg))] ring-1 ring-en/25", tag: "text-en" },
  zh: { dot: "bg-zh", chip: "bg-zh/10 text-zh ring-zh/30", card: "bg-[color-mix(in_oklab,var(--zh)_8%,var(--bg))] ring-1 ring-zh/25", tag: "text-zh" },
  ja: { dot: "bg-ja", chip: "bg-ja/10 text-ja ring-ja/30", card: "bg-[color-mix(in_oklab,var(--ja)_8%,var(--bg))] ring-1 ring-ja/25", tag: "text-ja" },
};

// 원문이 아닌 칸
export const PLAIN_CARD = "bg-panel";

// 자주 쓰는 버튼 모양
export const PILL = "rounded-full border border-line px-3 py-1.5 text-sm hover:bg-hover disabled:opacity-40";
export const SEGMENT = "flex overflow-hidden rounded-full border border-line text-sm";
export const SEGMENT_ON = "bg-fg text-bg";
export const SEGMENT_OFF = "text-muted hover:bg-hover hover:text-fg";
