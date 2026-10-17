import React, { useState } from 'react';
import { useApp } from '../store';
import { DAY_LETTERS } from '../lib/types';
import type { HabitKind } from '../lib/types';
import { HabitIcon, ICON_NAMES } from '../lib/icons';
import { useModalOpen } from '../lib/modal';

const COLORS = [
  '#6EE7B7', // mint
  '#5EEAD4', // teal
  '#7DD3FC', // sky
  '#93C5FD', // blue
  '#C4B5FD', // violet
  '#F0ABFC', // fuchsia
  '#FDA4AF', // rose
  '#FCA5A5', // coral
  '#FDBA74', // orange
  '#FDE047', // yellow
  '#BEF264', // lime
];

export function HabitEditor() {
  const { editorHabit, closeEditor, saveHabit, deleteHabit, archiveHabit, user, habits } = useApp();
  useModalOpen(editorHabit !== null, closeEditor);
  const isNew = editorHabit === 'new';
  const existing = isNew || !editorHabit ? null : editorHabit;

  const [name, setName] = useState(existing?.name ?? '');
  const [question, setQuestion] = useState(existing?.question ?? '');
  const [type, setType] = useState<'boolean' | 'numeric'>(existing?.type ?? 'boolean');
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [target, setTarget] = useState(existing?.target?.toString() ?? '1');
  const [targetType, setTargetType] = useState<'at_least' | 'at_most'>(existing?.targetType ?? 'at_least');
  const [color, setColor] = useState(existing?.color ?? COLORS[0]);
  const [icon, setIcon] = useState(existing?.icon ?? '');
  const [activeDays, setActiveDays] = useState<number[]>(existing?.activeDays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [scheduleType, setScheduleType] = useState<'weekdays' | 'per_week'>(existing?.scheduleType ?? 'weekdays');
  const [frequency, setFrequency] = useState(existing?.frequency ?? 3);
  const [webhookUrl, setWebhookUrl] = useState(existing?.webhookUrl ?? '');
  // up to 3 reminder times a day ('' = off); stored comma-separated
  const [times, setTimes] = useState<string[]>(existing?.reminderTime ? existing.reminderTime.split(',') : []);
  const [cue, setCue] = useState(existing?.cue ?? '');
  const [savings, setSavings] = useState(existing?.savingsPerDay ? String(existing.savingsPerDay) : '');
  const [savingsUnit, setSavingsUnit] = useState(existing?.savingsUnit ?? '');
  const reminderTime = [...new Set(times.filter(Boolean))].sort().join(',');
  const [kind, setKind] = useState<HabitKind>(existing?.kind ?? 'build');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [freezes, setFreezes] = useState(existing?.streakFreezes ?? 1);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!editorHabit) return null;

  const quit = kind === 'quit';
  const categories = [...new Set(habits.map((h) => h.category).filter(Boolean))].sort();
  const pickKind = (k: HabitKind, t: 'boolean' | 'numeric') => {
    setKind(k);
    setType(t);
    if (k === 'quit') { setScheduleType('weekdays'); setActiveDays([0, 1, 2, 3, 4, 5, 6]); }
  };

  const toggleDay = (d: number) =>
    setActiveDays((prev) =>
      prev.includes(d) ? (prev.length > 1 ? prev.filter((x) => x !== d) : prev) : [...prev, d].sort()
    );

  const valid = name.trim().length > 0 && (type === 'boolean' || parseFloat(target) > 0);

  const submit = () => {
    if (!valid) return;
    saveHabit(
      {
        name: name.trim(),
        question: question.trim(),
        type,
        unit: type === 'numeric' ? unit.trim() : '',
        target: type === 'numeric' ? parseFloat(target) : 1,
        targetType,
        color,
        icon,
        activeDays,
        scheduleType,
        frequency,
        webhookUrl: quit ? '' : webhookUrl.trim(),
        reminderTime: quit ? '' : reminderTime,
        cue: cue.trim(),
        savingsPerDay: quit && parseFloat(savings) > 0 ? parseFloat(savings) : 0,
        savingsUnit: quit && parseFloat(savings) > 0 ? savingsUnit.trim() : '',
        category: category.trim(),
        streakFreezes: freezes,
        kind,
      },
      existing?.id
    );
  };

  return (
    <div
      className="backdrop grid place-items-center p-4"
      onClick={closeEditor}
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? 'Create habit' : 'Edit habit'}
    >
      <div className="panel w-full max-w-md modal-scroll thin-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          {isNew ? 'New habit' : 'Edit habit'}
          <button onClick={closeEditor} className="normal-case font-semibold hover:text-mint" aria-label="Close">✕</button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          {isNew && (
            <div className="grid grid-cols-3 gap-2">
              <TypeCard
                active={!quit && type === 'boolean'}
                onClick={() => pickKind('build', 'boolean')}
                title="Yes or No"
                desc="e.g. Did you exercise? Did you plan your day?"
              />
              <TypeCard
                active={!quit && type === 'numeric'}
                onClick={() => pickKind('build', 'numeric')}
                title="Measurable"
                desc="e.g. How many km did you run? Pages read?"
              />
              <TypeCard
                active={quit}
                onClick={() => pickKind('quit', 'boolean')}
                title="Break a habit"
                desc="e.g. Smoking, doom-scrolling. Log only the slips."
              />
            </div>
          )}

          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={quit ? 'Smoking' : type === 'boolean' ? 'Wake up at 05:00' : 'Running'}
              autoFocus
              className="input"
            />
          </Field>

          {quit && (
            <p className="text-[11px] text-ink-soft -mt-2 leading-snug">
              Every day without a slip counts as a win, so your clean streak grows on its own.
              Tap a day only when you slipped.
            </p>
          )}

          <Field label="Question" hint="Shown when hovering the habit">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={quit ? 'Why I am quitting' : type === 'boolean' ? 'Did you wake up at 05:00?' : 'How many Km did you run today?'}
              className="input"
            />
          </Field>

          <Field label="When & where" hint="optional — a cue shown with the habit and in its reminder">
            <input
              value={cue}
              onChange={(e) => setCue(e.target.value)}
              maxLength={120}
              placeholder={quit ? 'When the urge hits: take a walk instead' : 'After my morning coffee, at my desk'}
              className="input"
            />
          </Field>

          {!quit && scheduleType === 'weekdays' && (
            <Field label="Streak protection" hint="a missed day right after a completed one won't reset the streak">
              <select value={freezes} onChange={(e) => setFreezes(Number(e.target.value))} className="input" aria-label="Streak protection">
                <option value={0}>Off</option>
                <option value={1}>1 freeze a month</option>
                <option value={2}>2 freezes a month</option>
                <option value={3}>3 freezes a month</option>
              </select>
            </Field>
          )}

          {quit && (
            <Field label="What a clean day is worth" hint="optional — shows a running total in the habit window">
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <input type="number" min="0" step="any" inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)}
                  placeholder="4" className="input num" aria-label="Value of a clean day" />
                <input value={savingsUnit} onChange={(e) => setSavingsUnit(e.target.value)} maxLength={12}
                  placeholder="$ or min" className="input" aria-label="Unit of a clean day's value" />
              </div>
            </Field>
          )}

          <Field label="Category" hint="optional — groups habits, e.g. Health, Work">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="habit-categories"
              maxLength={40}
              placeholder="Health"
              className="input"
            />
            <datalist id="habit-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>

          {type === 'numeric' && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Target">
                <input type="number" min="0.5" step="any" value={target}
                  onChange={(e) => setTarget(e.target.value)} className="input num" />
              </Field>
              <Field label="Unit">
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Km" list="unit-suggestions"
                  className="input" />
                <datalist id="unit-suggestions">
                  <option value="min">shows as 1h 30m</option>
                  <option value="h">shows as 1h 30m</option>
                  <option value="pages" /><option value="Km" /><option value="glasses" />
                </datalist>
              </Field>
              <Field label="Direction">
                <select value={targetType} onChange={(e) => setTargetType(e.target.value as 'at_least' | 'at_most')}
                  className="input">
                  <option value="at_least">At least</option>
                  <option value="at_most">At most</option>
                </select>
              </Field>
            </div>
          )}

          {!quit && <Field label="Schedule">
            <div className="flex gap-1.5 mb-2.5">
              {([['weekdays', 'Fixed days'], ['per_week', 'Times per week']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setScheduleType(id)}
                  className={`text-[11px] font-medium rounded-lg px-2.5 py-1.5 border ${
                    scheduleType === id
                      ? 'border-mint/60 bg-mint/12 text-ink'
                      : 'border-line text-ink-soft hover:bg-forest-850'
                  }`}
                  aria-pressed={scheduleType === id}
                >
                  {label}
                </button>
              ))}
            </div>
            {scheduleType === 'weekdays' ? (
              <div className="flex gap-1">
                {DAY_LETTERS.map((l, d) => (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`w-9 h-8 text-[11px] rounded-sm border ${
                      activeDays.includes(d)
                        ? 'bg-mint text-forest-950 border-mint font-bold'
                        : 'border-line text-ink-soft hover:bg-forest-850'
                    }`}
                    aria-pressed={activeDays.includes(d)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setFrequency(Math.max(1, frequency - 1))}
                  className="w-8 h-8 rounded-lg border border-line text-ink hover:bg-forest-850"
                  aria-label="Fewer times per week"
                >
                  –
                </button>
                <span className="num text-lg font-bold w-6 text-center">{frequency}</span>
                <button
                  onClick={() => setFrequency(Math.min(7, frequency + 1))}
                  className="w-8 h-8 rounded-lg border border-line text-ink hover:bg-forest-850"
                  aria-label="More times per week"
                >
                  +
                </button>
                <span className="text-[12px] text-ink-soft">times per week, any days</span>
              </div>
            )}
          </Field>}

          <Field label="Icon" hint="optional">
            <div className="grid grid-cols-9 gap-1">
              <button
                onClick={() => setIcon('')}
                className={`aspect-square grid place-items-center rounded-md border text-[10px] ${
                  icon === '' ? 'border-mint bg-mint/10 text-ink' : 'border-line text-ink-soft hover:bg-forest-850'
                }`}
                aria-pressed={icon === ''}
                title="No icon"
              >
                —
              </button>
              {ICON_NAMES.map((n) => (
                <button
                  key={n}
                  onClick={() => setIcon(n)}
                  className={`aspect-square grid place-items-center rounded-md border ${
                    icon === n ? 'border-mint bg-mint/10' : 'border-line hover:bg-forest-850'
                  }`}
                  aria-pressed={icon === n}
                  title={n}
                >
                  <HabitIcon name={n} color={icon === n ? color : 'rgb(var(--ink-soft))'} size={16} />
                </button>
              ))}
            </div>
          </Field>

          {!quit && <Field label="Reminders" hint="optional — up to 3 a day, each skipped once the habit is done">
            <div className="flex flex-col gap-1.5">
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="input num w-32"
                    type="time"
                    value={t}
                    onChange={(ev) => setTimes(times.map((x, j) => (j === i ? ev.target.value : x)))}
                    aria-label={`Reminder ${i + 1}`}
                  />
                  <button onClick={() => setTimes(times.filter((_, j) => j !== i))}
                    className="text-[11px] text-ink-soft hover:text-ink" aria-label={`Remove reminder ${i + 1}`}>remove</button>
                </div>
              ))}
              {times.length < 3 && (
                <button
                  onClick={() => setTimes([...times, times.length ? '20:00' : '08:00'])}
                  className="self-start text-[11px] font-medium rounded-full px-3 h-7 border border-line text-ink-soft hover:text-ink hover:bg-forest-850"
                >
                  + {times.length ? 'Another reminder' : 'Add a reminder'}
                </button>
              )}
            </div>
            {reminderTime && user && !user.ntfyUrl && (
              <p className="text-[11px] text-amber-400 mt-1">
                Reminders need an ntfy topic or “Reminders on this device” turned on (Account → Edit profile).
              </p>
            )}
          </Field>}

          {!quit && <Field label="Webhook" hint="optional — POST when you complete it (not a reminder)">
            <input
              className="input"
              type="url"
              placeholder="https://ntfy.sh/my-habits"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              maxLength={500}
            />
          </Field>}

          <Field label="Color">
            <div className="flex gap-1.5 flex-wrap items-center">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full grid place-items-center"
                  style={{ background: c, outline: color === c ? '2px solid rgb(var(--ink))' : 'none', outlineOffset: 2 }}
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                >
                  {color === c && (
                    <svg viewBox="0 0 14 14" className="w-3 h-3"><path d="M3 7.5l2.5 2.5L11 4" fill="none" stroke="#0B0E10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              ))}
              <label
                className="w-7 h-7 rounded-full border border-dashed border-line grid place-items-center cursor-pointer hover:bg-forest-850"
                data-tip="Custom color"
                style={!COLORS.includes(color) ? { background: color, borderStyle: 'solid', outline: '2px solid rgb(var(--ink))', outlineOffset: 2 } : undefined}
              >
                <span className={`text-[13px] leading-none ${!COLORS.includes(color) ? 'text-black/70' : 'text-ink-soft'}`}>+</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="sr-only"
                  aria-label="Pick a custom color"
                />
              </label>
            </div>
          </Field>

          <div className="sticky bottom-0 -mx-4 -mb-4 px-4 pt-3 pb-4 bg-panel border-t border-line flex items-center justify-between gap-2">
            {existing ? (
              <div className="flex gap-2">
                <button onClick={() => archiveHabit(existing.id)}
                  className="text-[11px] uppercase tracking-wider text-ink-soft hover:text-ink border border-line rounded-sm px-2 py-1.5">
                  Archive
                </button>
                {confirmDelete ? (
                  <button onClick={() => deleteHabit(existing.id)}
                    className="text-[11px] uppercase tracking-wider text-red-400 border border-red-400/40 rounded-sm px-2 py-1.5">
                    Confirm delete
                  </button>
                ) : (
                  <button onClick={() => setConfirmDelete(true)}
                    className="text-[11px] uppercase tracking-wider text-ink-soft hover:text-red-400 border border-line rounded-sm px-2 py-1.5">
                    Delete
                  </button>
                )}
              </div>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={closeEditor}
                className="text-[11px] uppercase tracking-wider text-ink-soft border border-line rounded-sm px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!valid}
                className="text-[11px] uppercase tracking-wider font-bold bg-mint text-forest-950 rounded-sm px-4 py-1.5 disabled:opacity-40"
              >
                {isNew ? 'Create habit' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeCard({ active, onClick, title, desc }: {
  active: boolean; onClick: () => void; title: string; desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-sm border ${
        active ? 'border-mint bg-mint/10' : 'border-line hover:bg-forest-850'
      }`}
      aria-pressed={active}
    >
      <div className="text-xs font-bold mb-1">{title}</div>
      <div className="text-[10px] text-ink-soft leading-snug">{desc}</div>
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">
        {label}
        {hint && <span className="normal-case tracking-normal ml-2">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
