import React, { useEffect, useState } from 'react';
import { useApp } from '../store';
import { exportCSV, exportJSON, importJSON, importLoopCSV } from '../lib/exportImport';
import { API, authApi } from '../api';
import { pushSupported, needsHomeScreen, currentSubscription, enablePush, disablePush } from '../lib/push';
import { useModalOpen } from '../lib/modal';

// Full-screen gate shown in API mode until a valid session exists.
export function AuthGate() {
  const { login, register, loginWithSSO, authConfig, ssoError } = useApp();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [info, setInfo] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await authApi.forgotPassword(email.trim());
        setInfo('If that address has an account, a reset link is on its way. It works for one hour.');
      } else if (mode === 'login') await login(email.trim(), password);
      else if (await register(email.trim(), password, name)) {
        setMode('login'); setInfo('Account created. Open the link we emailed you to confirm your address, then sign in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full grid place-items-center p-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6 flex flex-col gap-4">
        <div>
          <div className="w-9 h-9 rounded-xl bg-mint grid place-items-center mb-3">
            <svg viewBox="0 0 20 20" className="w-5 h-5">
              <path d="M4 10.5l4 4 8-9" fill="none" stroke="rgb(var(--forest-950))" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-lg font-bold">{mode === 'login' ? 'Welcome back' : mode === 'forgot' ? 'Reset your password' : 'Create your account'}</h1>
          <p className="text-[12px] text-ink-soft">Your habits, self-hosted.</p>
        </div>

        {mode === 'register' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-ink-soft">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              autoComplete="name" placeholder="Anas" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-soft">Email</span>
          <input className="input" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@home.lab" />
        </label>
        {mode !== 'forgot' && <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-soft">Password</span>
          <input className="input" type="password" required minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'at least 8 characters' : '••••••••'} />
        </label>}
        {mode === 'login' && authConfig?.mail && (
          <button type="button" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
            className="self-end -mt-2 text-[12px] text-ink-soft hover:text-ink">Forgot password?</button>
        )}
        {info && <p role="status" className="text-[12px] text-mint">{info}</p>}

        {(error || ssoError) && <p className="text-[12px] text-red-400">{error || `SSO: ${ssoError}`}</p>}

        <button
          type="submit"
          disabled={busy}
          className="bg-mint text-forest-950 font-semibold text-sm rounded-lg py-2.5 disabled:opacity-50"
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : mode === 'forgot' ? 'Email me a reset link' : 'Create account'}
        </button>

        {mode !== 'forgot' && authConfig?.oidc.enabled && (
          <>
            <div className="flex items-center gap-3 text-[11px] text-ink-soft">
              <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
            </div>
            <button
              type="button"
              onClick={loginWithSSO}
              className="border border-line hover:bg-forest-850 text-sm font-medium rounded-lg py-2.5"
            >
              Sign in with {authConfig.oidc.name || 'SSO'}
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <button type="button" onClick={() => { setMode('login'); setError(''); setInfo(''); }}
            className="text-[12px] text-ink-soft hover:text-ink">Back to sign in</button>
        )}
        {mode !== 'forgot' && (authConfig?.registration ?? true) && (
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setInfo(''); }}
            className="text-[12px] text-ink-soft hover:text-ink"
          >
            {mode === 'login' ? "No account yet? Register" : 'Already registered? Sign in'}
          </button>
        )}
      </form>
    </div>
  );
}

