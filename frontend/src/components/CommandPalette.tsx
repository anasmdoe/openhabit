import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, THEME_CYCLE } from '../store';
import { HabitIcon } from '../lib/icons';
import { MiniRing } from '../charts';

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const {
    habits, overview, openDetail, openEditor, openArchived,
    shiftGridMonth, theme, setTheme, paletteOpen: open, setPaletteOpen: setOpen, setPauseOpen,
  } = useApp();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useApp.getState().paletteOpen);
        setQ('');
        setSel(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  const pctById = useMemo(
    () => new Map((overview?.habits ?? []).map((h) => [h.id, h.pct])),
    [overview]
  );

  const items = useMemo<Item[]>(() => {
    const close = (fn: () => void) => () => { setOpen(false); fn(); };
    const habitItems: Item[] = habits.map((h) => ({
      id: `habit-${h.id}`,
      label: h.name,
      hint: `${pctById.get(h.id) ?? 0}% this month`,
      icon: (
        <span className="flex items-center gap-1.5">
          <MiniRing pct={pctById.get(h.id) ?? 0} color={h.color} size={16} />
          {h.icon && <HabitIcon name={h.icon} color={h.color} size={13} />}
        </span>
      ),
      run: close(() => openDetail(h.id)),
    }));
    const actions: Item[] = [
      { id: 'new', label: 'New habit', hint: 'create', run: close(() => openEditor('new')) },
      { id: 'prev', label: 'Previous month', hint: 'navigate', run: close(() => shiftGridMonth(-1)) },
      { id: 'next', label: 'Next month', hint: 'navigate', run: close(() => shiftGridMonth(1)) },
      { id: 'theme', label: 'Switch theme', hint: theme.replace('forest-', '').replace('-', ' '),
        run: close(() => setTheme(THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length])) },
      { id: 'archived', label: 'Archived habits', hint: 'manage', run: close(() => openArchived()) },
      { id: 'pause', label: 'Take a break', hint: 'vacation, sick days', run: close(() => setPauseOpen(true)) },
    ];
    return [...habitItems, ...actions];
  }, [habits, pctById, theme, openDetail, openEditor, openArchived, shiftGridMonth, setTheme, setPauseOpen]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    // simple fuzzy: all chars in order
    const fuzzy = (s: string) => {
      let i = 0;
      for (const ch of s.toLowerCase()) if (ch === needle[i]) i++;
      return i === needle.length;
    };
    return items.filter((it) => it.label.toLowerCase().includes(needle) || fuzzy(it.label));
  }, [items, q]);

  useEffect(() => setSel(0), [q]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); filtered[sel]?.run(); }
  };

  return (
    <div className="backdrop flex items-start justify-center pt-[14vh] p-4" onClick={() => setOpen(false)}>
      <div className="panel w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-line">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-ink-soft shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a habit or run a command…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft"
            aria-label="Command palette"
          />
          <kbd className="text-[10px] text-ink-soft border border-line rounded-md px-1.5 py-0.5">esc</kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto thin-scroll py-1.5" role="listbox">
          {filtered.map((it, i) => (
            <li key={it.id}>
              <button
                onClick={it.run}
                onMouseEnter={() => setSel(i)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[13px] ${
                  i === sel ? 'bg-forest-850 text-ink' : 'text-ink'
                }`}
                role="option"
                aria-selected={i === sel}
              >
                {it.icon ?? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <span className="flex-1 truncate">{it.label}</span>
                {it.hint && <span className="text-[10px] text-ink-soft shrink-0">{it.hint}</span>}
              </button>
            </li>
          ))}
          {!filtered.length && (
            <li className="px-3.5 py-4 text-center text-[12px] text-ink-soft">No matches</li>
          )}
        </ul>
      </div>
    </div>
  );
}
