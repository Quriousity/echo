"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEcho } from "@/lib/store";
import { submitVoice } from "@/lib/pipeline";
import { startLive } from "@/lib/liveVad";
import { useSpaceKey } from "./useSpaceKey";

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// 실시간 모드: 누르면 듣기 시작, 다시 누르면 멈춤. 듣는 동안 말이 멈출 때마다 알아서 한 줄씩 전사·번역된다. 단축키: 스페이스바
export default function LiveRecorder({ disabled }: { disabled: boolean }) {
  const stopRef = useRef<(() => void) | null>(null);
  const starting = useRef(false);
  const [elapsed, setElapsed] = useState<number | null>(null); // null = 듣지 않는 중
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setListening = useEcho((s) => s.setListening);

  const start = useCallback(async () => {
    if (stopRef.current || starting.current) return;
    starting.current = true;
    setError(null);
    try {
      stopRef.current = await startLive({ onSegment: submitVoice, onSpeaking: setSpeaking });
      setElapsed(0);
      setListening(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      starting.current = false;
    }
  }, [setListening]);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setElapsed(null);
    setListening(false);
  }, [setListening]);

  const toggle = useCallback(() => (stopRef.current ? stop() : void start()), [start, stop]);

  const listening = elapsed !== null;

  // 듣는 시간 표시
  useEffect(() => {
    if (!listening) return;
    const begin = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - begin), 250);
    return () => clearInterval(id);
  }, [listening]);

  // 화면을 떠나면 정리
  useEffect(
    () => () => {
      stopRef.current?.();
      stopRef.current = null;
      useEcho.getState().setListening(false);
    },
    [],
  );

  // 듣는 중에는 화면이 꺼지지 않게
  useEffect(() => {
    if (!listening || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release();
  }, [listening]);

  // 스페이스바 = 듣기 시작/멈춤 (입력창에 쓰는 중이면 무시)
  useSpaceKey(() => {
    if (!disabled || stopRef.current) toggle();
  });

  return (
    <div className="flex shrink-0 items-center gap-2">
      {error && <span className="max-w-48 truncate text-xs text-danger" title={error}>Mic: {error}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled && !listening}
        title="Start / stop live interpreting — splits automatically when you pause (Space)"
        className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors disabled:opacity-40 ${
          listening ? "bg-danger text-white hover:opacity-90" : "bg-fg text-bg hover:opacity-85"
        }`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${listening ? (speaking ? "scale-125 bg-white" : "bg-white/50") : "bg-danger"} transition-transform`} />
        {listening ? `${speaking ? "Hearing" : "Listening"} · ${clock(elapsed)}` : "Go live"}
      </button>
    </div>
  );
}
