import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useApp, today, THEME_CYCLE, visibleHabits } from '../store';
import { AccountMenu } from './Auth';
import { InviteBell } from './Groups';
import { MiniRing } from '../charts';
import { HabitIcon } from '../lib/icons';
import { addDays, dow, fromISO, isCompleted, isFixedDay, isQuit, isSkip, monthRange } from '../lib/stats';
import { DAY_LETTERS, MONTH_NAMES } from '../lib/types';
import type { Entry, Habit } from '../lib/types';
import { haptic } from '../lib/feedback';
import { useModalOpen } from '../lib/modal';

// ------------------------------------------------------------- toolbar
const ACCENTS = ['#78C8A5', '#7DD3FC', '#C4B5FD', '#F0ABFC', '#FDA4AF', '#FDBA74', '#5EEAD4'];

function AccentPicker() {
  const { accent, setAccent } = useApp();
  const [open, setOpen] = useState(false);
  useModalOpen(open, () => setOpen(false), { blur: false });
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:text-ink hover:bg-forest-850"
        aria-label="Accent color"
        data-tip="Accent color"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" strokeLinejoin="round" />
          <circle cx="12" cy="14" r="2.5" fill="rgb(var(--mint))" stroke="none" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 panel p-3 w-52 shadow-xl">
            <div className="text-[10px] uppercase tracking-[0.16em] text-ink-soft mb-2">Accent</div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setAccent(c === ACCENTS[0] ? null : c)}
                  className="w-6 h-6 rounded-full"
                  style={{
                    background: c,
                    outline: (accent ?? ACCENTS[0]).toUpperCase() === c ? '2px solid rgb(var(--ink))' : 'none',
                    outlineOffset: 2,
                  }}
                  aria-label={`Accent ${c}`}
                />
              ))}
              <label className="w-6 h-6 rounded-full border border-dashed border-line grid place-items-center cursor-pointer hover:bg-forest-850" data-tip="Custom">
                <span className="text-[12px] leading-none text-ink-soft">+</span>
                <input
                  type="color"
                  value={accent ?? ACCENTS[0]}
                  onChange={(e) => setAccent(e.target.value.toUpperCase())}
                  className="sr-only"
                  aria-label="Custom accent color"
                />
              </label>
            </div>
            <button
              onClick={() => setAccent(null)}
              className="mt-2.5 text-[11px] text-ink-soft hover:text-ink"
            >
              Reset to default
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function TopBar() {
  const { theme, setTheme, adapter, openEditor, openArchived, resetDemo, setPauseOpen, habits } = useApp();
  const nextTheme = () => {
    const i = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(i + 1) % THEME_CYCLE.length]);
  };
  return (
    <div className="flex items-center justify-between gap-1.5 py-1">
      {/* brand */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 rounded-lg bg-mint grid place-items-center shrink-0">
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5">
            <path d="M4 10.5l4 4 8-9" fill="none" stroke="rgb(var(--forest-950))"
              strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-[14px] font-bold tracking-tight max-[419px]:hidden">OpenHabit</span>
      </div>
      <div className="flex items-center gap-1.5">
      {adapter?.mode === 'local' && (
        <span className="max-sm:hidden flex items-center gap-1.5">
          <span className="text-[11px] text-ink-soft px-2 py-1 rounded-lg bg-forest-850"
            data-tip="No backend — data lives in this browser">demo</span>
          <button onClick={resetDemo}
            className="text-[11px] text-ink-soft hover:text-ink px-2 py-1 rounded-lg hover:bg-forest-850"
            data-tip="Regenerate demo data">reset</button>
        </span>
      )}
      {habits.length > 0 && (
        <span className="max-sm:hidden"><IconBtn onClick={() => setPauseOpen(true)} label="Take a break (vacation, sick days)">
          <path d="M9 7v10M15 7v10" strokeLinecap="round" />
          <circle cx="12" cy="12" r="9" />
        </IconBtn></span>
      )}
      <span className="max-sm:hidden"><IconBtn onClick={openArchived} label="Archived habits">
        <path d="M4 8h16M5 8V6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2M6 8v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8M10 12h4" strokeLinecap="round" strokeLinejoin="round" />
      </IconBtn></span>
      <span className="max-sm:hidden"><AccentPicker /></span>
      <span className="max-sm:hidden"><IconBtn onClick={nextTheme} label={`Theme: ${theme === 'forest-dark' ? 'dark' : theme === 'pitch-black' ? 'pitch black' : 'light'}`}>
        {theme === 'forest-dark' ? (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinejoin="round" />
        ) : theme === 'pitch-black' ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
          </>
        )}
      </IconBtn></span>
      <IconBtn onClick={() => openEditor('new')} label="New habit">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </IconBtn>
      {adapter?.mode === 'api' && <span className="max-sm:hidden"><InviteBell /></span>}
      <OverflowMenu />
      {adapter?.mode === 'api' && <AccountMenu />}
      </div>
    </div>
  );
}

