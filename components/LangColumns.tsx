"use client";

import { useEffect, useRef, useState } from "react";
import { useEcho } from "@/lib/store";
import { canRetry, refine, retry } from "@/lib/pipeline";
import { LANGS, LANG_LABEL, type Lang, type Row } from "@/lib/types";
import { LANG_THEME, PLAIN_CARD } from "./langTheme";

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// 고른 언어 수만큼 화면을 나눈다 (Tailwind 는 동적 열 개수를 못 만들어서 style 로)
const gridStyle = (n: number) => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` });

export default function LangColumns() {
  const rows = useEcho((s) => s.rows);
  const sessionStart = useEcho((s) => s.session.startedAt);
  const fontSize = useEcho((s) => s.settings.fontSize);
  const columns = useEcho((s) => s.settings.columns);

  const scroller = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true); // 맨 아래를 보고 있으면 새 줄을 따라 내려간다

  useEffect(() => {
    if (stick) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [rows, stick]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  if (!columns.length) return <PickLanguages />;

  return (
    <div data-columns className="relative flex min-h-0 flex-1 flex-col">
      <ColumnHeaders columns={columns} />

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto pb-6" style={{ fontSize }}>
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-base text-faint">
            Type a sentence below, or press Speak (Space) — start and end one chunk at a time.
          </div>
        ) : (
          rows.map((row) => <RowView key={row.seq} row={row} columns={columns} offset={row.startedAt - sessionStart} />)
        )}
      </div>

      {!stick && (
        <button
          type="button"
          onClick={() => setStick(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-fg px-4 py-1.5 text-sm text-bg shadow-lg"
        >
          ↓ Latest
        </button>
      )}
    </div>
  );
}

// 열을 끌어 옮길 때 머리와 그 아래 칸들이 같이 움직이도록, 위치를 [data-columns] 의 CSS 변수로 준다.
// (마우스가 움직일 때마다 React 를 다시 그리지 않고 변수만 바꾼다)
const EASE = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
const columnMotion = (l: Lang): React.CSSProperties => ({
  transform: `translateX(var(--dx-${l}, 0px))`,
  transition: `var(--tr-${l}, ${EASE})`,
  zIndex: `var(--z-${l}, auto)` as unknown as number,
});

// 열 머리: 언어 칩을 끌어서 순서 바꾸기, × 로 빼기, 마지막 칸의 + 로 이어서 추가
function ColumnHeaders({ columns }: { columns: Lang[] }) {
  const setSettings = useEcho((s) => s.setSettings);
  const [dragging, setDragging] = useState<Lang | null>(null);
  const drag = useRef<{ lang: Lang; from: number; to: number; startX: number; dx: number; step: number; root: HTMLElement } | null>(null);
  const rest = LANGS.filter((l) => !columns.includes(l));

  const setColumns = (next: Lang[]) => setSettings({ columns: next });

  const setVar = (root: HTMLElement, name: string, value: string | null) =>
    value === null ? root.style.removeProperty(name) : root.style.setProperty(name, value);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>, lang: Lang, from: number) => {
    if (e.button !== 0) return;
    const root = e.currentTarget.closest<HTMLElement>("[data-columns]");
    const cell = e.currentTarget.closest<HTMLElement>("[data-head]");
    if (!root || !cell) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const gap = parseFloat(getComputedStyle(cell.parentElement!).columnGap) || 0;
    drag.current = { lang, from, to: from, startX: e.clientX, dx: 0, step: cell.getBoundingClientRect().width + gap, root };
    setVar(root, `--tr-${lang}`, "none"); // 잡은 열은 손을 바로 따라오게
    setVar(root, `--z-${lang}`, "10");
    setDragging(lang);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // 양 끝 열 밖으로는 못 나가게
    d.dx = Math.max(-d.from * d.step, Math.min((columns.length - 1 - d.from) * d.step, e.clientX - d.startX));
    d.to = Math.round(d.from + d.dx / d.step);
    setVar(d.root, `--dx-${d.lang}`, `${d.dx}px`);
    // 지나친 열들은 한 칸씩 비켜 준다
    columns.forEach((l, i) => {
      if (l === d.lang) return;
      const shift = d.from < d.to && i > d.from && i <= d.to ? -d.step : d.to < d.from && i >= d.to && i < d.from ? d.step : 0;
      setVar(d.root, `--dx-${l}`, `${shift}px`);
    });
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const { root, lang, from, to, dx, step } = d;
    // 순서를 바꾸는 순간 다른 열은 새 자리에 그대로 있고, 잡은 열만 손 놓은 위치에서 새 자리로 미끄러져 들어간다
    columns.forEach((l) => {
      setVar(root, `--tr-${l}`, "none");
      setVar(root, `--dx-${l}`, l === lang ? `${dx - (to - from) * step}px` : null);
    });
    if (to !== from) {
      const next = columns.filter((x) => x !== lang);
      next.splice(to, 0, lang);
      setColumns(next);
    }
    setDragging(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        columns.forEach((l) => setVar(root, `--tr-${l}`, null));
        setVar(root, `--dx-${lang}`, null);
        setTimeout(() => setVar(root, `--z-${lang}`, null), 250);
      }),
    );
  };

  return (
    <div className="grid gap-2 px-3 pb-2 pt-3" style={gridStyle(columns.length)}>
      {columns.map((l, i) => (
        <div key={l} data-head className="group/head flex items-center gap-1">
          <span style={columnMotion(l)} className="relative flex items-center gap-1">
            <span
              onPointerDown={(e) => onPointerDown(e, l, i)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              title="Drag to reorder"
              className={`inline-flex cursor-grab touch-none select-none items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ring-1 transition-shadow ${LANG_THEME[l].chip} ${
                dragging === l ? "cursor-grabbing shadow-lg" : ""
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${LANG_THEME[l].dot}`} />
              {LANG_LABEL[l]}
            </span>
            {!dragging && (
              <button
                type="button"
                title={`Hide ${LANG_LABEL[l]}`}
                onClick={() => setColumns(columns.filter((x) => x !== l))}
                className="rounded-full px-1.5 text-sm text-faint opacity-0 transition-opacity hover:bg-hover hover:text-fg group-hover/head:opacity-100 focus-visible:opacity-100"
              >
                ×
              </button>
            )}
          </span>

          {i === columns.length - 1 && rest.length > 0 && (
            <span className={`ml-auto flex shrink-0 gap-1 transition-opacity ${dragging ? "pointer-events-none opacity-0" : ""}`}>
              {rest.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setColumns([...columns, r])}
                  title={`Add ${LANG_LABEL[r]}`}
                  className="rounded-full border border-dashed border-faint px-2.5 py-1 text-xs text-muted hover:border-solid hover:bg-hover hover:text-fg"
                >
                  + {r.toUpperCase()}
                </button>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// 처음 화면: 보여 줄 언어를 고르면 그 수만큼 나뉜다
function PickLanguages() {
  const setSettings = useEcho((s) => s.setSettings);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <div>
        <p className="text-lg font-semibold">Which languages should be on screen?</p>
        <p className="mt-1 text-sm text-muted">Each one gets its own column. Add more, remove or reorder them from the column headers.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setSettings({ columns: [l] })}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium ring-1 hover:opacity-80 ${LANG_THEME[l].chip}`}
          >
            <span className={`h-2 w-2 rounded-full ${LANG_THEME[l].dot}`} />
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>
    </div>
  );
}

