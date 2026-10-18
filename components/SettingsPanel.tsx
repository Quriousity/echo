"use client";

import { useEffect } from "react";
import { useEcho } from "@/lib/store";
import type { Effort, TranslateModel } from "@/lib/types";
import { PILL } from "./langTheme";

const FIELD = "mt-1 block w-full rounded-xl border border-line bg-panel px-2 py-1.5";

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useEcho((s) => s.settings);
  const setSettings = useEcho((s) => s.setSettings);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-md overflow-y-auto rounded-l-3xl border-l border-line bg-bg p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className={PILL}>
            Close (Esc)
          </button>
        </div>

        <section className="mb-8 space-y-3">
          <h3 className="text-sm font-semibold text-muted">Translation</h3>
          <label className="block text-sm">
            Model
            <select value={settings.translateModel} onChange={(e) => setSettings({ translateModel: e.target.value as TranslateModel })} className={FIELD}>
              <option value="gpt-6-luna">GPT-6 Luna — fast, cheap (default)</option>
              <option value="gpt-6-sol">GPT-6 Sol — higher quality, slower</option>
            </select>
          </label>
          <label className="block text-sm">
            Reasoning effort
            <select value={settings.effort} onChange={(e) => setSettings({ effort: e.target.value as Effort })} className={FIELD}>
              <option value="none">none — fastest (default)</option>
              <option value="low">low — a bit more careful</option>
              <option value="medium">medium — slow</option>
            </select>
          </label>
          <p className="text-xs text-muted">The [Refine] button shown on row hover re-translates with Sol into the columns on screen.</p>
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold text-muted">Glossary</h3>
          <p className="mb-2 text-xs text-muted">
            One entry per line: <code>Korean | English | Chinese | Japanese</code>. Used as transcription hints and for consistent translations.
          </p>
          <textarea
            value={settings.glossary}
            onChange={(e) => setSettings({ glossary: e.target.value })}
            rows={6}
            placeholder={"에코 | Echo | 回声 | エコー\n김민수 | Minsu Kim | 金敏洙 | キム・ミンス"}
            className="w-full rounded-xl border border-line bg-panel p-2 font-mono text-sm placeholder:text-faint"
          />
        </section>
      </aside>
    </div>
  );
}