// Phones: the secondary toolbar actions live behind one ⋯ button instead of filling the top row.
const THEME_LABEL: Record<string, string> = { 'forest-dark': 'Dark', 'pitch-black': 'Black', 'forest-light': 'Light' };

function OverflowMenu() {
  const { theme, setTheme, accent, setAccent, adapter, habits, openArchived, setPauseOpen, resetDemo } = useApp();
  const [open, setOpen] = useState(false);
  useModalOpen(open, () => setOpen(false), { blur: false });
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  const row = 'text-left text-[13px] rounded-lg px-2.5 py-2 hover:bg-forest-850 flex items-center gap-3 w-full';
  return (
    <div className="relative sm:hidden">
      <IconBtn onClick={() => setOpen((o) => !o)} label="More">
        <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </IconBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 panel w-64 p-2 flex flex-col gap-0.5 shadow-xl" role="menu">
            {habits.length > 0 && (
              <button role="menuitem" className={row} onClick={pick(() => setPauseOpen(true))}>
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 7v10M15 7v10" strokeLinecap="round" /><circle cx="12" cy="12" r="9" /></svg>
                Take a break
              </button>
            )}
            <button role="menuitem" className={row} onClick={pick(() => { void openArchived(); })}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 8h16M5 8V6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2M6 8v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8M10 12h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Archived habits
            </button>
            <div className="px-2.5 pt-2 pb-1 border-t border-line mt-1">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">Theme</div>
              <div className="seg w-full" role="group" aria-label="Theme">
                {THEME_CYCLE.map((t) => (
                  <button key={t} onClick={() => setTheme(t)} aria-pressed={theme === t} className="flex-1">{THEME_LABEL[t] ?? t}</button>
                ))}
              </div>
            </div>
            <div className="px-2.5 pt-2 pb-1">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">Accent</div>
              <div className="flex gap-2 flex-wrap items-center">
                {ACCENTS.map((c) => (
                  <button key={c} onClick={() => setAccent(c)} aria-label={`Accent ${c}`} aria-pressed={accent === c}
                    className="w-6 h-6 rounded-full" style={{ background: c, outline: accent === c ? '2px solid rgb(var(--ink))' : 'none', outlineOffset: 2 }} />
                ))}
                {accent && <button onClick={() => setAccent(null)} className="text-[11px] text-ink-soft hover:text-ink">reset</button>}
              </div>
            </div>
            {adapter?.mode === 'local' && (
              <div className="px-2.5 pt-2 mt-1 border-t border-line flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-soft">Demo: data lives in this browser</span>
                <button onClick={pick(() => { void resetDemo(); })} className="text-[11px] font-semibold text-ink hover:text-mint">Reset</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function IconBtn({ onClick, label, children }: {
  onClick: () => void; label: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:text-ink hover:bg-forest-850"
      aria-label={label} data-tip={label}>
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        {children}
      </svg>
    </button>
  );
}

// ------------------------------------------------------ habit list grid
const CELL = 46;
const WEEK_CELL_MIN = 32; // narrowest day column in the week view
const MODE_KEY = 'openhabit.gridMode';
type GridMode = 'week' | 'month';
const SMALL_SCREEN = '(max-width: 639px)';
const ROW_H = 44;
const NAME_W_KEY = 'openhabit.nameW';
const LIST_H_KEY = 'openhabit.listH';
const NAME_MIN = 52;   // below ICON_ONLY the name hides, ring + icon remain
const NAME_MAX = 420;
const ICON_ONLY = 132;

export function HabitList() {
  const {
    habits, entries, overview, gridYear, gridMonth, shiftGridMonth,
    toggleEntry, setNumericEntry, openDetail, openEditor, reorderHabits, categoryFilter,
  } = useApp();
  const shown = visibleHabits(habits, categoryFilter);
  const filtered = shown.length !== habits.length; // reordering needs the full list

  const [nameW, setNameW] = useState(() => {
    const v = parseInt(localStorage.getItem(NAME_W_KEY) ?? '', 10);
    return Number.isFinite(v) ? Math.min(NAME_MAX, Math.max(NAME_MIN, v)) : 176;
  });
  const [listH, setListH] = useState(() => {
    const v = parseInt(localStorage.getItem(LIST_H_KEY) ?? '', 10);
    return Number.isFinite(v) && v >= 120 ? v : 0; // 0 = natural (up to 60vh)
  });
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null);
  const [cellMenu, setCellMenu] = useState<{ habit: Habit; date: string; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Week view: seven days that always fit the screen (rolling window ending on `anchor`).
  const [mode, setModeState] = useState<GridMode>(() => {
    try {
      const v = localStorage.getItem(MODE_KEY);
      if (v === 'week' || v === 'month') return v;
    } catch { /* private mode */ }
    return matchMedia(SMALL_SCREEN).matches ? 'week' : 'month';
  });
  const setMode = (m: GridMode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ }
  };
  const [anchor, setAnchor] = useState(() => today());
  const [width, setWidth] = useState(390);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const week = mode === 'week';
  const nameEff = week ? Math.max(NAME_MIN, Math.min(nameW, width - 7 * WEEK_CELL_MIN)) : nameW;
  const cell = week ? Math.max(WEEK_CELL_MIN, Math.floor((width - nameEff) / 7)) : CELL;
  const iconOnly = nameEff < ICON_ONLY;

  const t = today();
  const { start, daysInMonth } = monthRange(gridYear, gridMonth);
  const days = useMemo(
    () => (week
      ? Array.from({ length: 7 }, (_, i) => addDays(anchor, i - 6))
      : Array.from({ length: daysInMonth }, (_, i) => `${start.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)),
    [week, anchor, start, daysInMonth]
  );
  // entries are loaded for the last ~120 days (and the grid month): stay inside them
  const oldestShown = addDays(t, -112);
  const canGoBack = addDays(anchor, -13) >= oldestShown;
  const canGoForward = anchor < t;
  const weekLabel = (() => {
    const a = fromISO(days[0]); const b = fromISO(days[6]);
    const m = (d: Date) => d.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' });
    return a.getUTCMonth() === b.getUTCMonth()
      ? `${a.getUTCDate()}–${b.getUTCDate()} ${m(b)}`
      : `${a.getUTCDate()} ${m(a)} – ${b.getUTCDate()} ${m(b)}`;
  })();
  const isCurrentMonth = t.slice(0, 7) === start.slice(0, 7);
  const hasData = habits.length > 0;

  // center today's column when viewing the current month (incl. first load)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!week && isCurrentMonth) {
      const idx = parseInt(t.slice(8, 10), 10) - 1;
      el.scrollLeft = Math.max(0, idx * CELL - (el.clientWidth - nameW) / 2);
    } else {
      el.scrollLeft = 0;
    }
  }, [start, hasData, week]); // eslint-disable-line react-hooks/exhaustive-deps

  const entryLookup = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(`${e.habitId}|${e.date}`, e);
    return m;
  }, [entries]);

  const pctById = useMemo(
    () => new Map((overview?.habits ?? []).map((h) => [h.id, h.pct])),
    [overview]
  );

  // ---- pointer-based resize (mouse + touch, capture = no snap-back) ----
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = nameW;
    let w = startW;
    const move = (ev: PointerEvent) => {
      w = Math.min(NAME_MAX, Math.max(NAME_MIN, startW + ev.clientX - startX));
      setNameW(w);
    };
    const up = () => {
      localStorage.setItem(NAME_W_KEY, String(w));
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const startVResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = listH || scrollRef.current?.clientHeight || 300;
    let h = startH;
    let moved = false;
    const move = (ev: PointerEvent) => {
      moved = true;
      h = Math.max(120, startH + ev.clientY - startY);
      setListH(h);
    };
    const up = () => {
      if (moved) localStorage.setItem(LIST_H_KEY, String(h));
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // ---- pointer-based reorder (works on touch, unlike HTML5 DnD) ----
  const startReorder = (e: React.PointerEvent<HTMLSpanElement>, id: string) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const fromIdx = habits.findIndex((h) => h.id === id);
    const startY = e.clientY;
    let toIdx = fromIdx;
    setDrag({ id, to: fromIdx });
    const move = (ev: PointerEvent) => {
      toIdx = Math.max(0, Math.min(habits.length - 1,
        fromIdx + Math.round((ev.clientY - startY) / ROW_H)));
      setDrag({ id, to: toIdx });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      setDrag(null);
      if (toIdx !== fromIdx) {
        const ids = habits.map((h) => h.id);
        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, id);
        reorderHabits(ids);
      }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  return (
    <section className="panel">
      <div className="panel-head">
        Habits
        <div className="seg" role="group" aria-label="Grid range">
          {(['week', 'month'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className="capitalize">{m}</button>
          ))}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="overflow-auto thin-scroll overscroll-x-contain"
        style={{ maxHeight: listH || '60vh' }}
      >
        <div style={{ minWidth: nameEff + days.length * cell }}>
          {/* header: month switcher + day columns */}
          <div className="flex items-stretch border-b border-line sticky top-0 z-20 bg-panel">
            <div
              className="sticky left-0 z-10 bg-panel shrink-0 border-r border-line flex items-center justify-between gap-0.5 px-1"
              style={{ width: nameEff }}
            >
              <button
                onClick={() => (week ? setAnchor(addDays(anchor, -7)) : shiftGridMonth(-1))}
                disabled={week && !canGoBack}
                aria-label={week ? 'Previous week' : 'Previous month'}
                className="w-6 h-6 grid place-items-center rounded-md text-ink-soft hover:text-ink hover:bg-forest-850 shrink-0 disabled:opacity-30">
                ‹
              </button>
              {!iconOnly && (
                <span className="text-[11px] font-semibold text-center truncate">
                  {week ? weekLabel : <>{MONTH_NAMES[gridMonth - 1].slice(0, 3)} <span className="num text-ink-soft">{gridYear}</span></>}
                </span>
              )}
              <button
                onClick={() => (week ? setAnchor(addDays(anchor, 7) > t ? t : addDays(anchor, 7)) : shiftGridMonth(1))}
                disabled={week && !canGoForward}
                aria-label={week ? 'Next week' : 'Next month'}
                className="w-6 h-6 grid place-items-center rounded-md text-ink-soft hover:text-ink hover:bg-forest-850 shrink-0 disabled:opacity-30">
                ›
              </button>
            </div>
            {days.map((d) => (
              <div key={d} style={{ width: cell }}
                className={`py-2 text-center shrink-0 ${d === t ? 'bg-forest-850/70 rounded-b-md' : ''}`}>
                <div className={`text-[10px] leading-none ${d === t ? 'text-ink font-semibold' : 'text-ink-soft'}`}>
                  {DAY_LETTERS[dow(d)]}
                </div>
                <div className={`num text-[11px] leading-tight mt-0.5 ${d === t ? 'text-ink font-bold' : 'text-ink-soft'}`}>
                  {+d.slice(8, 10)}
                </div>
              </div>
            ))}
          </div>

          {shown.map((habit, idx) => (
            <div
              key={habit.id}
              className={`flex items-stretch border-b border-line last:border-b-0 transition-transform ${
                drag?.id === habit.id ? 'opacity-40' : ''
              } ${drag && drag.id !== habit.id && drag.to === idx ? 'border-t-2 border-t-mint' : ''}`}
              style={{ height: ROW_H }}
            >
              <div
                className="sticky left-0 z-10 bg-panel shrink-0 border-r border-line flex items-center min-w-0 group relative"
                style={{ width: nameEff }}
              >
                {filtered || (week && width < 500) ? <span className="w-2 shrink-0" /> : <span
                  onPointerDown={(e) => startReorder(e, habit.id)}
                  className={`cursor-grab active:cursor-grabbing px-1 flex items-center text-ink-soft/50 hover:text-ink-soft ${
                    iconOnly ? 'absolute left-0 top-0 h-full z-10 opacity-40 hover:opacity-100' : 'self-stretch'
                  }`}
                  style={{ touchAction: 'none' }}
                  aria-label={`Reorder ${habit.name}`}
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                    <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
                    <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
                    <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
                  </svg>
                </span>}
                <button
                  onClick={() => openDetail(habit.id)}
                  className={`flex-1 min-w-0 flex items-center gap-2 py-1 rounded-md hover:bg-forest-850/60 ${
                    iconOnly ? 'justify-center px-0' : 'text-left pr-2'
                  }`}
                  title={iconOnly ? habit.name : undefined}
                >
                  <MiniRing pct={pctById.get(habit.id) ?? 0} color={habit.color} size={20} />
                  {habit.icon && <HabitIcon name={habit.icon} color={habit.color} size={15} className="shrink-0" />}
                  {!iconOnly && (
                    <span className="min-w-0 flex items-baseline gap-1.5">
                      <span className="text-[13px] font-medium truncate text-ink">{habit.name}</span>
                      {!isFixedDay(habit) && (
                        <span className="num text-[9px] text-ink-soft shrink-0" data-tip="Flexible: any days count">
                          {habit.frequency}×wk
                        </span>
                      )}
                    </span>
                  )}
                </button>
                <div
                  onPointerDown={startResize}
                  className="absolute right-0 top-0 h-full w-2.5 cursor-col-resize opacity-0 group-hover:opacity-100 flex items-center justify-center"
                  style={{ touchAction: 'none' }}
                >
                  <div className="w-[3px] h-5 rounded-full bg-mint/60" />
                </div>
              </div>
              {days.map((d) => (
                <DayCell
                  key={d}
                  habit={habit}
                  w={cell}
                  date={d}
                  isFuture={d > t}
                  isToday={d === t}
                  entry={entryLookup.get(`${habit.id}|${d}`)}
                  onToggle={() => toggleEntry(habit, d)}
                  onSetValue={(v) => setNumericEntry(habit, d, v)}
                  onMenu={(x, y) => setCellMenu({ habit, date: d, x, y })}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {!habits.length && <TemplateGallery onCustom={() => openEditor('new')} />}

      <div
        onPointerDown={startVResize}
        className="h-3 w-full cursor-row-resize grid place-items-center text-ink-soft/40 hover:text-ink-soft hover:bg-forest-850/60"
        style={{ touchAction: 'none' }}
        data-tip-below
        data-tip="Drag to resize"
      >
        <div className="w-8 h-1 rounded-full bg-current" />
      </div>

      {cellMenu && (
        <CellMenu
          {...cellMenu}
          entry={entryLookup.get(`${cellMenu.habit.id}|${cellMenu.date}`)}
          onClose={() => setCellMenu(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------- categories
/** Filter chips for habit categories; filters Today and the grid. Hidden until a habit has one. */
export function CategoryBar() {
  const { habits, categoryFilter, setCategoryFilter } = useApp();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of habits) if (h.category) m.set(h.category, (m.get(h.category) ?? 0) + 1);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [habits]);
  if (!counts.length) return null;
  const active = counts.some(([c]) => c === categoryFilter) ? categoryFilter : '';
  const chip = (id: string, label: string, n: number) => (
    <button
      key={id || 'all'}
      onClick={() => setCategoryFilter(id)}
      aria-pressed={active === id}
      className={`shrink-0 h-8 px-3 rounded-full border text-[12px] font-medium flex items-center gap-1.5 transition-colors ${
        active === id ? 'border-mint/60 bg-mint/12 text-ink' : 'border-line text-ink-soft hover:text-ink hover:bg-forest-850'
      }`}
    >
      {label}
      <span className="num text-[10px] opacity-60">{n}</span>
    </button>
  );
  return (
    <nav className="flex gap-1.5 overflow-x-auto thin-scroll -my-0.5 py-0.5" aria-label="Habit categories">
      {chip('', 'All', habits.length)}
      {counts.map(([c, n]) => chip(c, c, n))}
    </nav>
  );
}

// ---------------------------------------------------------------- cells
const SkipGlyph = ({ size = 15 }: { size?: number }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden>
    <path d="M5 6l4 4-4 4M11 6l4 4-4 4" fill="none" stroke="rgb(var(--skip))"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
  </svg>
);

function DayCell({
  habit, w, date, entry, isFuture, isToday, onToggle, onSetValue, onMenu,
}: {
  habit: Habit;
  w: number;
  date: string;
  entry: Entry | undefined;
  isFuture: boolean;
  isToday: boolean;
  onToggle: () => void;
  onSetValue: (v: number | null) => void;
  onMenu: (x: number, y: number) => void;
}) {
  const scheduled = isFixedDay(habit) ? habit.activeDays.includes(dow(date)) : true;
  const [editing, setEditing] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const todayBg = isToday ? 'bg-forest-850/70' : '';
  const value = entry?.value;
  const hasNote = !!entry?.notes;
  const skipped = isSkip(value);

  const openMenu = (e: { clientX: number; clientY: number; preventDefault(): void }) => {
    e.preventDefault();
    if (!isFuture) onMenu(e.clientX, e.clientY);
  };
  // long-press = context menu on touch
  const pressHandlers = isFuture ? {} : {
    onContextMenu: openMenu,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const { clientX, clientY } = e;
      pressTimer.current = window.setTimeout(() => {
        haptic(12);
        onMenu(clientX, clientY);
        pressTimer.current = null;
      }, 480);
    },
    onPointerUp: () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } },
    onPointerMove: () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } },
  };

  const noteDot = hasNote && (
    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-mint/70" aria-hidden />
  );

  if (!scheduled) {
    return (
      <div style={{ width: w }} className={`grid place-items-center shrink-0 ${todayBg}`}>
        <span className="w-1 h-1 rounded-full bg-forest-700" />
      </div>
    );
  }

  if (isQuit(habit)) {
    // a slip is the only thing logged; every other past day is a clean one
    const slipped = value != null && !skipped && value >= 1;
    const started = date >= habit.createdAt.slice(0, 10) || value != null;
    const clean = !isFuture && !skipped && !slipped && started;
    return (
      <button
        onClick={() => { haptic(slipped ? 8 : [10, 30, 10]); onToggle(); }}
        {...pressHandlers}
        disabled={isFuture}
        style={{ width: w }}
        className={`cell-btn relative grid place-items-center shrink-0 h-full ${todayBg} ${isFuture ? 'opacity-25 cursor-default' : 'hover:bg-forest-850/60'}`}
        aria-label={`${habit.name}, ${date}: ${skipped ? 'skipped' : slipped ? 'slipped' : clean ? 'clean' : 'not tracked'}`}
        data-tip={skipped ? 'Skipped — streak preserved' : slipped ? 'Slipped — tap to undo' : clean ? 'Clean — tap if you slipped' : undefined}
      >
        {noteDot}
        {skipped ? (
          <SkipGlyph />
        ) : slipped ? (
          <svg key="slip" viewBox="0 0 20 20" className="w-[16px] h-[16px] pop" aria-hidden>
            <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" fill="none" stroke="rgb(var(--slip))"
              strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        ) : (
          <svg key="clean" viewBox="0 0 20 20" className="w-[18px] h-[18px]" aria-hidden
            style={{ opacity: clean ? (isToday ? 0.55 : 1) : 1 }}>
            <path d="M4 10.5l4 4 8-9" fill="none"
              stroke={clean ? 'rgb(var(--mint))' : 'rgb(var(--forest-700))'}
              strokeWidth={clean ? 2.2 : 2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    );
  }

  if (habit.type === 'boolean') {
    const done = value != null && !skipped && value >= 1;
    return (
      <button
        onClick={() => { haptic(8); onToggle(); }}
        {...pressHandlers}
        disabled={isFuture}
        style={{ width: w }}
        className={`cell-btn relative grid place-items-center shrink-0 h-full ${todayBg} ${isFuture ? 'opacity-25 cursor-default' : 'hover:bg-forest-850/60'}`}
        aria-label={`${habit.name}, ${date}: ${skipped ? 'skipped' : done ? 'done' : 'not done'}`}
        data-tip={skipped ? 'Skipped — streak preserved' : undefined}
      >
        {noteDot}
        {skipped ? (
          <SkipGlyph />
        ) : (
          <svg key={String(done)} viewBox="0 0 20 20"
            className={`w-[18px] h-[18px] ${done ? 'pop' : ''}`} aria-hidden>
            <path d="M4 10.5l4 4 8-9" fill="none"
              stroke={done ? 'rgb(var(--mint))' : 'rgb(var(--forest-700))'}
              strokeWidth={done ? 2.6 : 2.2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    );
  }

  if (editing) {
    return (
      <NumericEditor
        w={w}
        initial={skipped ? undefined : value}
        onCommit={(v) => { setEditing(false); onSetValue(v); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const met = value != null && isCompleted(habit, value);
  return (
    <button
      onClick={() => !isFuture && setEditing(true)}
      {...pressHandlers}
      disabled={isFuture}
      style={{ width: w }}
      className={`cell-btn relative shrink-0 h-full flex flex-col items-center justify-center leading-none ${todayBg} ${isFuture ? 'opacity-25 cursor-default' : 'hover:bg-forest-850/60'}`}
      aria-label={`${habit.name}, ${date}: ${skipped ? 'skipped' : value ?? 'no entry'}${habit.unit ? ` ${habit.unit}` : ''}`}
      data-tip={skipped ? 'Skipped — streak preserved' : undefined}
    >
      {noteDot}
      {skipped ? (
        <SkipGlyph />
      ) : (
        <>
          <span key={String(met)} className={`num text-[12px] font-semibold ${met ? 'pop' : ''}`}
            style={{ color: met ? 'rgb(var(--mint))' : value != null ? 'rgb(var(--ink-soft))' : 'rgb(var(--forest-700))' }}>
            {value ?? '–'}
          </span>
          {habit.unit && value != null && (
            <span className="text-[8px] text-ink-soft mt-0.5">{habit.unit}</span>
          )}
        </>
      )}
    </button>
  );
}

// right-click / long-press menu: note + skip + clear
function CellMenu({ habit, date, x, y, entry, onClose }: {
  habit: Habit; date: string; x: number; y: number;
  entry: Entry | undefined; onClose: () => void;
}) {
  const { setSkip, setNote, setNumericEntry } = useApp();
  const [note, setNoteDraft] = useState(entry?.notes ?? '');
  const skipped = isSkip(entry?.value);
  const W = 232;
  const left = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 400) - W - 8);
  const top = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 220);

  const saveNote = () => {
    if ((entry?.notes ?? '') !== note) setNote(habit, date, note.trim());
    onClose();
  };
  useModalOpen(true, saveNote, { blur: false }); // Back saves the note and closes, like tapping outside

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={saveNote} onContextMenu={(e) => { e.preventDefault(); saveNote(); }} />
      <div className="fixed z-50 panel p-3 shadow-xl flex flex-col gap-2" style={{ left, top, width: W }}>
        <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft flex items-center justify-between">
          <span className="truncate">{habit.name}</span>
          <span className="num normal-case tracking-normal">{+date.slice(8, 10)} {MONTH_NAMES[+date.slice(5, 7) - 1].slice(0, 3)}</span>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Add a note…"
          rows={2}
          maxLength={500}
          className="input resize-none text-[12px]"
          autoFocus
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => { setSkip(habit, date, !skipped); onClose(); }}
            className={`flex-1 text-[11px] font-medium rounded-lg px-2 py-1.5 border ${
              skipped ? 'border-mint/60 bg-mint/12 text-ink' : 'border-line hover:bg-forest-850 text-ink'
            }`}
            data-tip="Excused day: streak preserved, removed from goals"
          >
            {skipped ? 'Unskip' : 'Skip day'}
          </button>
          {entry && (
            <button
              onClick={() => { setNumericEntry(habit, date, null); onClose(); }}
              className="flex-1 text-[11px] font-medium rounded-lg px-2 py-1.5 border border-line text-ink-soft hover:text-red-400"
            >
              Clear
            </button>
          )}
          <button
            onClick={saveNote}
            className="flex-1 text-[11px] font-semibold rounded-lg px-2 py-1.5 bg-mint text-forest-950"
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}

function NumericEditor({
  w, initial, onCommit, onCancel,
}: {
  w: number;
  initial: number | undefined;
  onCommit: (v: number | null) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initial?.toString() ?? '');
  useEffect(() => ref.current?.select(), []);
  const commit = () => {
    if (draft.trim() === '') return onCommit(null);
    const v = parseFloat(draft);
    if (Number.isNaN(v) || v < 0) return onCancel();
    onCommit(v);
  };
  return (
    <div style={{ width: w }} className="shrink-0 h-full p-1">
      <input
        ref={ref} autoFocus type="number" step="any" inputMode="decimal" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
        }}
        className="num w-full h-full bg-forest-800 rounded-md text-center text-[12px] outline-none"
      />
    </div>
  );
}

// --------------------------------------------------------- archive view
export function ArchivedModal() {
  const { archivedOpen, archived, closeArchived, restoreHabit, deleteHabit } = useApp();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useModalOpen(archivedOpen, closeArchived);
  if (!archivedOpen) return null;
  return (
    <div className="backdrop grid place-items-center p-4"
      onClick={closeArchived} role="dialog" aria-modal="true" aria-label="Archived habits">
      <div className="panel w-full max-w-md modal-scroll thin-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          Archived habits
          <button onClick={closeArchived} className="normal-case font-semibold hover:text-ink" aria-label="Close">✕</button>
        </div>
        <div className="px-2 pb-2 pt-1">
          {archived.map((h) => (
            <div key={h.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-forest-850/60">
              {h.icon
                ? <HabitIcon name={h.icon} color={h.color} size={16} />
                : <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: h.color }} />}
              <span className="text-[13px] font-medium truncate flex-1">{h.name}</span>
              <button onClick={() => restoreHabit(h.id)}
                className="text-[11px] font-medium text-ink border border-line rounded-lg px-2.5 py-1 hover:bg-forest-850">
                Restore
              </button>
              {confirmId === h.id ? (
                <button onClick={() => deleteHabit(h.id)}
                  className="text-[11px] text-red-400 border border-red-400/40 rounded-lg px-2.5 py-1">
                  Confirm
                </button>
              ) : (
                <button onClick={() => setConfirmId(h.id)}
                  className="text-[11px] text-ink-soft hover:text-red-400 border border-line rounded-lg px-2.5 py-1">
                  Delete
                </button>
              )}
            </div>
          ))}
          {!archived.length && (
            <p className="px-2 py-6 text-center text-[12px] text-ink-soft">
              No archived habits. Archiving lives in a habit's detail view.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


// first-run template packs: one tap creates a starter set
const TEMPLATE_PACKS: {
  id: string; title: string; blurb: string;
  habits: { name: string; question: string; type: 'boolean' | 'numeric'; unit?: string; target?: number; color: string; icon: string; scheduleType?: 'weekdays' | 'per_week'; frequency?: number; activeDays?: number[] }[];
}[] = [
  {
    id: 'morning',
    title: 'Morning routine',
    blurb: 'Win the first hour of the day.',
    habits: [
      { name: 'Wake up early', question: 'Up before 6:30?', type: 'boolean', color: '#6EE7B7', icon: 'sunrise' },
      { name: 'Hydrate', question: 'Glass of water first thing?', type: 'boolean', color: '#7DD3FC', icon: 'water' },
      { name: 'Plan the day', question: 'Top 3 priorities written?', type: 'boolean', color: '#FDBA74', icon: 'pen', activeDays: [1, 2, 3, 4, 5] },
      { name: 'Meditate', question: 'How many minutes?', type: 'numeric', unit: 'min', target: 10, color: '#C4B5FD', icon: 'meditate' },
    ],
  },
  {
    id: 'fitness',
    title: 'Fitness base',
    blurb: 'Move most days, flexibly.',
    habits: [
      { name: 'Train', question: 'Did you work out?', type: 'boolean', color: '#FDA4AF', icon: 'gym', scheduleType: 'per_week', frequency: 4 },
      { name: 'Walk', question: 'How many km?', type: 'numeric', unit: 'km', target: 5, color: '#6EE7B7', icon: 'walk' },
      { name: 'Sleep by 23:00', question: 'Lights out on time?', type: 'boolean', color: '#93C5FD', icon: 'moon' },
    ],
  },
  {
    id: 'detox',
    title: 'Digital detox',
    blurb: 'Reclaim your attention.',
    habits: [
      { name: 'No social media', question: 'Stayed off the feeds?', type: 'boolean', color: '#F0ABFC', icon: 'nophone' },
      { name: 'Read', question: 'How many pages?', type: 'numeric', unit: 'pages', target: 10, color: '#C4B5FD', icon: 'book' },
      { name: 'Screen-free evening', question: 'No screens after 21:00?', type: 'boolean', color: '#5EEAD4', icon: 'moon', scheduleType: 'per_week', frequency: 3 },
    ],
  },
];

function TemplateGallery({ onCustom }: { onCustom: () => void }) {
  const { adapter, refresh } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const apply = async (packId: string) => {
    const pack = TEMPLATE_PACKS.find((p) => p.id === packId);
    if (!pack || !adapter) return;
    setBusy(packId);
    try {
      for (const h of pack.habits) await adapter.createHabit(h);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-4 py-8">
      <p className="text-center text-[13px] text-ink-soft mb-4">
        Start from a pack, or{' '}
        <button onClick={onCustom} className="text-ink underline underline-offset-2">build your own</button>.
      </p>
      <div className="grid gap-3 sm:grid-cols-3 max-w-2xl mx-auto">
        {TEMPLATE_PACKS.map((p) => (
          <button
            key={p.id}
            onClick={() => apply(p.id)}
            disabled={busy !== null}
            className="panel text-left p-3.5 hover:bg-forest-850/60 disabled:opacity-50"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              {p.habits.slice(0, 4).map((h) => (
                <HabitIcon key={h.name} name={h.icon} color={h.color} size={15} />
              ))}
            </div>
            <div className="text-[13px] font-semibold">{busy === p.id ? 'Creating…' : p.title}</div>
            <div className="text-[11px] text-ink-soft mt-0.5">{p.blurb}</div>
            <div className="text-[10px] text-ink-soft mt-2">{p.habits.length} habits</div>
          </button>
        ))}
      </div>
    </div>
  );
}
