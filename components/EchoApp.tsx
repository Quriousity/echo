"use client";

import { useEffect, useMemo, useState } from "react";
import { nextSeq, useEcho } from "@/lib/store";
import { submitVoice } from "@/lib/pipeline";
import { download, toMarkdown, toSrt, toText } from "@/lib/export";
import LangColumns from "./LangColumns";
import Composer from "./Composer";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { PILL, SEGMENT, SEGMENT_OFF } from "./langTheme";
import SettingsPanel from "./SettingsPanel";

export default function EchoApp() {
  const hydrate = useEcho((s) => s.hydrate);
  const settings = useEcho((s) => s.settings);
  const setSettings = useEcho((s) => s.setSettings);
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

  // 개발 모드 전용: 마이크 없이 오디오 파일로 전체 흐름을 시험 — 브라우저 콘솔에서 __echoTest("/파일.wav")
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __echoTest: (url: string) => Promise<void> }).__echoTest = async (url) => {
      const blob = await (await fetch(url)).blob();
      submitVoice(blob, Math.round(((blob.size - 44) / 32000) * 1000)); // 길이는 16kHz 16bit 모노 WAV 기준 추정
    };
  }, []);

  // 개발 모드 전용: API 호출 없이 화면 모양 확인용 예시 줄 — 콘솔에서 __echoDemo()
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __echoDemo: () => void }).__echoDemo = () => {
      const { addRow } = useEcho.getState();
      const t = Date.now();
      const base = { durationMs: 3000, langHint: null, model: "gpt-6-luna" as const, sttMs: 900, trMs: 1800 };
      addRow({ ...base, input: "voice", seq: nextSeq(), startedAt: t - 9000, status: "done", source: "ko", original: "이번 분기 납품 일정은 다음 주 금요일까지 맞출 수 있을 것 같습니다.", text: { ko: "이번 분기 납품 일정은 다음 주 금요일까지 맞출 수 있을 것 같습니다.", en: "I think we can meet this quarter's delivery schedule by next Friday.", zh: "我认为本季度的交货安排可以在下周五之前完成。", ja: "今期の納品スケジュールは来週の金曜日までに間に合わせられると思います。" } });
      addRow({ ...base, input: "voice", seq: nextSeq(), startedAt: t - 6000, status: "filler", source: "en", original: "Uh-huh.", text: {} });
      addRow({ ...base, input: "text", sttMs: undefined, durationMs: 0, seq: nextSeq(), startedAt: t - 5000, status: "done", source: "en", original: "Could you also send the updated price list by Wednesday?", text: { ko: "수요일까지 업데이트된 가격표도 보내 주실 수 있을까요?", en: "Could you also send the updated price list by Wednesday?", zh: "您能在周三之前把更新后的价目表也发给我们吗？", ja: "水曜日までに更新した価格表も送っていただけますか？" } });
      addRow({ ...base, input: "voice", seq: nextSeq(), startedAt: t - 2000, status: "done", source: "ja", original: "この価格はもう少し下げられますか？", text: { ko: "이 가격을 조금 더 낮출 수 있을까요?", en: "Could the price be a little lower?", zh: "这个价格可以再便宜一点吗？", ja: "この価格はもう少し下げられますか？" } });
      addRow({ ...base, input: "voice", seq: nextSeq(), startedAt: t - 500, status: "translating", source: "ko", original: "그건 내부적으로 검토해 보겠습니다.", text: { ko: "그건 내부적으로 검토해 보겠습니다." } });
    };
  }, []);

  const lineCount = rows.filter((r) => r.original && r.status !== "filler").length;

  // 최근 20줄 평균 지연 (전사 + 번역, 입력한 문장은 번역만)
  const latency = useMemo(() => {
    const done = rows.filter((r) => r.status === "done" && r.trMs !== undefined).slice(-20);
    if (!done.length) return null;
    return done.reduce((n, r) => n + (r.sttMs ?? 0) + r.trMs!, 0) / done.length / 1000;
  }, [rows]);

  const stamp = new Date(session.startedAt).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const exportAs = (kind: "md" | "txt" | "srt") => {
    const content = kind === "md" ? toMarkdown(rows, session.startedAt) : kind === "txt" ? toText(rows, session.startedAt) : toSrt(rows, session.startedAt);
    download(`ECHO-${stamp}.${kind}`, content, kind === "md" ? "text/markdown" : "text/plain");
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2">
          <Logo />
          <span className="text-lg font-bold tracking-tight">ECHO</span>
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {latency !== null && <span className="text-muted">avg {latency.toFixed(1)}s</span>}
          <span className="text-faint">
            {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>

          <div className={SEGMENT}>
            <button type="button" title="Smaller text" className={`px-3 py-1.5 ${SEGMENT_OFF}`} onClick={() => setSettings({ fontSize: Math.max(14, settings.fontSize - 2) })}>
              A−
            </button>
            <button type="button" title="Larger text" className={`px-3 py-1.5 ${SEGMENT_OFF}`} onClick={() => setSettings({ fontSize: Math.min(40, settings.fontSize + 2) })}>
              A+
            </button>
          </div>

          <div className={`${SEGMENT} items-center`}>
            <span className="pl-3 pr-1 text-faint">Export</span>
            {(["md", "txt", "srt"] as const).map((k) => (
              <button key={k} type="button" disabled={!rows.length} onClick={() => exportAs(k)} className={`px-2.5 py-1.5 disabled:opacity-40 ${SEGMENT_OFF}`}>
                {k}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              if (rows.length && confirm("Start a new session? The current one stays saved in this browser.")) newSession();
            }}
            className={PILL}
          >
            New session
          </button>
          <ThemeToggle />
          <button type="button" onClick={() => setShowSettings(true)} className={PILL}>
            ⚙ Settings
          </button>
        </div>
      </header>

      {hasKey === false && (
        <div className="mx-3 mt-3 rounded-2xl bg-danger/10 px-4 py-2 text-sm text-danger">
          No OpenAI API key. Put <code>OPENAI_API_KEY=...</code> in <code>echo/.env.local</code> and restart the server.
        </div>
      )}

      <LangColumns />
      <Composer />

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
