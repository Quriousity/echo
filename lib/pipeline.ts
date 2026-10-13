"use client";

import { useEcho } from "./store";
import { glossaryKeywords, parseGlossary, speakerName } from "./settings";
import {
  LANGS,
  type ContextItem,
  type Lang,
  type Row,
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

export function submitSegment(row: Row, wav: Blob) {
  audio.set(row.seq, wav);
  useEcho.getState().addRow(row);
  enqueue(() => transcribeRow(row.seq));
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

// 정밀 번역: 이 줄만 상위 모델로 다시 번역
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

async function transcribeRow(seq: number) {
  const { updateRow, settings } = useEcho.getState();
  const row = useEcho.getState().rows.find((r) => r.seq === seq);
  const wav = audio.get(seq);
  if (!row || !wav) return;

  try {
    const form = new FormData();
    form.append("file", wav, "segment.wav");
    if (row.langHint) form.append("langHint", row.langHint);
    const prev = previousOriginal(seq);
    if (prev) form.append("prompt", prev);
    form.append("keywords", JSON.stringify(glossaryKeywords(parseGlossary(settings.glossary))));

    const res = await postJson<TranscribeResponse>("/api/transcribe", { method: "POST", body: form });
    if ("error" in res) throw new Error(res.error);

    if (!res.text) {
      updateRow(seq, { status: "empty", sttMs: res.ms });
      audio.delete(seq);
      return;
    }
    const guess = guessLang(res.languages, row.langHint);
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
    await translateRow(seq, undefined, res.languages);
  } catch (err) {
    updateRow(seq, { status: "error", error: (err as Error).message });
  }
}

async function translateRow(seq: number, model?: TranslateModel, sttLanguages: string[] = []) {
  const { updateRow, settings } = useEcho.getState();
  const row = useEcho.getState().rows.find((r) => r.seq === seq);
  if (!row?.original) return;
  const useModel = model ?? settings.translateModel;

  try {
    const body: TranslateRequest = {
      text: row.original,
      sttLanguages,
      langHint: row.langHint,
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

    const text: Row["text"] = { ko: res.ko, en: res.en, zh: res.zh };
    // 원문 칸은 LLM 이 다듬지 않게 전사 원문 그대로
    if (res.source !== "other") text[res.source] = row.original;
    updateRow(seq, { status: "done", source: res.source, text, trMs: res.ms, model: useModel, refining: false });
  } catch (err) {
    updateRow(seq, { status: "error", error: (err as Error).message, refining: false });
  }
}

function guessLang(detected: string[], hint: Lang | null): Lang | "other" | undefined {
  if (hint) return hint;
  const first = detected.find((c) => LANGS.includes(c as Lang));
  return (first as Lang | undefined) ?? (detected.length ? "other" : undefined);
}

// 번역 맥락: 이 줄 앞의 완료된 발화 5개
function contextBefore(seq: number): ContextItem[] {
  return useEcho
    .getState()
    .rows.filter((r) => r.seq < seq && r.status === "done" && r.source)
    .slice(-5)
    .map((r) => ({
      source: r.source!,
      speaker: speakerName(useEcho.getState().settings, r.speaker) ?? undefined,
      ko: r.text.ko,
      en: r.text.en,
      zh: r.text.zh,
    }));
}

// 전사 힌트: 직전 발화 원문
function previousOriginal(seq: number): string | undefined {
  return useEcho
    .getState()
    .rows.filter((r) => r.seq < seq && r.original && r.status !== "filler")
    .at(-1)?.original;
}
