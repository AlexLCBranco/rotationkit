// Phone layout (RK-4): one breakpoint for the whole app. Must match the `max-width: 767px` media queries in styles.css.

import { useEffect, useState } from 'react';

export const PHONE_MAX_PX = 767;
export const PHONE_QUERY = `(max-width: ${PHONE_MAX_PX}px)`;

const matches = () => typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches;

/** True below 768 px wide; follows window resizes and rotation. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(matches);
  useEffect(() => {
    const m = matchMedia(PHONE_QUERY);
    const on = () => setPhone(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

/**
 * Shared tap-tooltip rule (RK-4): a pop-up opened by a tap closes on the next tap outside the given elements.
 * Used by the global title tips (`TapTips`), the game chart readout and the 3-in-4 chip pop-up.
 */
export function useTapOutside(open: boolean, inside: () => (Element | null | undefined)[], close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && inside().some((el) => el?.contains(t))) return;
      close();
    };
    // Capture phase: runs before the tapped element's own handlers, so a tap elsewhere both closes and acts there.
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
