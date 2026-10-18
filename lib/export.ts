"use client";

import { LANGS, LANG_LABEL, type Row } from "./types";

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

// 기록에 실제로 들어 있는 언어만 칸으로
const langsIn = (rows: Row[]) => LANGS.filter((l) => rows.some((r) => r.text[l]));

export function toMarkdown(rows: Row[], startedAt: number): string {
  const esc = (s = "") => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const list = usable(rows);
  const langs = langsIn(list);
  const head = [
    `# ECHO transcript — ${new Date(startedAt).toLocaleString("en-US")}`,
    "",
    `| Time | ${langs.map((l) => LANG_LABEL[l]).join(" | ")} |`,
    `|---|${langs.map(() => "---|").join("")}`,
  ];
  const body = list.map(
    (r) => `| ${clock(r.startedAt - startedAt)} | ${langs.map((l) => (r.source === l ? `🎤 ${esc(r.text[l])}` : esc(r.text[l]))).join(" | ")} |`,
  );
  return [...head, ...body, ""].join("\n");
}

export function toText(rows: Row[], startedAt: number): string {
  const list = usable(rows);
  const langs = langsIn(list);
  return list
    .map((r) => [`[${clock(r.startedAt - startedAt)}] (${r.source ?? "?"})`, ...langs.map((l) => `  ${l}: ${r.text[l] ?? ""}`)].join("\n"))
    .join("\n\n");
}

// 자막 파일: 원문 + 다른 언어들. 입력한 문장은 길이가 없으므로 2초로 둔다
export function toSrt(rows: Row[], startedAt: number): string {
  const list = usable(rows);
  const langs = langsIn(list);
  return list
    .map((r, i) => {
      const start = r.startedAt - startedAt;
      const lines = [r.original!, ...langs.filter((l) => l !== r.source).map((l) => r.text[l] ?? "")].filter(Boolean);
      return `${i + 1}\n${srtTime(start)} --> ${srtTime(start + Math.max(r.durationMs, 2000))}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

export function download(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
