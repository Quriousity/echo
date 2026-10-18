"use client";

import { nextSeq, useEcho } from "./store";
import { glossaryKeywords, parseGlossary } from "./settings";
import {
  LANGS,
  type ContextItem,
  type Lang,
  type Row,
  type Source,
  type TranscribeResponse,
  type TranslateModel,
  type TranslateRequest,
  type TranslateResponse,
} from "./types";

// 실패 시 재시도를 위해 원문이 확정될 때까지 오디오를 들고 있는다
const audio = new Map<number, Blob>();

// 동시에 최대 2개 처리. 결과는 seq 로 줄에 꽂히므로 끝나는 순서는 상관없다.
const MAX_CONCURRENT = 2;
let active = 0;
const waiting: (() => Promise<void>)[] = [];

function enqueue(job: () => Promise<void>) {
  waiting.push(job);
  pump();
}

function pump() {
  while (active < MAX_CONCURRENT && waiting.length) {
    const job = waiting.shift()!;
    active++;
    job().finally(() => {
      active--;
      pump();
    });
  }
}

// 녹음 시작~끝 한 묶음 → 전사 → 번역
export function submitVoice(blob: Blob, durationMs: number) {
  const seq = nextSeq();
  audio.set(seq, blob);
  useEcho.getState().addRow({
    seq,
    input: "voice",
    startedAt: Date.now() - durationMs,
    durationMs,
    langHint: useEcho.getState().langHint,
    status: "transcribing",
    text: {},
  });
  enqueue(() => transcribeRow(seq));
}

// 입력창에 친 문장 한 묶음 → 바로 번역
export function submitText(original: string) {
  const seq = nextSeq();
  const langHint = useEcho.getState().langHint;
  const source = guessLang(original, [], langHint);
  useEcho.getState().addRow({
    seq,
    input: "text",
    startedAt: Date.now(),
    durationMs: 0,
    langHint,
    status: "translating",
    original,
    source,
    text: source && source !== "other" ? { [source]: original } : {},
  });
  enqueue(() => translateRow(seq));
}

export function canRetry(row: Row): boolean {
  return Boolean(row.original) || audio.has(row.seq);
}

export function retry(seq: number) {
  const row = useEcho.getState().rows.find((r) => r.seq === seq);
  if (!row) return;
  // 원문이 있으면 번역만, 없으면 전사부터
  if (row.original) {
    useEcho.getState().updateRow(seq, { status: "translating", error: undefined });
    enqueue(() => translateRow(seq));
  } else if (audio.has(seq)) {
    useEcho.getState().updateRow(seq, { status: "transcribing", error: undefined });
    enqueue(() => transcribeRow(seq));
  }
}

// 정밀 번역: 이 줄만 상위 모델로, 지금 보이는 칸 기준으로 다시 번역
export function refine(seq: number, model: TranslateModel = "gpt-6-sol") {
  useEcho.getState().updateRow(seq, { refining: true, error: undefined });
  enqueue(() => translateRow(seq, model));
}

async function postJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`${url} returned an invalid response (HTTP ${res.status})`);
  }
}

// 브라우저마다 녹음 형식이 다르다 (Chrome webm, Safari mp4). 확장자로 형식을 알리므로 맞춰 붙인다.
const extension = (type: string) => (type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm");

async function transcribeRow(seq: number) {
  const { updateRow, settings } = useEcho.getState();
  const row = useEcho.getState().rows.find((r) => r.seq === seq);
  const blob = audio.get(seq);
  if (!row || !blob) return;

  try {
    const form = new FormData();
    form.append("file", blob, `segment.${extension(blob.type)}`);
    if (row.langHint) form.append("langHint", row.langHint);
    const prev = previousOriginal(seq, row.langHint);
    if (prev) form.append("prompt", prev);
    form.append("keywords", JSON.stringify(glossaryKeywords(parseGlossary(settings.glossary))));

    const res = await postJson<TranscribeResponse>("/api/transcribe", { method: "POST", body: form });
    if ("error" in res) throw new Error(res.error);

    if (!res.text) {
      updateRow(seq, { status: "empty", sttMs: res.ms });
      audio.delete(seq);
      return;
    }
    const guess = guessLang(res.text, res.languages, row.langHint);
    audio.delete(seq);
    // 추임새만 있는 줄은 번역하지 않고 원문만 회색 한 줄로 남긴다
    if (res.filler) {
      updateRow(seq, { status: "filler", original: res.text, source: guess, sttMs: res.ms });
      return;
    }
    updateRow(seq, {
      status: "translating",
      original: res.text,
      source: guess,
      text: guess && guess !== "other" ? { [guess]: res.text } : {},
      sttMs: res.ms,
    });
    await translateRow(seq);
  } catch (err) {
    updateRow(seq, { status: "error", error: (err as Error).message });
  }
}

async function translateRow(seq: number, model?: TranslateModel) {
  const { updateRow, settings } = useEcho.getState();
  const row = useEcho.getState().rows.find((r) => r.seq === seq);
  if (!row?.original) return;
  const useModel = model ?? settings.translateModel;

  try {
    const body: TranslateRequest = {
      text: row.original,
      input: row.input,
      langHint: row.langHint,
      targets: settings.columns,
      context: contextBefore(seq),
      glossary: parseGlossary(settings.glossary),
      model: useModel,
      effort: settings.effort,
    };
    const res = await postJson<TranslateResponse>("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if ("error" in res) throw new Error(res.error);

    // 앞서 번역해 둔 다른 칸은 남기고 이번 칸만 덮는다. 원문 칸은 LLM 이 다듬지 않게 원문 그대로
    const text: Row["text"] = { ...row.text, ...res.translations };
    if (res.source !== "other") text[res.source] = row.original;
    updateRow(seq, { status: "done", source: res.source, text, trMs: res.ms, model: useModel, refining: false });
  } catch (err) {
    updateRow(seq, { status: "error", error: (err as Error).message, refining: false });
  }
}

// 원문 칸 1차 판정 (번역 결과의 source 로 최종 확정).
// gpt-transcribe 의 languages 는 애매한 음성에서 후보 목록 첫 값(ko)을 그대로 돌려주므로 글자 종류를 먼저 본다.
// 가나가 섞이면 일본어, 한자만 있으면 중국어로 보고 최종 판단은 번역 모델에 맡긴다.
function guessLang(text: string, detected: string[], hint: Lang | null): Source | undefined {
  if (hint) return hint;
  if (/\p{Script=Hangul}/u.test(text)) return "ko";
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "ja";
  if (/\p{Script=Han}/u.test(text)) return "zh";
  if (/\p{Script=Latin}/u.test(text)) return "en";
  const first = detected.find((c) => LANGS.includes(c as Lang));
  return (first as Lang | undefined) ?? (detected.length ? "other" : undefined);
}

// 번역 맥락: 이 줄 앞의 완료된 발화 5개 (원문)
function contextBefore(seq: number): ContextItem[] {
  return useEcho
    .getState()
    .rows.filter((r) => r.seq < seq && r.status === "done" && r.source && r.original)
    .slice(-5)
    .map((r) => ({ source: r.source!, text: r.original! }));
}

// 전사 힌트: 직전 발화 원문. 언어를 지정했으면 같은 언어 문장만 (다른 언어 문장은 오히려 전사를 그쪽으로 끌고 간다)
function previousOriginal(seq: number, hint: Lang | null): string | undefined {
  const prev = useEcho
    .getState()
    .rows.filter((r) => r.seq < seq && r.original && r.status !== "filler")
    .at(-1);
  return prev && (!hint || prev.source === hint) ? prev.original : undefined;
}
