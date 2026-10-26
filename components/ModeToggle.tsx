"use client";

import { useEcho } from "@/lib/store";
import { PILL } from "./langTheme";

// 입력 방식 전환: 직접 끊기(녹음 시작~끝이 한 줄) ↔ 실시간(말이 멈출 때마다 알아서 한 줄). 녹음·듣는 중에는 못 바꾼다
export default function ModeToggle() {
  const mode = useEcho((s) => s.settings.mode);
  const setSettings = useEcho((s) => s.setSettings);
  const listening = useEcho((s) => s.listening);

  return (
    <button
      type="button"
      disabled={listening}
      onClick={() => setSettings({ mode: mode === "live" ? "chunk" : "live" })}
      title={listening ? "Stop the microphone to switch modes" : "Input: manual chunks ↔ live (auto-split on pauses)"}
      className={`${PILL} w-[5.5rem]`}
    >
      {mode === "live" ? "⚡ Live" : "✋ Manual"}
    </button>
  );
}
