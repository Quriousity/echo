"use client";

import { useEffect, useRef } from "react";
import { utils } from "@ricky0123/vad-web";
import { useVad } from "@/lib/useVad";
import { useEcho, nextSeq } from "@/lib/store";
import { submitSegment } from "@/lib/pipeline";
import type { VadSettings } from "@/lib/types";

const SAMPLE_RATE = 16000; // vad-web 가 넘겨주는 오디오는 16kHz 모노

// VAD 설정이 바뀌면 부모가 key 로 이 컴포넌트를 다시 만든다 (옵션은 생성 시점에만 반영되므로)
export default function Recorder({ vad: cfg }: { vad: VadSettings }) {
  const speechStart = useRef<number | null>(null);
  const forced = useRef(false);
  // 화자를 바꿔서 끊은 조각은 "바꾸기 전" 화자로 붙인다 (undefined = 해당 없음)
  const cutSpeaker = useRef<number | null | undefined>(undefined);
  const setListening = useEcho((s) => s.setListening);

  const vad = useVad(cfg, {
    onSpeechStart: () => {
      speechStart.current = Date.now();
    },
    onVADMisfire: () => {
      speechStart.current = null;
      forced.current = false;
      cutSpeaker.current = undefined;
    },
    onSpeechEnd: (audio: Float32Array) => {
      const durationMs = Math.round((audio.length / SAMPLE_RATE) * 1000);
      const wav = new Blob([utils.encodeWAV(audio)], { type: "audio/wav" });
      submitSegment(
        {
          seq: nextSeq(),
          startedAt: Date.now() - durationMs,
          durationMs,
          forcedSplit: forced.current,
          langHint: useEcho.getState().langHint,
          speaker: cutSpeaker.current !== undefined ? cutSpeaker.current : useEcho.getState().speaker,
          status: "transcribing",
          text: {},
        },
        wav,
      );
      speechStart.current = null;
      forced.current = false;
      cutSpeaker.current = undefined;
    },
  });

  const { listening, pause, start, toggle } = vad;

  useEffect(() => setListening(listening), [listening, setListening]);

  // 최대 길이(기본 15초) 넘게 이어서 말하면 강제로 끊어 보낸다: pause() → start()
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(async () => {
      if (speechStart.current && Date.now() - speechStart.current > cfg.maxSegmentSec * 1000 && !forced.current) {
        forced.current = true;
        await pause();
        await start();
      }
    }, 300);
    return () => clearInterval(id);
  }, [listening, pause, start, cfg.maxSegmentSec]);

  // 화자 키(Q W E R)를 바꾸면, 말하던 중이던 구간을 그 자리에서 끊어 이전 화자로 보내고 새 화자로 넘어간다
  useEffect(() => {
    if (!listening) return;
    return useEcho.subscribe((state, prev) => {
      if (state.speaker === prev.speaker || !speechStart.current) return;
      cutSpeaker.current = prev.speaker;
      void (async () => {
        await pause();
        await start();
      })();
    });
  }, [listening, pause, start]);

  // 녹음 중에는 화면이 꺼지지 않게
  useEffect(() => {
    if (!listening || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release();
  }, [listening]);

  // 스페이스바 = 녹음 시작/정지 (입력창에 쓰는 중이면 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof Element && e.target.closest("input, textarea, select, button");
      if (e.code !== "Space" || inField) return;
      e.preventDefault();
      void toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  if (vad.errored) {
    return (
      <span className="rounded-full bg-red-100 px-3 py-1.5 text-sm text-red-700 dark:bg-red-500/20 dark:text-red-300">
        Mic/VAD error: {vad.errored}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={vad.loading}
      title="Space bar"
      className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
        listening
          ? "bg-red-600 text-white hover:bg-red-700"
          : "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${listening ? (vad.userSpeaking ? "animate-ping bg-white" : "bg-white") : "bg-red-500"}`}
      />
      {vad.loading ? "Loading…" : listening ? (vad.userSpeaking ? "Hearing speech" : "Recording · Stop") : "Start recording"}
    </button>
  );
}