// Toolbar avatar with a small account menu.
export function AccountMenu() {
  const [verifySent, setVerifySent] = useState(false);
  const { authConfig, user, logout, changePassword, deleteAccount, updateName, openArchived } = useApp();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'profile' | 'password' | 'delete' | 'tokens' | 'calendar' | 'webhooks'>('menu');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [msg, setMsg] = useState('');
  const [dataMsg, setDataMsg] = useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const loopRef = React.useRef<HTMLInputElement>(null);
  const { adapter, refresh, updateProfile } = useApp();
  const [ntfyDraft, setNtfyDraft] = useState('');
  const [quietStart, setQuietStart] = useState('');
  const [quietEnd, setQuietEnd] = useState('');

  const doImport = async (f: File | undefined) => {
    if (!f || !adapter) return;
    setDataMsg('Importing…');
    try {
      const r = await importJSON(adapter, f);
      await refresh();
      setDataMsg(`Imported ${r.entries} entries, ${r.habits} new habits${r.skippedHabits ? `, merged ${r.skippedHabits}` : ''}`);
    } catch (e) {
      setDataMsg(e instanceof Error ? e.message : 'import failed');
    }
  };

  const doLoopImport = async (f: File | undefined) => {
    if (!f || !adapter) return;
    setDataMsg('Importing from Loop…');
    try {
      const r = await importLoopCSV(adapter, f);
      await refresh();
      setDataMsg(`Loop: ${r.entries} entries across ${r.detectedHabits.length} habits (${r.habits} new${r.skippedHabits ? `, ${r.skippedHabits} merged` : ''})`);
    } catch (e) {
      setDataMsg(e instanceof Error ? e.message : 'Loop import failed');
    }
  };

  useModalOpen(open, () => { setOpen(false); setView('menu'); setMsg(''); setCurrent(''); setNext(''); setConfirmPw(''); }, { blur: false });
  if (!user) return null;
  const initial = (user.name || user.email)[0]?.toUpperCase() ?? '?';

  const close = () => { setOpen(false); setView('menu'); setMsg(''); setCurrent(''); setNext(''); setConfirmPw(''); };

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="w-8 h-8 rounded-full bg-forest-800 text-ink text-[13px] font-semibold grid place-items-center hover:bg-forest-700"
        aria-label="Account"
        title={user.email}
      >
        {initial}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className="absolute right-0 top-10 z-40 panel w-64 p-3 flex flex-col gap-2 shadow-xl">
            {view === 'menu' && (
              <>
                <div className="pb-2 border-b border-line flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-forest-800 grid place-items-center text-[14px] font-semibold shrink-0">
                    {initial}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{user.name || 'Unnamed'}</div>
                    <div className="text-[11px] text-ink-soft truncate">{user.email}</div>
                  </div>
                </div>
                {authConfig?.mail && user.emailVerified === false && (
                  <div className="rounded-lg border border-line px-2.5 py-2 text-[11px] leading-snug">
                    Your email isn't confirmed yet.{' '}
                    <button className="font-semibold text-mint hover:underline" disabled={verifySent}
                      onClick={() => authApi.sendVerification().then(() => setVerifySent(true)).catch((e) => setMsg(e instanceof Error ? e.message : 'failed'))}>
                      {verifySent ? 'Link sent: check your inbox' : 'Send me the link'}
                    </button>
                  </div>
                )}
                <MenuBtn icon={<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" strokeLinecap="round" />}
                  onClick={() => { setNameDraft(user.name); setNtfyDraft(user.ntfyUrl ?? ''); setQuietStart(user.quietStart ?? ''); setQuietEnd(user.quietEnd ?? ''); setView('profile'); }}
                  data-menu-profile>
                  Edit profile
                </MenuBtn>
                <MenuBtn icon={<path d="M6 10V8a6 6 0 1 1 12 0v2m-13 0h14v10H5V10zm7 4v3" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={() => setView('password')}>
                  Change password
                </MenuBtn>
                <MenuBtn icon={<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM9 7h7M9 11h5" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={() => { close(); useApp.getState().openJournal(); }}>
                  Journal
                </MenuBtn>
                <MenuBtn icon={<path d="M15 7a2 2 0 0 1 2 2m4 0a6 6 0 0 1-7.7 5.7L11 17H9v2H7v2H4a1 1 0 0 1-1-1v-2.6a1 1 0 0 1 .3-.7l5.4-5.4A6 6 0 1 1 21 9z" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={() => setView('tokens')}>
                  API tokens
                </MenuBtn>
                <MenuBtn icon={<path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={() => setView('calendar')}>
                  Calendar feed
                </MenuBtn>
                <MenuBtn icon={<path d="M9 12l2 2 4-4m5 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={() => setView('webhooks')}>
                  Webhook signing
                </MenuBtn>
                <MenuBtn icon={<path d="M4 8h16M6 8v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8M10 12h4" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={() => { close(); openArchived(); }}>
                  Archived habits
                </MenuBtn>
                <div className="border-t border-line my-0.5" />
                <MenuBtn icon={<path d="M12 15V3m0 12-4-4m4 4 4-4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={async () => { if (!adapter) return; const r = await exportJSON(adapter); setDataMsg(`Exported ${r.entries} entries, ${r.habits} habits`); }}>
                  Export data (JSON)
                </MenuBtn>
                <MenuBtn icon={<path d="M12 15V3m0 12-4-4m4 4 4-4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={async () => { if (!adapter) return; await exportCSV(adapter); setDataMsg('CSV downloaded'); }}>
                  Export entries (CSV)
                </MenuBtn>
                <MenuBtn icon={<path d="M12 3v12m0-12L8 7m4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={() => fileRef.current?.click()}>
                  Import data…
                </MenuBtn>
                <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
                  onChange={(e) => doImport(e.target.files?.[0])} />
                <MenuBtn icon={<path d="M12 3v12m0-12L8 7m4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={() => loopRef.current?.click()}>
                  Import from Loop (CSV)…
                </MenuBtn>
                <input ref={loopRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => doLoopImport(e.target.files?.[0])} />
                {dataMsg && <p className="text-[10.5px] text-ink-soft px-2.5">{dataMsg}</p>}
                <div className="border-t border-line my-0.5" />
                <MenuBtn icon={<path d="M15 12H4m0 0 3-3m-3 3 3 3M10 4h9v16h-9" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={logout}>
                  Sign out
                </MenuBtn>
                <MenuBtn danger icon={<path d="M5 7h14M10 7V5h4v2m-7 0 1 13h8l1-13" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={() => setView('delete')}>
                  Delete account…
                </MenuBtn>
              </>
            )}

            {view === 'tokens' && <TokensView onBack={() => setView('menu')} />}
            {view === 'calendar' && <CalendarFeedView onBack={() => setView('menu')} />}
            {view === 'webhooks' && <WebhookSecretView onBack={() => setView('menu')} />}

            {view === 'profile' && (
              <>
                <div className="text-[12px] font-semibold">Edit profile</div>
                <input className="input" placeholder="Display name"
                  value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoComplete="name" />
                <div>
                  <div className="text-[11px] text-ink-soft mb-1">ntfy topic for reminders</div>
                  <input className="input w-full" type="url" placeholder="https://ntfy.sh/my-habits"
                    value={ntfyDraft} onChange={(e) => setNtfyDraft(e.target.value)} maxLength={300} />
                  <p className="text-[10px] text-ink-soft mt-1">
                    Subscribe to the same topic in the ntfy app. Habit reminder times are set per habit.
                  </p>
                </div>
                <DevicePush />
                <div>
                  <div className="text-[11px] text-ink-soft mb-1">Quiet hours (no reminders)</div>
                  <div className="flex items-center gap-2">
                    <input className="input flex-1" type="time" aria-label="Quiet hours start"
                      value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
                    <span className="text-[11px] text-ink-soft">to</span>
                    <input className="input flex-1" type="time" aria-label="Quiet hours end"
                      value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
                    {(quietStart || quietEnd) && (
                      <button type="button" className="text-[11px] text-ink-soft underline"
                        onClick={() => { setQuietStart(''); setQuietEnd(''); }}>
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-ink-soft mt-1">
                    e.g. 22:00 to 07:00. Snoozed reminders wait until quiet hours end.
                  </p>
                </div>
                <p className="text-[11px] text-ink-soft truncate">
                  Signed in as {user.email} · {user.timezone || 'UTC'}
                </p>
                {msg && <p className={`text-[11px] ${msg === 'Saved' ? 'text-mint' : 'text-red-400'}`}>{msg}</p>}
                <div className="flex gap-2 justify-end">
                  <MenuBtn onClick={() => { setView('menu'); setMsg(''); }}>Back</MenuBtn>
                  <button
                    className="text-[12px] font-semibold bg-mint text-forest-950 rounded-lg px-3 py-1.5"
                    onClick={async () => {
                      try {
                        await updateProfile({ name: nameDraft.trim(), ntfyUrl: ntfyDraft.trim(), quietStart, quietEnd });
                        setMsg('Saved');
                      }
                      catch (e) { setMsg(e instanceof Error ? e.message : 'failed'); }
                    }}
                  >
                    Save
                  </button>
                </div>
              </>
            )}

            {view === 'password' && (
              <>
                <div className="text-[12px] font-semibold">Change password</div>
                <input className="input" type="password" placeholder="Current password"
                  value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
                <input className="input" type="password" placeholder="New password (min 8)"
                  value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
                {msg && <p className={`text-[11px] ${msg === 'Password updated' ? 'text-mint' : 'text-red-400'}`}>{msg}</p>}
                <div className="flex gap-2 justify-end">
                  <MenuBtn onClick={() => { setView('menu'); setMsg(''); }}>Back</MenuBtn>
                  <button
                    className="text-[12px] font-semibold bg-mint text-forest-950 rounded-lg px-3 py-1.5 disabled:opacity-40"
                    disabled={next.length < 8 || !current}
                    onClick={async () => {
                      try { await changePassword(current, next); setMsg('Password updated'); setCurrent(''); setNext(''); }
                      catch (e) { setMsg(e instanceof Error ? e.message : 'failed'); }
                    }}
                  >
                    Save
                  </button>
                </div>
              </>
            )}

            {view === 'delete' && (
              <>
                <div className="text-[12px] font-semibold text-red-400">Delete account</div>
                <p className="text-[11px] text-ink-soft">
                  This permanently removes your account, habits, history and wellness data.
                </p>
                <input className="input" type="password" placeholder="Confirm your password"
                  value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="current-password" />
                {msg && <p className="text-[11px] text-red-400">{msg}</p>}
                <div className="flex gap-2 justify-end">
                  <MenuBtn onClick={() => { setView('menu'); setMsg(''); }}>Back</MenuBtn>
                  <button
                    className="text-[12px] font-semibold text-red-400 border border-red-400/40 rounded-lg px-3 py-1.5 disabled:opacity-40"
                    disabled={!confirmPw}
                    onClick={async () => {
                      try { await deleteAccount(confirmPw); }
                      catch (e) { setMsg(e instanceof Error ? e.message : 'failed'); }
                    }}
                  >
                    Delete forever
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** "Reminders on this device": Web Push, shown only when the server has it set up. */
function DevicePush() {
  const [key, setKey] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  React.useEffect(() => {
    if (!pushSupported()) return;
    authApi.pushKey().then((r) => setKey(r.publicKey)).catch(() => {});
    currentSubscription().then((s) => setOn(Boolean(s))).catch(() => {});
  }, []);
  if (!pushSupported() || !key) return null;

  const toggle = async () => {
    setBusy(true);
    setNote('');
    try {
      if (on) { await disablePush(); setOn(false); }
      else { await enablePush(key); setOn(true); setNote('Reminders will appear on this device.'); }
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not change notifications');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-ink-soft">Reminders on this device</div>
        <button type="button" onClick={toggle} disabled={busy} aria-pressed={on}
          className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 ${on ? 'bg-mint text-forest-950' : 'border border-line text-ink'}`}>
          {busy ? '…' : on ? 'On' : 'Turn on'}
        </button>
      </div>
      <p className="text-[10px] text-ink-soft mt-1">
        {needsHomeScreen()
          ? 'On iPhone, first add OpenHabit to your Home Screen (Share → Add to Home Screen), then turn this on there.'
          : note || 'Push notifications with Done and Snooze buttons, no extra app needed.'}
      </p>
    </div>
  );
}

function MenuBtn({ children, onClick, danger, icon }: {
  children: React.ReactNode; onClick: () => void; danger?: boolean; icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left text-[12px] rounded-lg px-2.5 py-1.5 hover:bg-forest-850 flex items-center gap-2.5 ${
        danger ? 'text-red-400' : 'text-ink'
      }`}
    >
      {icon && (
        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.8">
          {icon}
        </svg>
      )}
      {children}
    </button>
  );
}


// ---- API token management (session-only; the server enforces it too) ------
function TokensView({ onBack }: { onBack: () => void }) {
  const [tokens, setTokens] = useState<{ id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string }[]>([]);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const load = () => authApi.listTokens().then(setTokens).catch(() => {});
  React.useEffect(() => { load(); }, []);

  const create = async () => {
    setBusy(true); setErr('');
    try {
      const r = await authApi.createToken(name.trim());
      setFresh({ name: r.name, token: r.token });
      setName('');
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally { setBusy(false); }
  };

  const ago = (iso: string | null) => {
    if (!iso) return 'never used';
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (d < 1) return 'just now';
    if (d < 60) return `${d}m ago`;
    if (d < 1440) return `${Math.floor(d / 60)}h ago`;
    return `${Math.floor(d / 1440)}d ago`;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12px] font-semibold flex items-center gap-2">
        <button onClick={onBack} className="text-ink-soft hover:text-ink" aria-label="Back">‹</button>
        API tokens
      </div>
      <p className="text-[11px] text-ink-soft leading-snug">
        Long-lived tokens for Shortcuts, scripts, and Home Assistant. They can log
        entries and read data but can never change your password or manage tokens.
      </p>

      {fresh && (
        <div className="rounded-lg border border-mint/50 bg-mint/8 p-2.5 flex flex-col gap-1.5">
          <div className="text-[11px] font-semibold">"{fresh.name}" created — copy it now</div>
          <code className="num text-[10.5px] break-all select-all bg-forest-900 rounded-md p-2">{fresh.token}</code>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard?.writeText(fresh.token); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="text-[11px] font-semibold bg-mint text-forest-950 rounded-lg px-2.5 py-1">
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={() => setFresh(null)} className="text-[11px] text-ink-soft hover:text-ink">
              Done — it won't be shown again
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input className="input flex-1" placeholder='e.g. "Shortcuts on my phone"' maxLength={60}
          value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={!name.trim() || busy} onClick={create}
          className="text-[11px] font-semibold bg-mint text-forest-950 rounded-lg px-3 disabled:opacity-40">
          {busy ? '…' : 'Create'}
        </button>
      </div>
      {err && <p className="text-[11px] text-red-400">{err}</p>}

      <div className="flex flex-col gap-1">
        {tokens.map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-line last:border-0">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium truncate">{t.name}</div>
              <div className="num text-[10px] text-ink-soft">{t.prefix} · {ago(t.lastUsedAt)}</div>
            </div>
            <button
              onClick={async () => {
                if (confirm(`Revoke "${t.name}"? Anything using it will stop working.`)) {
                  await authApi.revokeToken(t.id).catch(() => {});
                  load();
                }
              }}
              className="text-[11px] text-ink-soft hover:text-red-400">Revoke</button>
          </div>
        ))}
        {!tokens.length && <p className="text-[11px] text-ink-soft py-2 text-center">No tokens yet.</p>}
      </div>
    </div>
  );
}

function CalendarFeedView({ onBack }: { onBack: () => void }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    authApi.feedUrl()
      .then((r) => setUrl(new URL(`${API}/habits/feed.ics?${r.query}`, location.href).href))
      .catch((e) => setErr(e instanceof Error ? e.message : 'failed'));
  }, []);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12px] font-semibold flex items-center gap-2">
        <button onClick={onBack} className="text-ink-soft hover:text-ink" aria-label="Back">‹</button>
        Calendar feed
      </div>
      <p className="text-[11px] text-ink-soft leading-snug">
        Subscribe to see your habits in Google, Apple or Outlook Calendar: recurring events on the
        days they are due, at their first reminder time. The feed lists habit names and cues only,
        never your entries, notes or mood. Anyone with this link can read it, so keep it private.
      </p>
      {url ? (
        <>
          <code className="num text-[10.5px] break-all select-all bg-forest-900 rounded-md p-2">{url}</code>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="text-[11px] font-semibold bg-mint text-forest-950 rounded-lg px-2.5 py-1.5">
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <a href={url.replace(/^https?:/, 'webcal:')} className="text-[11px] font-semibold border border-line rounded-lg px-2.5 py-1.5 hover:bg-forest-850">
              Open in calendar app
            </a>
          </div>
        </>
      ) : err ? <p className="text-[11px] text-red-400">{err}</p> : <p className="text-[11px] text-ink-soft">Loading…</p>}
    </div>
  );
}

// Opened from the link in the reset email (/?reset=TOKEN): works signed in or out.
export function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally { setBusy(false); }
  };
  return (
    <div className="min-h-full grid place-items-center p-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6 flex flex-col gap-4">
        <h1 className="text-lg font-bold">Choose a new password</h1>
        {done ? (
          <>
            <p role="status" className="text-[13px] text-mint">Password changed. You can sign in with it now.</p>
            <button type="button" onClick={onDone} className="bg-mint text-forest-950 font-semibold text-sm rounded-lg py-2.5">Continue to sign in</button>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-soft">New password</span>
              <input className="input" type="password" required minLength={8} value={password} autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-soft">Repeat it</span>
              <input className="input" type="password" required minLength={8} value={confirm} autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)} />
            </label>
            {error && <p role="alert" className="text-[12px] text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className="bg-mint text-forest-950 font-semibold text-sm rounded-lg py-2.5 disabled:opacity-50">
              {busy ? '…' : 'Save new password'}
            </button>
            <button type="button" onClick={onDone} className="text-[12px] text-ink-soft hover:text-ink">Cancel</button>
          </>
        )}
      </form>
    </div>
  );
}

function WebhookSecretView({ onBack }: { onBack: () => void }) {
  const [secret, setSecret] = useState('');
  const [shown, setShown] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    authApi.webhookSecret().then((r) => setSecret(r.secret)).catch((e) => setErr(e instanceof Error ? e.message : 'failed'));
  }, []);
  const rotate = async () => {
    if (!confirm('Replace the signing secret? Receivers still using the old one will reject new deliveries until you update them.')) return;
    try { setSecret((await authApi.rotateWebhookSecret()).secret); setShown(true); } catch (e) { setErr(e instanceof Error ? e.message : 'failed'); }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12px] font-semibold flex items-center gap-2">
        <button onClick={onBack} className="text-ink-soft hover:text-ink" aria-label="Back">‹</button>
        Webhook signing
      </div>
      <p className="text-[11px] text-ink-soft leading-snug">
        Webhooks you set on a habit are signed with this secret in an <code>X-OpenHabit-Signature</code> header, so
        the receiving service can tell a real delivery from a forged one. Treat it like a password.
        The README shows how to verify it.
      </p>
      {secret ? (
        <>
          <code className="num text-[10.5px] break-all select-all bg-forest-900 rounded-md p-2" aria-label="Signing secret">
            {shown ? secret : `${secret.slice(0, 9)}${'•'.repeat(24)}`}
          </code>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShown((v) => !v)} className="text-[11px] font-semibold border border-line rounded-lg px-2.5 py-1.5 hover:bg-forest-850">
              {shown ? 'Hide' : 'Reveal'}
            </button>
            <button onClick={() => { navigator.clipboard?.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="text-[11px] font-semibold bg-mint text-forest-950 rounded-lg px-2.5 py-1.5">
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={rotate} className="text-[11px] text-ink-soft hover:text-red-400 px-1.5">Rotate…</button>
          </div>
        </>
      ) : err ? <p className="text-[11px] text-red-400">{err}</p> : <p className="text-[11px] text-ink-soft">Loading…</p>}
    </div>
  );
}