function RowView({ row, columns, offset }: { row: Row; columns: Lang[]; offset: number }) {
  if (row.status === "filler") {
    return (
      <div className="px-3 py-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-0.5 text-xs text-muted">
          {row.source && row.source !== "other" && <span className={`h-1.5 w-1.5 rounded-full ${LANG_THEME[row.source].dot}`} />}
          {clock(offset)} · {row.original}
        </span>
      </div>
    );
  }

  if (row.status === "empty") {
    return (
      <div className="px-3 py-1">
        <span className="inline-flex rounded-full bg-panel px-3 py-0.5 text-xs text-faint">{clock(offset)} · no speech recognized</span>
      </div>
    );
  }

  // 원문 언어가 화면에 없는 칸이면 원문을 줄 위에 따로 보여 준다
  const sourceShown = row.source && row.source !== "other" && columns.includes(row.source);

  return (
    <div className="group relative grid gap-2 px-3 py-1" style={gridStyle(columns.length)}>
      {row.original && !sourceShown && row.status !== "transcribing" && (
        <div className="col-span-full flex items-baseline gap-2 px-1 text-[0.8em] text-muted">
          <span className="shrink-0 text-[11px] font-medium">
            {row.input === "voice" ? "🎤" : "⌨"} {clock(offset)}
            {row.source && ` · ${row.source === "other" ? "other" : LANG_LABEL[row.source]}`}
          </span>
          <span className="whitespace-pre-wrap">{row.original}</span>
        </div>
      )}
      {columns.map((l) => (
        <Cell key={l} lang={l} row={row} offset={offset} />
      ))}
      {row.status === "error" && <ErrorBox row={row} />}

      {/* 줄 오른쪽 위: 지연시간·버튼 (마우스 올리면) */}
      <div className="absolute right-5 top-2.5 flex items-center gap-2 text-[11px] text-faint">
        {(row.sttMs !== undefined || row.trMs !== undefined) && (
          <span className="hidden group-hover:inline">
            {[row.sttMs !== undefined && `STT ${(row.sttMs / 1000).toFixed(1)}s`, row.trMs !== undefined && `translate ${(row.trMs / 1000).toFixed(1)}s`]
              .filter(Boolean)
              .join(" · ")}
            {row.model && ` · ${row.model === "gpt-6-sol" ? "Sol" : "Luna"}`}
          </span>
        )}
        {row.status === "done" && !row.refining && (row.model !== "gpt-6-sol" || columns.some((l) => !row.text[l])) && (
          <button
            type="button"
            onClick={() => refine(row.seq)}
            title="Re-translate this line with Sol into the columns on screen"
            className="hidden rounded-full bg-bg px-2.5 py-0.5 text-muted ring-1 ring-line hover:bg-hover hover:text-fg group-hover:inline"
          >
            Refine
          </button>
        )}
        {row.refining && <span className="text-accent">Refining…</span>}
      </div>
    </div>
  );
}

