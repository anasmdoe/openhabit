import { useEffect } from 'react';
import { isAnyModalOpen } from './modal';

const MIN_DX = 64;       // px a horizontal swipe must travel
const AXIS_RATIO = 1.8;  // ...and it must be this much more horizontal than vertical
const MAX_MS = 700;
const EDGE = 24;         // touches starting at the screen edge belong to the browser's back gesture

/** True if the touch began inside something that handles horizontal movement itself. */
function owned(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.dataset?.noSwipe !== undefined) return true;
    const { overflowX } = getComputedStyle(el);
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Swipe sideways to move between the bottom-bar tabs. Left swipe = next tab, right = previous.
 * Ignored while a popup is open, near the screen edges, over horizontally scrolling content
 * (the month grid, filter chips), and over elements marked data-no-swipe (Today's swipe rows).
 */
export function useTabSwipe<T extends string>(enabled: boolean, order: T[], current: T, go: (v: T) => void) {
  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number; t: number } | null = null;

    const onStart = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1 || isAnyModalOpen() || !matchMedia('(max-width: 639px)').matches) return;
      const { clientX: x, clientY: y } = e.touches[0];
      if (x < EDGE || x > window.innerWidth - EDGE || owned(e.target)) return;
      start = { x, y, t: e.timeStamp };
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      if (!s || isAnyModalOpen()) return;
      const { clientX: x, clientY: y } = e.changedTouches[0];
      const dx = x - s.x;
      const dy = y - s.y;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * AXIS_RATIO || e.timeStamp - s.t > MAX_MS) return;
      const next = order[order.indexOf(current) + (dx < 0 ? 1 : -1)];
      if (next) go(next);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [enabled, order, current, go]);
}
