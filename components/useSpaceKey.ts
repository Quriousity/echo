"use client";

import { useEffect, useRef } from "react";

// 스페이스바 단축키 (글 쓰는 칸 밖에서).
// 마우스로 누른 버튼(테마·모드 등)에 포커스가 남아 있으면 브라우저가 스페이스를 "그 버튼 클릭"으로 처리해
// 엉뚱한 버튼이 눌리므로, 버튼 위에서도 기본 동작을 막고 포커스를 풀어 단축키로만 쓴다.
export function useSpaceKey(onSpace: () => void) {
  const cb = useRef(onSpace);
  useEffect(() => {
    cb.current = onSpace;
  });

  useEffect(() => {
    const target = (e: KeyboardEvent) => (e.target instanceof Element ? e.target : null);
    const inField = (e: KeyboardEvent) => Boolean(target(e)?.closest("input, textarea, select, [contenteditable=true]"));
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || inField(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (target(e)?.closest("button")) (document.activeElement as HTMLElement | null)?.blur();
      if (!e.repeat) cb.current();
    };
    // 버튼의 스페이스 클릭은 keyup 에서 일어나므로 여기서도 막는다
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !inField(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);
}
