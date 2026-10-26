"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useEcho } from "@/lib/store";
import { submitText } from "@/lib/pipeline";
import { LANG_LABEL, type Lang } from "@/lib/types";
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON } from "./langTheme";

// 마이크는 브라우저에서만 동작
const Recorder = dynamic(() => import("./Recorder"), { ssr: false });
const LiveRecorder = dynamic(() => import("./LiveRecorder"), { ssr: false });

const HINTS: { key: string; value: Lang | null; label: string }[] = [
  { key: "0", value: null, label: "Auto" },
  { key: "1", value: "ko", label: "KO" },
  { key: "2", value: "en", label: "EN" },
  { key: "3", value: "zh", label: "ZH" },
  { key: "4", value: "ja", label: "JA" },
];

// 화면 하단 입력바: 원문 언어 선택 + 문장 입력 + 녹음. 입력한 문장 하나, 녹음 시작~끝 하나가 각각 한 묶음(한 줄)이다.
// 실시간 모드에서는 녹음 버튼 대신 듣기 버튼 — 말이 멈출 때마다 한 묶음.
export default function Composer() {
  const langHint = useEcho((s) => s.langHint);
  const setLangHint = useEcho((s) => s.setLangHint);
  const noColumns = useEcho((s) => s.settings.columns.length === 0);
  const live = useEcho((s) => s.settings.mode === "live");
  const [draft, setDraft] = useState("");

  // 단축키 0~4 = 원문 언어 지정 (입력창에 쓰는 중이면 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const h = HINTS.find((x) => x.key === e.key);
      if (h) setLangHint(h.value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setLangHint]);

  const send = () => {
    const text = draft.trim();
    if (!text || noColumns) return;
    submitText(text);
    setDraft("");
  };

  return (
    <footer className="border-t border-line bg-bg px-3 pb-3 pt-2.5">
      <div className="flex items-end gap-2">
        <div className={`${SEGMENT} h-10 shrink-0`} title="Source language · shortcuts 0–4">
          {HINTS.map((h) => (
            <button
              key={h.key}
              type="button"
              onClick={() => setLangHint(h.value)}
              title={h.value ? `Treat input as ${LANG_LABEL[h.value]}` : "Detect the language"}
              className={`px-3 ${langHint === h.value ? SEGMENT_ON : SEGMENT_OFF}`}
            >
              {h.label}
            </button>
          ))}
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // 한글·일본어 입력기 조합 중의 Enter 는 글자 확정이므로 보내지 않는다
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              send();
            }
            if (e.key === "Escape") e.currentTarget.blur();
          }}
          rows={1}
          disabled={noColumns}
          placeholder={noColumns ? "Pick the languages to show first" : "Type a sentence and press Enter · Shift+Enter for a new line"}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-line bg-panel px-4 py-2 text-base leading-6 placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-50 [field-sizing:content]"
        />

        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || noColumns}
          className="h-10 shrink-0 rounded-full border border-line px-4 text-sm font-medium hover:bg-hover disabled:opacity-40"
        >
          Send
        </button>
        {live ? <LiveRecorder disabled={noColumns} /> : <Recorder disabled={noColumns} />}
      </div>
    </footer>
  );
}
