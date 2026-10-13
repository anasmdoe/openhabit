import React, { useEffect, useState } from 'react';
import { useApp } from '../store';
import { authApi } from '../api';
import { currentSubscription, enablePush, needsHomeScreen, pushSupported } from '../lib/push';
import { canPromptInstall, isInstalled, isIOS, onInstallChange, promptInstall } from '../lib/install';

const SEEN_KEY = 'openhabit.welcome';
const NEW_ACCOUNT_DAYS = 3;

const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ } };

// First-run checklist for a new account: add habits, turn on reminders, install the app.
export function Welcome() {
  const { adapter, user, habits, ready, setView, openEditor } = useApp();
  const [open, setOpen] = useState(false);
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushNote, setPushNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  const eligible = ready && adapter?.mode === 'api' && !!user && !seen()
    && (habits.length === 0 || (user.createdAt && Date.now() - new Date(user.createdAt).getTime() < NEW_ACCOUNT_DAYS * 86_400_000));

  useEffect(() => { if (eligible) setOpen(true); }, [eligible]);
  useEffect(() => onInstallChange(() => force((n) => n + 1)), []);
  useEffect(() => {
    if (!open || !pushSupported()) return;
    authApi.pushKey().then((r) => setPushKey(r.publicKey)).catch(() => {});
    currentSubscription().then((s) => setPushOn(Boolean(s))).catch(() => {});
  }, [open]);

  if (!open) return null;
  const close = () => { markSeen(); setOpen(false); };

  const turnOnPush = async () => {
    if (!pushKey) return;
    setBusy(true);
    setPushNote('');
    try { await enablePush(pushKey); setPushOn(true); }
    catch (e) { setPushNote(e instanceof Error ? e.message : 'Could not turn on notifications'); }
    finally { setBusy(false); }
  };

  const installed = isInstalled();
  const steps: { done: boolean; title: string; text: string; action?: React.ReactNode }[] = [
    {
      done: habits.length > 0,
      title: 'Add your first habits',
      text: 'Start from a ready-made pack or create your own.',
      action: (
        <button onClick={() => { close(); setView('habits'); if (habits.length) openEditor('new'); }} className="step-btn">
          {habits.length ? 'Add another' : 'Choose habits'}
        </button>
      ),
    },
    ...(pushKey && pushSupported() ? [{
      done: pushOn,
      title: 'Get reminders on this device',
      text: needsHomeScreen()
        ? 'On iPhone, first add OpenHabit to your Home Screen, then turn this on there.'
        : pushNote || 'A nudge when a habit is still open, with Done and Snooze buttons.',
      action: needsHomeScreen() ? undefined : (
        <button onClick={turnOnPush} disabled={busy || pushOn} className="step-btn">{pushOn ? 'On' : busy ? '…' : 'Turn on'}</button>
      ),
    }] : []),
    ...(!installed ? [{
      done: false,
      title: 'Install the app',
      text: isIOS() ? 'Tap Share, then “Add to Home Screen”.'
        : canPromptInstall() ? 'Opens full screen from your home screen, and works offline.'
        : 'Use your browser menu: “Install app” or “Add to Home screen”.',
      action: canPromptInstall() ? <button onClick={() => { void promptInstall(); }} className="step-btn">Install</button> : undefined,
    }] : []),
  ];

  return (
    <div className="backdrop grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Welcome to OpenHabit" onClick={close}>
      <div className="panel w-full max-w-md sheet-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-1">
          <div className="text-[18px] font-bold tracking-tight">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋</div>
          <p className="text-[12.5px] text-ink-soft mt-1">Three quick things make OpenHabit stick.</p>
        </div>
        <ol className="px-3 py-3 flex flex-col gap-1.5">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <span className={`w-6 h-6 rounded-full shrink-0 grid place-items-center text-[11px] font-bold ${
                s.done ? 'bg-mint text-forest-950' : 'border border-line text-ink-soft'
              }`}>
                {s.done ? '✓' : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{s.title}</span>
                <span className="block text-[11.5px] text-ink-soft leading-snug">{s.text}</span>
              </span>
              {s.action}
            </li>
          ))}
        </ol>
        <div className="px-5 pb-4 flex justify-end">
          <button onClick={close} className="text-[11px] uppercase tracking-wider font-bold text-ink-soft hover:text-ink px-3 py-1.5">
            {habits.length ? 'Done' : 'Skip for now'}
          </button>
        </div>
      </div>
    </div>
  );
}
