export type Lang = "ko" | "en" | "zh" | "ja";
export const LANGS: Lang[] = ["ko", "en", "zh", "ja"];
export const LANG_LABEL: Record<Lang, string> = { ko: "Korean", en: "English", zh: "Chinese", ja: "Japanese" };
export type Source = Lang | "other";

export type TranslateModel = "gpt-6-luna" | "gpt-6-sol";
export type Effort = "none" | "low" | "medium";
// chunk: 사용자가 녹음 시작~끝을 직접 정한다 · live: 듣는 동안 말이 멈출 때마다 알아서 끊어 보낸다
export type InputMode = "chunk" | "live";

export type RowStatus = "transcribing" | "translating" | "done" | "empty" | "filler" | "error";

// 화면의 한 줄 = 사용자가 보낸 한 묶음 (입력한 문장, 또는 녹음 시작~끝)
export type Row = {
  seq: number;
  input: "voice" | "text";
  startedAt: number; // 말(입력) 시작 시각(ms)
  durationMs: number; // 녹음 길이 (입력한 문장은 0)
  langHint: Lang | null; // 수동 언어 지정
  status: RowStatus;
  source?: Source; // 원문 언어
  original?: string; // 원문 (전사 결과 또는 입력한 문장)
  text: Partial<Record<Lang, string>>; // 칸별 표시 텍스트 (원문 칸 = original)
  model?: TranslateModel; // 번역에 쓴 모델
  refining?: boolean; // 정밀 번역 중
  error?: string;
  sttMs?: number;
  trMs?: number;
};

export type GlossaryEntry = Partial<Record<Lang, string>>;

export type Settings = {
  columns: Lang[]; // 화면에 나눠 보여 줄 언어 (= 번역할 언어). 처음엔 비어 있다
  translateModel: TranslateModel;
  effort: Effort;
  glossary: string; // 한 줄에 "한국어 | English | 中文 | 日本語"
  fontSize: number; // px
  mode: InputMode;
};

// 서버 API 요청/응답
export type ContextItem = { source: Source; text: string };

// filler: 추임새(네네·응·uh-huh·嗯…)로만 이뤄진 발화 → 번역하지 않는다
export type TranscribeResponse = { text: string; languages: string[]; filler: boolean; ms: number } | { error: string };

export type TranslateRequest = {
  text: string;
  input: Row["input"];
  langHint: Lang | null;
  targets: Lang[];
  context: ContextItem[];
  glossary: GlossaryEntry[];
  model: TranslateModel;
  effort: Effort;
};

export type TranslateResponse =
  | { source: Source; translations: Partial<Record<Lang, string>>; ms: number }
  | { error: string };
