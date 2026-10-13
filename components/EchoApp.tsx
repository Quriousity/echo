"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { nextSeq, useEcho } from "@/lib/store";
import { submitSegment } from "@/lib/pipeline";
import { download, toMarkdown, toSrt, toText } from "@/lib/export";
import { LANG_LABEL, type Lang } from "@/lib/types";
import { SPEAKER_KEYS, speakerName } from "@/lib/settings";
import TriColumn from "./TriColumn";
import { LANG_THEME } from "./langTheme";
import SettingsPanel from "./SettingsPanel";

// 마이크·VAD 는 브라우저에서만 동작
const Recorder = dynamic(() => import("./Recorder"), {
  ssr: false,
  loading: () => <span className="text-sm text-neutral-400">Preparing mic…</span>,
});

const HINTS: { key: string; value: Lang | null; label: string }[] = [
  { key: "0", value: null, label: "Auto" },
  { key: "1", value: "ko", label: "KO" },
  { key: "2", value: "en", label: "EN" },
  { key: "3", value: "zh", label: "ZH" },
];

export default function EchoApp() {
  const hydrate = useEcho((s) => s.hydrate);
  const hydrated = useEcho((s) => s.hydrated);
  const settings = useEcho((s) => s.settings);
  const setSettings = useEcho((s) => s.setSettings);
  const langHint = useEcho((s) => s.langHint);
  const setLangHint = useEcho((s) => s.setLangHint);
  const speaker = useEcho((s) => s.speaker);
  const setSpeaker = useEcho((s) => s.setSpeaker);
  const hasKey = useEcho((s) => s.hasKey);
  const setHasKey = useEcho((s) => s.setHasKey);
  const rows = useEcho((s) => s.rows);
  const session = useEcho((s) => s.session);
  const newSession = useEcho((s) => s.newSession);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void hydrate();
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { hasKey: boolean }) => setHasKey(d.hasKey))
      .catch(() => setHasKey(false));
  }, [hydrate, setHasKey]);

  // 개발 모드 전용: 마이크 없이 WAV 파일로 전체 흐름을 시험 — 브라우저 콘솔에서 __echoTest("/파일.wav")
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __echoTest: (url: string) => Promise<void> }).__echoTest = async (url) => {
      const wav = await (await fetch(url)).blob();
      const durationMs = Math.round(((wav.size - 44) / 32000) * 1000); // 16kHz 16bit 모노 기준
      submitSegment(
        { seq: nextSeq(), startedAt: Date.now() - durationMs, durationMs, forcedSplit: false, langHint: useEcho.getState().langHint, speaker: useEcho.getState().speaker, status: "transcribing", text: {} },
        wav,
      );
    };
  }, []);

  // 개발 모드 전용: API 호출 없이 화면 모양 확인용 예시 줄 — 콘솔에서 __echoDemo()
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __echoDemo: () => void }).__echoDemo = () => {
      const { addRow } = useEcho.getState();
      const t = Date.now();
      const base = { durationMs: 3000, forcedSplit: false, langHint: null, model: "gpt-6-luna" as const, sttMs: 900, trMs: 1800 };
      addRow({ ...base, speaker: 0, seq: nextSeq(), startedAt: t - 9000, status: "done", source: "ko", original: "이번 분기 납품 일정은 다음 주 금요일까지 맞출 수 있을 것 같습니다.", text: { ko: "이번 분기 납품 일정은 다음 주 금요일까지 맞출 수 있을 것 같습니다.", en: "I think we can meet this quarter's delivery schedule by next Friday.", zh: "我认为本季度的交货安排可以在下周五之前完成。" } });
      addRow({ ...base, speaker: 1, seq: nextSeq(), startedAt: t - 6000, status: "filler", source: "en", original: "Uh-huh.", text: {} });
      addRow({ ...base, speaker: 1, seq: nextSeq(), startedAt: t - 5000, status: "done", source: "en", original: "Could you also send the updated price list by Wednesday?", text: { ko: "수요일까지 업데이트된 가격표도 보내 주실 수 있을까요?", en: "Could you also send the updated price list by Wednesday?", zh: "您能在周三之前把更新后的价目表也发给我们吗？" } });
      addRow({ ...base, speaker: 2, seq: nextSeq(), startedAt: t - 2000, status: "done", source: "zh", original: "这个价格可以再便宜一点吗？", text: { ko: "이 가격을 조금 더 낮출 수 있을까요?", en: "Could the price be a little lower?", zh: "这个价格可以再便宜一点吗？" } });
      addRow({ ...base, seq: nextSeq(), startedAt: t - 500, status: "translating", source: "ko", original: "그건 내부적으로 검토해 보겠습니다.", text: { ko: "그건 내부적으로 검토해 보겠습니다." } });
    };
  }, []);

  // 단축키 0~3 = 언어 지정, Q W E R = 화자 지정 (같은 키 다시 = 해제). 입력창에 쓰는 중이면 무시
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const h = HINTS.find((x) => x.key === e.key);
      if (h) setLangHint(h.value);
      const sp = SPEAKER_KEYS.indexOf(e.key.toUpperCase() as (typeof SPEAKER_KEYS)[number]);
      if (sp >= 0) setSpeaker(useEcho.getState().speaker === sp ? null : sp);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setLangHint, setSpeaker]);

  const lineCount = rows.filter((r) => r.original && r.status !== "filler").length;

  // 최근 20줄 평균 지연 (전사 + 번역)
  const latency = useMemo(() => {
    const done = rows.filter((r) => r.status === "done" && r.sttMs !== undefined && r.trMs !== undefined).slice(-20);
    if (!done.length) return null;
    return done.reduce((n, r) => n + r.sttMs! + r.trMs!, 0) / done.length / 1000;
  }, [rows]);

  const stamp = new Date(session.startedAt).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const exportAs = (kind: "md" | "txt" | "srt") => {
    const content =
      kind === "md"
        ? toMarkdown(rows, session.startedAt, settings)
        : kind === "txt"
          ? toText(rows, session.startedAt, settings)
          : toSrt(rows, session.startedAt, settings);
    download(`ECHO-${stamp}.${kind}`, content, kind === "md" ? "text/markdown" : "text/plain");
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-3">
        <span className="text-lg font-bold tracking-tight">ECHO</span>

        {/* VAD 설정이 바뀌면 다시 만든다 */}
        {hydrated && <Recorder key={JSON.stringify(settings.vad)} vad={settings.vad} />}

        <div className="flex overflow-hidden rounded-full border border-neutral-300 text-sm dark:border-neutral-700" title="Shortcuts: 0 1 2 3">
          {HINTS.map((h) => (
            <button
              key={h.key}
              type="button"
              onClick={() => setLangHint(h.value)}
              className={`px-3 py-1.5 ${
                langHint === h.value ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-full border border-neutral-300 text-sm dark:border-neutral-700" title="Speaker: Q W E R (press again to clear)">
          {SPEAKER_KEYS.map((k, i) => (
            <button
              key={k}
              type="button"
              onClick={() => setSpeaker(speaker === i ? null : i)}
              className={`max-w-36 truncate px-3 py-1.5 ${
                speaker === i ? "bg-amber-400 text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {settings.speakers[i]?.trim() ? `${k} · ${settings.speakers[i].trim()}` : k}
            </button>
          ))}
        </div>
        {speaker !== null && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            Speaking: {speakerName(settings, speaker)}
          </span>
        )}

        {langHint && (
          <span className={`rounded-full px-3 py-1 text-xs ring-1 ${LANG_THEME[langHint].chip}`}>Next utterances fixed to {LANG_LABEL[langHint]}</span>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm">
          {latency !== null && <span className="text-neutral-500">avg {latency.toFixed(1)}s</span>}
          <span className="text-neutral-400">{lineCount} {lineCount === 1 ? "line" : "lines"}</span>

          <div className="flex items-center overflow-hidden rounded-full border border-neutral-300 dark:border-neutral-700">
            <button
              type="button"
              title="Smaller text"
              className="px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => setSettings({ fontSize: Math.max(14, settings.fontSize - 2) })}
            >
              A−
            </button>
            <button
              type="button"
              title="Larger text"
              className="px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => setSettings({ fontSize: Math.min(40, settings.fontSize + 2) })}
            >
              A+
            </button>
          </div>

          <div className="flex items-center overflow-hidden rounded-full border border-neutral-300 dark:border-neutral-700">
            <span className="pl-3 pr-1 text-neutral-400">Export</span>
            {(["md", "txt", "srt"] as const).map((k) => (
              <button
                key={k}
                type="button"
                disabled={!rows.length}
                onClick={() => exportAs(k)}
                className="px-2.5 py-1.5 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
              >
                {k}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              if (rows.length && confirm("Start a new session? The current one stays saved in this browser.")) newSession();
            }}
            className="rounded-full border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            New session
          </button>
          <button type="button" onClick={() => setShowSettings(true)} className="rounded-full border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            ⚙ Settings
          </button>
        </div>
      </header>

      {hasKey === false && (
        <div className="mx-3 mt-3 rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
          No OpenAI API key. Put <code>OPENAI_API_KEY=...</code> in <code>echo/.env.local</code> and restart the server.
        </div>
      )}

      <TriColumn />

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
