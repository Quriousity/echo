"use client";

import { LANGS, LANG_LABEL, type Row, type Settings } from "./types";
import { speakerName } from "./settings";

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const srtTime = (ms: number) => {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor((ms % 3_600_000) / 60_000))}:${pad(Math.floor((ms % 60_000) / 1000))},${pad(Math.floor(ms % 1000), 3)}`;
};

// 추임새 줄은 기록에서 뺀다
const usable = (rows: Row[]) => rows.filter((r) => r.original && r.status !== "filler");

const who = (r: Row, s: Settings) => {
  const n = speakerName(s, r.speaker);
  return n ? `${n}: ` : "";
};

export function toMarkdown(rows: Row[], startedAt: number, settings: Settings): string {
  const esc = (s = "") => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const head = [
    `# ECHO transcript — ${new Date(startedAt).toLocaleString("en-US")}`,
    "",
    `| Time | Speaker | ${LANGS.map((l) => LANG_LABEL[l]).join(" | ")} |`,
    "|---|---|---|---|---|",
  ];
  const body = usable(rows).map(
    (r) => `| ${clock(r.startedAt - startedAt)} | ${esc(speakerName(settings, r.speaker) ?? "")} | ${LANGS.map((l) => (r.source === l ? `🎤 ${esc(r.text[l])}` : esc(r.text[l]))).join(" | ")} |`,
  );
  return [...head, ...body, ""].join("\n");
}

export function toText(rows: Row[], startedAt: number, settings: Settings): string {
  return usable(rows)
    .map((r) => [`[${clock(r.startedAt - startedAt)}] ${who(r, settings)}(${r.source ?? "?"})`, ...LANGS.map((l) => `  ${l}: ${r.text[l] ?? ""}`)].join("\n"))
    .join("\n\n");
}

// 자막 파일: 원문 + 다른 두 언어
export function toSrt(rows: Row[], startedAt: number, settings: Settings): string {
  return usable(rows)
    .map((r, i) => {
      const start = r.startedAt - startedAt;
      const lines = [who(r, settings) + r.original!, ...LANGS.filter((l) => l !== r.source).map((l) => r.text[l] ?? "")].filter(Boolean);
      return `${i + 1}\n${srtTime(start)} --> ${srtTime(start + r.durationMs)}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

export function download(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
