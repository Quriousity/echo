"use client";

import { useEffect, useState } from "react";
import { useEcho } from "@/lib/store";
import { DEFAULT_SETTINGS, SPEAKER_KEYS } from "@/lib/settings";
import type { Effort, TranslateModel, VadSettings } from "@/lib/types";

const VAD_FIELDS: { key: keyof VadSettings; label: string; hint: string; min: number; max: number; step: number }[] = [
  { key: "redemptionMs", label: "Silence to split (ms)", hint: "Silence this long closes a line. Raise it if sentences get cut", min: 300, max: 2000, step: 50 },
  { key: "maxSegmentSec", label: "Max length (s)", hint: "Long nonstop speech is force-split at this length", min: 5, max: 30, step: 1 },
  { key: "positiveSpeechThreshold", label: "Speech start threshold", hint: "Raise it if background noise gets picked up", min: 0.1, max: 0.95, step: 0.05 },
  { key: "negativeSpeechThreshold", label: "Speech end threshold", hint: "Keep slightly below the start threshold", min: 0.05, max: 0.9, step: 0.05 },
  { key: "preSpeechPadMs", label: "Pre-speech padding (ms)", hint: "Raise it if the first syllable gets clipped", min: 0, max: 1000, step: 50 },
  { key: "minSpeechMs", label: "Min speech length (ms)", hint: "Shorter sounds (coughs, clicks) are dropped", min: 100, max: 1500, step: 50 },
];

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useEcho((s) => s.settings);
  const setSettings = useEcho((s) => s.setSettings);
  const listening = useEcho((s) => s.listening);
  const [vad, setVad] = useState(settings.vad);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const vadChanged = JSON.stringify(vad) !== JSON.stringify(settings.vad);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto rounded-l-3xl bg-white p-6 shadow-xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm text-neutral-500 ring-1 ring-neutral-300 hover:text-neutral-900 dark:ring-neutral-700 dark:hover:text-white">
            Close (Esc)
          </button>
        </div>

        <section className="mb-8 space-y-3">
          <h3 className="text-sm font-semibold text-neutral-500">Translation</h3>
          <label className="block text-sm">
            Model
            <select
              value={settings.translateModel}
              onChange={(e) => setSettings({ translateModel: e.target.value as TranslateModel })}
              className="mt-1 block w-full rounded-xl border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
            >
              <option value="gpt-6-luna">GPT-6 Luna — fast, cheap (default)</option>
              <option value="gpt-6-sol">GPT-6 Sol — higher quality, slower</option>
            </select>
          </label>
          <label className="block text-sm">
            Reasoning effort
            <select
              value={settings.effort}
              onChange={(e) => setSettings({ effort: e.target.value as Effort })}
              className="mt-1 block w-full rounded-xl border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
            >
              <option value="none">none — fastest (default)</option>
              <option value="low">low — a bit more careful</option>
              <option value="medium">medium — slow</option>
            </select>
          </label>
          <p className="text-xs text-neutral-500">The [Refine] button shown on row hover always re-translates with Sol.</p>
        </section>

        <section className="mb-8">
          <h3 className="mb-1 text-sm font-semibold text-neutral-500">Speakers</h3>
          <p className="mb-2 text-xs text-neutral-500">Press Q W E R while someone talks; press the same key again to clear.</p>
          <div className="grid grid-cols-2 gap-2">
            {SPEAKER_KEYS.map((k, i) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                  {k}
                </span>
                <input
                  value={settings.speakers[i] ?? ""}
                  onChange={(e) => setSettings({ speakers: settings.speakers.map((v, j) => (j === i ? e.target.value : v)) })}
                  placeholder={`Speaker ${k}`}
                  className="w-full rounded-xl border border-neutral-300 bg-transparent px-2 py-1.5 dark:border-neutral-700"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h3 className="mb-1 text-sm font-semibold text-neutral-500">Glossary</h3>
          <p className="mb-2 text-xs text-neutral-500">
            One entry per line: <code>Korean | English | Chinese</code>. Used as transcription hints and for consistent translations.
          </p>
          <textarea
            value={settings.glossary}
            onChange={(e) => setSettings({ glossary: e.target.value })}
            rows={6}
            placeholder={"에코 | Echo | 回声\n김민수 | Minsu Kim | 金敏洙"}
            className="w-full rounded-xl border border-neutral-300 bg-transparent p-2 font-mono text-sm dark:border-neutral-700"
          />
        </section>

        <section className="mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-500">Speech splitting (VAD)</h3>
          {VAD_FIELDS.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="flex justify-between">
                {f.label}
                <span className="font-mono">{vad[f.key]}</span>
              </span>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={vad[f.key]}
                onChange={(e) => setVad({ ...vad, [f.key]: Number(e.target.value) })}
                className="w-full"
              />
              <span className="text-xs text-neutral-500">{f.hint}</span>
            </label>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!vadChanged}
              onClick={() => setSettings({ vad })}
              className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
            >
              Apply{listening ? " (stops recording)" : ""}
            </button>
            <button
              type="button"
              onClick={() => setVad(DEFAULT_SETTINGS.vad)}
              className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm dark:border-neutral-700"
            >
              Defaults
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
