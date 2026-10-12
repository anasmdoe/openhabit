import React, { useState } from 'react';
import { useApp } from '../store';
import { exportCSV, exportJSON, importJSON, importLoopCSV } from '../lib/exportImport';

// Full-screen gate shown in API mode until a valid session exists.
export function AuthGate() {
  const { login, register, loginWithSSO, authConfig, ssoError } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password, name);
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
          <h1 className="text-lg font-bold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
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
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-soft">Password</span>
          <input className="input" type="password" required minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'at least 8 characters' : '••••••••'} />
        </label>

        {(error || ssoError) && <p className="text-[12px] text-red-400">{error || `SSO: ${ssoError}`}</p>}

        <button
          type="submit"
          disabled={busy}
          className="bg-mint text-forest-950 font-semibold text-sm rounded-lg py-2.5 disabled:opacity-50"
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        {authConfig?.oidc.enabled && (
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

        {(authConfig?.registration ?? true) && (
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
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
  const { user, logout, changePassword, deleteAccount, updateName, openArchived } = useApp();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'profile' | 'password' | 'delete'>('menu');
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
                <MenuBtn icon={<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" strokeLinecap="round" />}
                  onClick={() => { setNameDraft(user.name); setNtfyDraft(user.ntfyUrl ?? ''); setView('profile'); }}>
                  Edit profile
                </MenuBtn>
                <MenuBtn icon={<path d="M6 10V8a6 6 0 1 1 12 0v2m-13 0h14v10H5V10zm7 4v3" strokeLinecap="round" strokeLinejoin="round" />}
                  onClick={() => setView('password')}>
                  Change password
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
                <p className="text-[11px] text-ink-soft truncate">
                  Signed in as {user.email} · {user.timezone || 'UTC'}
                </p>
                {msg && <p className={`text-[11px] ${msg === 'Saved' ? 'text-mint' : 'text-red-400'}`}>{msg}</p>}
                <div className="flex gap-2 justify-end">
                  <MenuBtn onClick={() => { setView('menu'); setMsg(''); }}>Back</MenuBtn>
                  <button
                    className="text-[12px] font-semibold bg-mint text-forest-950 rounded-lg px-3 py-1.5"
                    onClick={async () => {
                      try { await updateProfile({ name: nameDraft.trim(), ntfyUrl: ntfyDraft.trim() }); setMsg('Saved'); }
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
