"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import type { VadSettings } from "./types";

type Callbacks = {
  onSpeechStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
  onVADMisfire: () => void;
};

// @ricky0123/vad-react 의 useMicVAD 대신 쓰는 얇은 훅.
// 그 훅은 "한 번도 시작하지 않은 VAD" 를 정리할 때 destroy() 가 오류를 던져
// 설정 변경·화면 갱신마다 오류가 남는다. 여기서는 정리 실패를 조용히 삼킨다.
export function useVad(cfg: VadSettings, callbacks: Callbacks) {
  const vadRef = useRef<MicVAD | null>(null);
  const cb = useRef(callbacks);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);

  useEffect(() => {
    cb.current = callbacks;
  });

  useEffect(() => {
    let cancelled = false;
    let instance: MicVAD | null = null;

    MicVAD.new({
      model: "v5",
      baseAssetPath: "/vad/",
      onnxWASMBasePath: "/vad/",
      startOnLoad: false,
      submitUserSpeechOnPause: true, // pause() 하면 말하던 구간을 onSpeechEnd 로 넘겨준다 (최대 길이 강제 자르기용)
      positiveSpeechThreshold: cfg.positiveSpeechThreshold,
      negativeSpeechThreshold: cfg.negativeSpeechThreshold,
      redemptionMs: cfg.redemptionMs,
      preSpeechPadMs: cfg.preSpeechPadMs,
      minSpeechMs: cfg.minSpeechMs,
      onFrameProcessed: (probs) => {
        const speaking = probs.isSpeech > cfg.positiveSpeechThreshold;
        setUserSpeaking((prev) => (prev === speaking ? prev : speaking));
      },
      onSpeechStart: () => cb.current.onSpeechStart(),
      onSpeechEnd: (audio) => cb.current.onSpeechEnd(audio),
      onVADMisfire: () => cb.current.onVADMisfire(),
    })
      .then((v) => {
        if (cancelled) {
          v.destroy().catch(() => {});
          return;
        }
        instance = v;
        vadRef.current = v;
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErrored(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      vadRef.current = null;
      instance?.destroy().catch(() => {});
    };
    // 설정이 바뀌면 부모가 key 로 다시 만들므로 cfg 변경은 여기서 추적하지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    const v = vadRef.current;
    if (!v) return;
    try {
      await v.start();
      if (v.errored) throw new Error(v.errored);
      setListening(true);
    } catch (e) {
      setErrored(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const pause = useCallback(async () => {
    const v = vadRef.current;
    if (!v) return;
    await v.pause().catch(() => {});
    setListening(false);
    setUserSpeaking(false);
  }, []);

  const toggle = useCallback(async () => (listening ? pause() : start()), [listening, pause, start]);

  return { loading, errored, listening, userSpeaking, start, pause, toggle };
}
