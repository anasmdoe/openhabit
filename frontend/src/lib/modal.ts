import { useEffect, useSyncExternalStore } from 'react';

// Every popup registers here while it is open, so the page behind can blur
// without App having to know each popup's open flag.
const open = new Set<symbol>();
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

/** Call from a popup component (before any early return) with whether it is showing. */
export function useModalOpen(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    const id = Symbol('modal');
    open.add(id);
    notify();
    return () => { open.delete(id); notify(); };
  }, [isOpen]);
}

const subscribe = (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; };

/** True while at least one popup is open. */
export const useAnyModalOpen = () => useSyncExternalStore(subscribe, () => open.size > 0);
