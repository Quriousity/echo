import type { GlossaryEntry, Settings } from "./types";

// PLAN.md §2-1 시작값
export const DEFAULT_SETTINGS: Settings = {
  vad: {
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    redemptionMs: 800,
    preSpeechPadMs: 300,
    minSpeechMs: 400,
    maxSegmentSec: 15,
  },
  translateModel: "gpt-6-luna",
  effort: "none",
  glossary: "",
  fontSize: 20,
  speakers: ["", "", "", ""],
};

export const SPEAKER_KEYS = ["Q", "W", "E", "R"] as const;

// 화자 이름: 설정에 적은 이름, 없으면 "Speaker Q"
export function speakerName(settings: Settings, index: number | null | undefined): string | null {
  if (index === null || index === undefined) return null;
  return settings.speakers[index]?.trim() || `Speaker ${SPEAKER_KEYS[index]}`;
}

// "에코 | Echo | 回声" 한 줄 → { ko, en, zh }. 빈 칸은 생략.
export function parseGlossary(text: string): GlossaryEntry[] {
  return text
    .split("\n")
    .map((line) => line.split("|").map((s) => s.trim()))
    .filter((cols) => cols.some(Boolean))
    .map(([ko, en, zh]) => ({
      ...(ko ? { ko } : {}),
      ...(en ? { en } : {}),
      ...(zh ? { zh } : {}),
    }));
}

// 전사 힌트용 고유명사 목록
export function glossaryKeywords(entries: GlossaryEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => Object.values(e).filter(Boolean) as string[]))].slice(0, 100);
}
