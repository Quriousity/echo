import { LANGS, type GlossaryEntry, type Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  columns: [],
  translateModel: "gpt-6-luna",
  effort: "none",
  glossary: "",
  fontSize: 20,
  mode: "chunk",
};

// "에코 | Echo | 回声 | エコー" 한 줄 → { ko, en, zh, ja }. 빈 칸은 생략.
export function parseGlossary(text: string): GlossaryEntry[] {
  return text
    .split("\n")
    .map((line) => line.split("|").map((s) => s.trim()))
    .filter((cols) => cols.some(Boolean))
    .map((cols) => Object.fromEntries(LANGS.flatMap((l, i) => (cols[i] ? [[l, cols[i]]] : []))) as GlossaryEntry);
}

// 전사 힌트용 고유명사 목록
export function glossaryKeywords(entries: GlossaryEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => Object.values(e).filter(Boolean) as string[]))].slice(0, 100);
}
