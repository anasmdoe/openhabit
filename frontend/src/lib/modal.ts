import { useEffect, useRef, useSyncExternalStore } from 'react';

// Every popup registers here while it is open. Two things hang off that:
//   - the page behind it blurs (App reads useAnyModalOpen), and
//   - the phone's Back button / back-swipe closes the popup instead of leaving the app:
//     opening a popup pushes one browser-history entry, and going back pops it and closes
//     the topmost popup.

interface Entry { id: symbol; blur: boolean; close: () => void }

const stack: Entry[] = [];
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

// ---- history bookkeeping -------------------------------------------------
// history.back() is asynchronous: a pushState made before it lands would be undone by it.
// So history changes run one at a time: a push is immediate, a "remove my entry" back()
// holds the queue until its popstate arrives.
const queue: Array<() => void> = [];
let busy = false;
const closedByBack = new Set<symbol>();

function drain() {
  while (!busy && queue.length) queue.shift()!();
}
function run(op: () => void) {
  queue.push(op);
  drain();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (busy) { busy = false; drain(); return; } // the back() we asked for has landed
    const top = stack[stack.length - 1];         // the user went back: close the topmost popup
    if (top) { closedByBack.add(top.id); top.close(); }
  });
}

/**
 * Call from a popup component (before any early return).
 * `onClose` is what the Back button does. Pass `blur: false` for light popovers (menus), which
 * should close on Back but must not blur the page.
 */
export function useModalOpen(isOpen: boolean, onClose?: () => void, opts: { blur?: boolean } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const blur = opts.blur ?? true;

  useEffect(() => {
    if (!isOpen) return;
    const id = Symbol('modal');
    stack.push({ id, blur, close: () => closeRef.current?.() });
    run(() => history.pushState({ openhabitPopup: true }, ''));
    notify();
    return () => {
      const i = stack.findIndex((e) => e.id === id);
      if (i >= 0) stack.splice(i, 1);
      notify();
      if (closedByBack.delete(id)) return; // Back already removed its history entry
      run(() => { busy = true; history.back(); }); // closed with the X or backdrop: drop our entry
    };
  }, [isOpen, blur]);
}

const subscribe = (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; };

/** True while at least one blurring popup is open. */
export const useAnyModalOpen = () => useSyncExternalStore(subscribe, () => stack.some((e) => e.blur));

/** For event handlers that must not act while a popup is showing (e.g. tab swiping). */
export const isAnyModalOpen = () => stack.length > 0;