function Cell({ lang, row, offset }: { lang: Lang; row: Row; offset: number }) {
  const isSource = row.source === lang;
  const text = row.text[lang];

  let body: React.ReactNode;
  if (text) {
    body = <p className="whitespace-pre-wrap leading-snug">{text}</p>;
  } else if (row.status === "transcribing") {
    body = <p className="animate-pulse text-faint">Transcribing…</p>;
  } else if (row.status === "translating" || row.refining) {
    body = <p className="animate-pulse text-faint">Translating…</p>;
  } else {
    body = <p className="text-faint">—</p>;
  }

  return (
    <div style={columnMotion(lang)} className={`relative rounded-2xl px-4 pb-3 pt-2.5 ${isSource ? LANG_THEME[lang].card : PLAIN_CARD}`}>
      <div className={`mb-1 flex h-4 items-center gap-1.5 text-[11px] font-medium ${isSource ? LANG_THEME[lang].tag : ""}`}>
        {isSource && (
          <span title={row.input === "voice" ? "Spoken original" : "Typed original"}>
            {row.input === "voice" ? "🎤" : "⌨"} {clock(offset)}
          </span>
        )}
      </div>
      {body}
    </div>
  );
}

function ErrorBox({ row }: { row: Row }) {
  return (
    <div className="col-span-full flex items-center gap-3 rounded-2xl bg-danger/10 px-4 py-2 text-sm text-danger">
      <p className="break-all">⚠ {row.error ?? "Error"}</p>
      {canRetry(row) && (
        <button
          type="button"
          onClick={() => retry(row.seq)}
          className="shrink-0 rounded-full px-3 py-0.5 text-xs ring-1 ring-danger/40 hover:bg-danger/10"
        >
          Retry
        </button>
      )}
    </div>
  );
}
