export type Lang = "ko" | "en" | "zh";
export const LANGS: Lang[] = ["ko", "en", "zh"];
export const LANG_LABEL: Record<Lang, string> = { ko: "Korean", en: "English", zh: "Chinese" };

export type TranslateModel = "gpt-6-luna" | "gpt-6-sol";
export type Effort = "none" | "low" | "medium";

export type RowStatus = "transcribing" | "translating" | "done" | "empty" | "filler" | "error";

// 화면의 한 줄 = VAD 가 잘라 준 음성 조각 하나
export type Row = {
  seq: number;
  startedAt: number; // 말 시작 시각(ms)
  durationMs: number;
  forcedSplit: boolean; // 최대 길이로 강제로 잘린 조각
  langHint: Lang | null; // 수동 언어 지정
  speaker?: number | null; // 화자 0~3 (Q W E R), 지정 안 했으면 null
  status: RowStatus;
  source?: Lang | "other"; // 원문 언어
  original?: string; // 전사 원문
  text: Partial<Record<Lang, string>>; // 칸별 표시 텍스트 (원문 칸 = original)
  model?: TranslateModel; // 번역에 쓴 모델
  refining?: boolean; // 정밀 번역 중
  error?: string;
  sttMs?: number;
  trMs?: number;
};

export type GlossaryEntry = Partial<Record<Lang, string>>;

export type VadSettings = {
  positiveSpeechThreshold: number;
  negativeSpeechThreshold: number;
  redemptionMs: number;
  preSpeechPadMs: number;
  minSpeechMs: number;
  maxSegmentSec: number;
};

export type Settings = {
  vad: VadSettings;
  translateModel: TranslateModel;
  effort: Effort;
  glossary: string; // 한 줄에 "한국어 | English | 中文"
  fontSize: number; // px
  speakers: string[]; // Q W E R 화자 이름 (비면 "Speaker Q" 처럼 표시)
};

// 서버 API 요청/응답
export type ContextItem = { source: Lang | "other"; speaker?: string; ko?: string; en?: string; zh?: string };

// filler: 추임새(네네·응·uh-huh·嗯…)로만 이뤄진 발화 → 번역하지 않는다
export type TranscribeResponse = { text: string; languages: string[]; filler: boolean; ms: number } | { error: string };

export type TranslateRequest = {
  text: string;
  sttLanguages: string[];
  langHint: Lang | null;
  context: ContextItem[];
  glossary: GlossaryEntry[];
  model: TranslateModel;
  effort: Effort;
};

export type TranslateResponse =
  | { source: Lang | "other"; ko: string; en: string; zh: string; ms: number }
  | { error: string };
