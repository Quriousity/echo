"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEcho } from "@/lib/store";
import { submitVoice } from "@/lib/pipeline";

// 브라우저마다 녹음되는 형식이 달라서 (Safari 는 mp4) 되는 것 중 첫 번째를 쓴다
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const MIN_MS = 300; // 이보다 짧으면 잘못 누른 것으로 보고 버린다

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// 누르면 녹음 시작, 다시 누르면 끝 → 그 사이가 한 묶음으로 전사·번역된다. 단축키: 스페이스바 (입력창 밖에서)
export default function Recorder({ disabled }: { disabled: boolean }) {
  const recorder = useRef<MediaRecorder | null>(null);
  const starting = useRef(false);
  const [elapsed, setElapsed] = useState<number | null>(null); // null = 녹음 안 하는 중
  const [error, setError] = useState<string | null>(null);
  const setListening = useEcho((s) => s.setListening);

  const start = useCallback(async () => {
    if (recorder.current || starting.current) return;
    starting.current = true;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      const begin = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); // 마이크 표시등 끄기
        const durationMs = Date.now() - begin;
        if (durationMs >= MIN_MS && chunks.length) submitVoice(new Blob(chunks, { type: rec.mimeType }), durationMs);
      };
      rec.start();
      recorder.current = rec;
      setElapsed(0);
      setListening(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      starting.current = false;
    }
  }, [setListening]);

  const stop = useCallback(() => {
    recorder.current?.stop();
    recorder.current = null;
    setElapsed(null);
    setListening(false);
  }, [setListening]);

  const toggle = useCallback(() => (recorder.current ? stop() : void start()), [start, stop]);

  const recording = elapsed !== null;

  // 녹음 시간 표시
  useEffect(() => {
    if (!recording) return;
    const begin = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - begin), 250);
    return () => clearInterval(id);
  }, [recording]);

  // 화면을 떠나면 녹음 정리
  useEffect(() => () => recorder.current?.stop(), []);

  // 녹음 중에는 화면이 꺼지지 않게
  useEffect(() => {
    if (!recording || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release();
  }, [recording]);

  // 스페이스바 = 녹음 시작/끝 (입력창에 쓰는 중이면 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof Element && e.target.closest("input, textarea, select, button");
      if (e.code !== "Space" || inField || e.repeat) return;
      e.preventDefault();
      if (!disabled || recorder.current) toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, disabled]);

  return (
    <div className="flex shrink-0 items-center gap-2">
      {error && <span className="max-w-48 truncate text-xs text-danger" title={error}>Mic: {error}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled && !recording}
        title="Start / end a voice chunk (Space)"
        className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors disabled:opacity-40 ${
          recording ? "bg-danger text-white hover:opacity-90" : "bg-fg text-bg hover:opacity-85"
        }`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${recording ? "animate-pulse bg-white" : "bg-danger"}`} />
        {recording ? `End · ${clock(elapsed)}` : "Speak"}
      </button>
    </div>
  );
}
