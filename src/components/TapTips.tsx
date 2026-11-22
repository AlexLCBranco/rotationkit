// Touch replaces hover (RK-4): on a touch / pen tap, an element's hover text (`title`) opens as a small pop-up next to
// it; the next tap outside closes it (shared rule: useTapOutside), as does scrolling. Mouse users keep the browser's
// own title tooltips. The game chart has its own readout (same open/close rule) and is left to it.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTapOutside } from '../app/phone.ts';

const SKIP = 'input, select, textarea, option, .gc-content';

export function TapTips() {
  const [tip, setTip] = useState<{ text: string; el: Element } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useTapOutside(!!tip, () => [box.current, tip?.el], () => setTip(null));
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const t = e.target as Element | null;
      if (!t?.closest || t.closest(SKIP)) return;
      const el = t.closest('[title]');
      const text = el?.getAttribute('title')?.trim();
      // Buttons, links and labels act on tap; their hover text stays a desktop hint.
      if (!el || el.closest('a, button, label, summary, [role=button], [role=separator]')) return;
      if (text) setTip((cur) => (cur?.el === el ? null : { text, el }));
    };
    document.addEventListener('pointerup', onUp);
    return () => document.removeEventListener('pointerup', onUp);
  }, []);
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('popstate', close);
    window.addEventListener('rk:navigate', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('popstate', close);
      window.removeEventListener('rk:navigate', close);
    };
  }, [tip]);
  useLayoutEffect(() => {
    const b = box.current;
    if (!b || !tip) return;
    const r = tip.el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const w = b.offsetWidth;
    b.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8))}px`;
    const above = r.top - b.offsetHeight - 6;
    b.style.top = `${above >= 4 ? above : r.bottom + 6}px`;
    b.style.visibility = 'visible';
  });
  if (!tip) return null;
  return createPortal(
    <div ref={box} className="tap-tip" role="tooltip" data-testid="tap-tip" style={{ visibility: 'hidden' }}>
      {tip.text}
    </div>,
    document.body,
  );
}
