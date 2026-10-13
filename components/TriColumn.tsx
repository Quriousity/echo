"use client";

import { useEffect, useRef, useState } from "react";
import { useEcho } from "@/lib/store";
import { canRetry, refine, retry } from "@/lib/pipeline";
import { LANGS, LANG_LABEL, type Lang, type Row } from "@/lib/types";
import { LANG_THEME, PLAIN_CARD } from "./langTheme";
import { speakerName } from "@/lib/settings";

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function TriColumn() {
  const rows = useEcho((s) => s.rows);
  const sessionStart = useEcho((s) => s.session.startedAt);
  const fontSize = useEcho((s) => s.settings.fontSize);

  const scroller = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true); // 맨 아래를 보고 있으면 새 줄을 따라 내려간다

  useEffect(() => {
    if (stick) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [rows, stick]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-3 gap-2 px-3 pb-2 pt-3">
        {LANGS.map((l) => (
          <div key={l}>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ring-1 ${LANG_THEME[l].chip}`}>
              <span className={`h-2 w-2 rounded-full ${LANG_THEME[l].dot}`} />
              {LANG_LABEL[l]}
            </span>
          </div>
        ))}
      </div>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto pb-6" style={{ fontSize }}>
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-base text-neutral-400">
            Press Start recording (Space) and speak — lines stack up here in all three languages.
          </div>
        ) : (
          rows.map((row) => <RowView key={row.seq} row={row} offset={row.startedAt - sessionStart} />)
        )}
      </div>

      {!stick && (
        <button
          type="button"
          onClick={() => setStick(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white shadow-lg dark:bg-white dark:text-neutral-900"
        >
          ↓ Latest
        </button>
      )}
    </div>
  );
}

function RowView({ row, offset }: { row: Row; offset: number }) {
  if (row.status === "filler") {
    return (
      <div className="px-3 py-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-0.5 text-xs text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
          {row.source && row.source !== "other" && <span className={`h-1.5 w-1.5 rounded-full ${LANG_THEME[row.source].dot}`} />}
          {clock(offset)} · <SpeakerLabel row={row} />
          {row.original}
        </span>
      </div>
    );
  }

  if (row.status === "empty") {
    return (
      <div className="px-3 py-1">
        <span className="inline-flex rounded-full bg-neutral-100 px-3 py-0.5 text-xs text-neutral-400 dark:bg-neutral-900">
          {clock(offset)} · no speech recognized
        </span>
      </div>
    );
  }

  return (
    <div className="group relative grid grid-cols-3 gap-2 px-3 py-1">
      {LANGS.map((l) => (
        <Cell key={l} lang={l} row={row} offset={offset} />
      ))}
      {row.status === "error" && <ErrorBox row={row} />}

      {/* 줄 오른쪽 위: 상태·지연시간·버튼 */}
      <div className="absolute right-5 top-2.5 flex items-center gap-2 text-[11px] text-neutral-400">
        {row.forcedSplit && <span title="Split at max length — continues on the next line">↪ continues</span>}
        {row.sttMs !== undefined && (
          <span className="hidden group-hover:inline">
            STT {(row.sttMs / 1000).toFixed(1)}s{row.trMs !== undefined && ` · translate ${(row.trMs / 1000).toFixed(1)}s`}
            {row.model && ` · ${row.model === "gpt-6-sol" ? "Sol" : "Luna"}`}
          </span>
        )}
        {row.status === "done" && row.model !== "gpt-6-sol" && !row.refining && (
          <button
            type="button"
            onClick={() => refine(row.seq)}
            className="hidden rounded-full bg-white px-2.5 py-0.5 text-neutral-600 ring-1 ring-neutral-300 hover:bg-neutral-100 group-hover:inline dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700"
          >
            Refine
          </button>
        )}
        {row.refining && <span className="text-blue-500">Refining…</span>}
      </div>
    </div>
  );
}

function Cell({ lang, row, offset }: { lang: Lang; row: Row; offset: number }) {
  const isSource = row.source === lang;
  const text = row.text[lang];

  let body: React.ReactNode;
  if (text) {
    body = <p className="whitespace-pre-wrap leading-snug">{text}</p>;
  } else if (row.status === "transcribing") {
    body = <p className="animate-pulse text-neutral-300 dark:text-neutral-600">Transcribing…</p>;
  } else if (row.status === "translating") {
    body = <p className="animate-pulse text-neutral-300 dark:text-neutral-600">{row.original && !row.source ? row.original : "Translating…"}</p>;
  } else {
    body = <p className="text-neutral-300">—</p>;
  }

  return (
    <div className={`rounded-2xl px-4 pb-3 pt-2.5 ${isSource ? LANG_THEME[lang].card : PLAIN_CARD}`}>
      <div className={`mb-1 flex h-4 items-center gap-1.5 text-[11px] font-medium ${isSource ? LANG_THEME[lang].tag : ""}`}>
        {isSource && (
          <span title="Original">
            🎤 {clock(offset)} <SpeakerLabel row={row} prefix=" · " />
          </span>
        )}
      </div>
      {body}
    </div>
  );
}

function SpeakerLabel({ row, prefix = "" }: { row: Row; prefix?: string }) {
  const settings = useEcho((s) => s.settings);
  const name = speakerName(settings, row.speaker);
  return name ? (
    <span>
      {prefix}
      {name}
      {prefix ? "" : " · "}
    </span>
  ) : null;
}

function ErrorBox({ row }: { row: Row }) {
  return (
    <div className="col-span-3 flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
      {!row.source && row.original && <p className="text-neutral-700 dark:text-neutral-300">{row.original}</p>}
      <p className="break-all">⚠ {row.error ?? "Error"}</p>
      {canRetry(row) && (
        <button
          type="button"
          onClick={() => retry(row.seq)}
          className="shrink-0 rounded-full bg-white px-3 py-0.5 text-xs ring-1 ring-red-300 hover:bg-red-100 dark:bg-transparent dark:ring-red-700 dark:hover:bg-red-950"
        >
          Retry
        </button>
      )}
    </div>
  );
}
