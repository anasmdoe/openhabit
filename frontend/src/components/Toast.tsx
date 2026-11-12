import { useEffect } from 'react';
import { useApp } from '../store';
import { usePresence } from '../lib/motion';

/** "Marked done — Undo" snackbar. Sits above the phone tab bar; polite for screen readers. */
export function Toast() {
  const toast = useApp((s) => s.toast);
  const dismiss = useApp((s) => s.dismissToast);
  const present = usePresence(!!toast, 170, toast);
  const shown = toast ?? (present.closing ? present.snapshot : null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, 5000);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-0 z-[60] flex justify-center px-4 pointer-events-none bottom-[calc(4.5rem+env(safe-area-inset-bottom))] sm:bottom-6">
      {shown && (
        <div key={shown.id}
          className={`${present.closing ? 'toast-out' : 'toast-in'} pointer-events-auto flex items-center gap-3 rounded-xl bg-forest-800 border border-forest-700 shadow-lg pl-4 pr-2 py-2 text-[13px] text-ink max-w-sm`}>
          <span className="truncate">{shown.message}</span>
          {shown.undo && (
            <button onClick={() => { shown.undo?.(); dismiss(); }}
              className="min-h-10 px-3 rounded-lg font-semibold text-mint hover:bg-forest-700">
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
