import { useEffect } from 'react';
import type { RefObject } from 'react';

const CLOSE_DISTANCE = 110; // px pulled down
const CLOSE_VELOCITY = 0.55; // px/ms for a quick flick
const FLICK_MIN = 40;

/**
 * Pull-down-to-close for a bottom sheet whose content scrolls.
 * The sheet follows the finger only once its content is at the very top (a
 * scroll that reaches the top and keeps going pulls straight on into a drag),
 * or from the grab handle (any element with data-grab) at any scroll position.
 * Releasing past a distance or with a quick flick closes it; otherwise it
 * springs back. Touch only: the desktop side panel is unaffected.
 */
export function useSheetDrag(ref: RefObject<HTMLElement | null>, enabled: boolean, onClose: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let tracking = false;
    let fromHandle = false;
    let active = false;
    let startX = 0;
    let startY = 0;
    let anchorY = 0;
    let dy = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;

    const setOffset = (px: number, animate: boolean) => {
      el.style.transition = animate ? 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
      el.style.transform = px ? `translateY(${px}px)` : '';
    };

    const onStart = (e: TouchEvent) => {
      tracking = e.touches.length === 1;
      if (!tracking) return;
      fromHandle = !!(e.target as HTMLElement).closest('[data-grab]');
      startX = e.touches[0].clientX;
      startY = lastY = anchorY = e.touches[0].clientY;
      lastT = e.timeStamp;
      dy = 0;
      velocity = 0;
      active = false;
      el.style.transition = 'none';
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const y = e.touches[0].clientY;
      const x = e.touches[0].clientX;
      if (!active) {
        const atTop = el.scrollTop <= 0;
        const pulling = y - lastY > 0 && y - startY > 6 && y - startY > Math.abs(x - startX);
        if ((atTop || fromHandle) && pulling) {
          active = true;
          anchorY = y - 6; // drag starts from where the pull began, without a jump
        }
      }
      if (active) {
        dy = Math.max(0, y - anchorY);
        const dt = e.timeStamp - lastT;
        if (dt > 0) velocity = 0.8 * velocity + 0.2 * ((y - lastY) / dt);
        e.preventDefault(); // stop the browser's own overscroll / pull-to-refresh
        // light resistance so it feels attached, not loose
        setOffset(dy < 200 ? dy : 200 + (dy - 200) * 0.6, false);
      }
      lastY = y;
      lastT = e.timeStamp;
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!active) return;
      active = false;
      if (dy > CLOSE_DISTANCE || (dy > FLICK_MIN && velocity > CLOSE_VELOCITY)) {
        setOffset(el.clientHeight + 40, true);
        window.setTimeout(onClose, 190);
      } else {
        setOffset(0, true);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, enabled, onClose]);
}
