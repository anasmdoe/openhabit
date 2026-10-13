import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { Bars, LineChart } from '../charts';
import { DAY_LETTERS } from '../lib/types';
import { HabitIcon } from '../lib/icons';
import { useSheetDrag } from '../lib/useSheetDrag';
import { useModalOpen } from '../lib/modal';
import { addDays, dow, isCompleted, isFixedDay, isQuit, isSkip, todayISO, weekKey } from '../lib/stats';
import type { HabitDetail as HabitDetailData } from '../lib/types';
import {
  aggregateHistory, aggregateScore, buildCalendars, targetProgress, PERIODS, type Period,
} from '../lib/periods';

export function HabitDetail() {
  const { detailOpen, detail, closeDetail, openEditor, habits } = useApp();
  const [scorePeriod, setScorePeriod] = useState<Period>('week');
  const [histPeriod, setHistPeriod] = useState<Period>('month');
  useModalOpen(detailOpen, closeDetail);
  const sheetRef = useRef<HTMLDivElement>(null);
  useSheetDrag(sheetRef, detailOpen, closeDetail); // pull down from the top (or the handle) to close

  const score = useMemo(() => (detail ? aggregateScore(detail, scorePeriod) : []), [detail, scorePeriod]);
  const hist = useMemo(() => (detail ? aggregateHistory(detail, histPeriod) : []), [detail, histPeriod]);
  const targets = useMemo(() => (detail ? targetProgress(detail) : []), [detail]);
  const calendars = useMemo(() => (detail ? buildCalendars(detail, 3) : []), [detail]);

  if (!detailOpen) return null;

  const habit = detail ? habits.find((h) => h.id === detail.habit.id) : null;
  const isNumeric = detail?.habit.type === 'numeric';
  const quit = detail ? isQuit(detail.habit) : false;
  const lastSlip = quit ? detail!.entries.filter((e) => e.value >= 1).at(-1)?.date : undefined;
  // Requirement: day toggle is not useful for yes/no habits
  const periods = PERIODS.filter((p) => (isNumeric ? true : p.id !== 'day'));
  const color = detail?.habit.color ?? 'rgb(var(--mint))';

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-stretch sm:justify-end bg-black/40" style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }} onClick={closeDetail}>
      <div
        ref={sheetRef}
        className="sheet-in w-full sm:max-w-xl h-[92dvh] sm:h-full bg-forest-950 rounded-t-2xl sm:rounded-none border-t sm:border-t-0 sm:border-l border-line overflow-y-auto thin-scroll overscroll-y-contain"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Habit details"
      >
        {/* grab handle (mobile) */}
        <div data-grab className="sm:hidden sticky top-0 z-20 bg-forest-950 pt-2.5 pb-3 grid place-items-center rounded-t-2xl" onClick={closeDetail}>
          <div className="w-10 h-1 rounded-full bg-forest-700" />
        </div>
        {!detail ? (
          <div className="p-6 text-sm text-ink-soft animate-pulse">Loading…</div>
        ) : (
          <div className="p-3 sm:p-4 flex flex-col gap-3 pb-8">
            {/* header */}
            <header className="flex items-center gap-2 sticky top-0 bg-forest-950 py-2 z-10">
              <button
                onClick={closeDetail}
                className="w-9 h-9 grid place-items-center rounded-lg text-ink-soft hover:text-ink hover:bg-forest-850 shrink-0"
                aria-label="Back"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold leading-tight truncate flex items-center gap-2 text-ink">
                  {detail.habit.icon && <HabitIcon name={detail.habit.icon} color={color} size={18} className="shrink-0" />}
                  {detail.habit.name}
                </h2>
                {(detail.habit.question || detail.habit.cue || quit) && (
                  <p className="text-[12px] text-ink-soft truncate">
                    {quit && (lastSlip ? `Last slip ${lastSlip}` : 'No slips logged')}
                    {quit && (detail.habit.cue || detail.habit.question) && ' · '}
                    {detail.habit.cue || detail.habit.question}
                  </p>
                )}
              </div>
              {habit && (
                <button
                  onClick={() => openEditor(habit)}
                  className="text-[12px] font-medium text-ink-soft hover:text-ink border border-line rounded-lg px-3 py-1.5 shrink-0"
                >
                  Edit
                </button>
              )}
            </header>

            {/* headline stats */}
            <div className="grid grid-cols-3 gap-3">
              <Stat label={quit ? 'Clean streak' : 'Current streak'} value={`${detail.currentStreak}`} sub={detail.streakUnit} color={color} />
              <Stat label="Best streak" value={`${detail.bestStreaks[0]?.length ?? 0}`} sub="days" />
              <Stat
                label="Strength"
                value={`${Math.round(detail.scoreSeries.at(-1)?.score ?? 0)}%`}
                sub="habit score"
              />
            </div>

            {/* score */}
            <section className="panel">
              <div className="panel-head">
                Score
                <Seg periods={periods} value={scorePeriod} onChange={setScorePeriod} />
              </div>
              <div className="px-4 pb-3">
                {score.length > 1 ? (
                  <LineChart
                    height={110}
                    yMax={100}
                    series={[{ name: 'score', color, points: score.map((s) => s.value) }]}
                    labels={score.map((s, i) => (i % Math.ceil(score.length / 6) === 0 ? s.label : null))}
                  />
                ) : (
                  <Empty>Keep tracking — the score needs a little history.</Empty>
                )}
              </div>
            </section>

            {/* target (numeric only) */}
            {isNumeric && (
              <section className="panel">
                <div className="panel-head">
                  Target
                  <span className="num normal-case tracking-normal font-medium">
                    {detail.habit.target} {detail.habit.unit} / day
                  </span>
                </div>
                <div className="px-4 pb-3 flex flex-col gap-2">
                  {targets.map((r) => (
                    <div key={r.id} className="flex items-center gap-3">
                      <span className="text-[11px] text-ink-soft w-20 shrink-0">{r.label}</span>
                      <div className="flex-1 h-3 bg-forest-800 rounded-md overflow-hidden">
                        <div className="h-full rounded-md" style={{ width: `${r.pct}%`, background: color }} />
                      </div>
                      <span className="num text-[11px] text-ink-soft w-24 text-right shrink-0">
                        {r.actual} / {r.expected} {detail.habit.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* history */}
            <section className="panel">
              <div className="panel-head">
                {quit ? 'Slips' : 'History'}
                <Seg periods={periods} value={histPeriod} onChange={setHistPeriod} />
              </div>
              <div className="px-4 pb-3">
                {hist.length ? (
                  <Bars
                    values={hist.map((h) => h.value)}
                    labels={hist.map((h) => h.label)}
                    height={104}
                    showValues
                    color={detail.habit.color}
                  />
                ) : (
                  <Empty>{quit ? 'No slips — keep it up.' : 'No entries yet.'}</Empty>
                )}
                <p className="text-[10px] text-ink-soft mt-1">
                  {isNumeric ? `Total ${detail.habit.unit || 'value'} per ${histPeriod}`
                    : quit ? `Slips per ${histPeriod}` : `Completions per ${histPeriod}`}
                </p>
              </div>
            </section>

            {/* compact 3-month calendar */}
            <section className="panel">
              <div className="panel-head">Calendar</div>
              <div className="px-4 pb-3 grid grid-cols-1 min-[420px]:grid-cols-3 gap-4">
                {calendars.map((m) => (
                  <div key={m.key}>
                    <div className="text-[11px] font-medium text-ink-soft mb-1.5">{m.label}</div>
                    <div className="grid grid-cols-7 gap-[3px]">
                      {DAY_LETTERS.map((l) => (
                        <div key={l} className="text-[8px] text-ink-soft text-center">{l[0]}</div>
                      ))}
                      {m.cells.map((c, i) => (
                        <div
                          key={i}
                          title={c.date}
                          className="aspect-square rounded-[3px]"
                          style={{
                            background: !c.inMonth ? 'transparent'
                              : c.state === 'done' ? color
                              : c.state === 'partial' ? `${color}55`
                              : c.state === 'miss' ? 'rgb(var(--forest-800))'
                              : c.state === 'future' ? 'transparent'
                              : 'rgb(var(--forest-850))',
                            outline: c.state === 'future' ? '1px solid rgb(var(--line))' : undefined,
                            outlineOffset: -1,
                            opacity: c.state === 'off' && c.inMonth ? 0.45 : 1,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* best streaks */}
            <section className="panel">
              <div className="panel-head">Past year</div>
              <div className="px-4 pb-3 overflow-x-auto thin-scroll">
                <YearHeatmap detail={detail} color={color} />
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">Best streaks</div>
              <div className="px-4 pb-3 flex flex-col gap-1.5">
                {detail.bestStreaks.length ? (
                  detail.bestStreaks.map((s, i) => {
                    const maxLen = detail.bestStreaks[0].length;
                    return (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="num text-ink-soft w-12 shrink-0">{s.start.slice(5)}</span>
                        <div className="flex-1 h-4 bg-forest-850 rounded-md overflow-hidden">
                          <div
                            className="h-full rounded-md flex items-center justify-end pr-1.5"
                            style={{ width: `${(s.length / maxLen) * 100}%`, background: color, minWidth: 26 }}
                          >
                            <span className="num text-[10px] font-bold" style={{ color: 'rgb(var(--forest-950))' }}>
                              {s.length}
                            </span>
                          </div>
                        </div>
                        <span className="num text-ink-soft w-12 shrink-0 text-right">{s.end.slice(5)}</span>
                      </div>
                    );
                  })
                ) : (
                  <Empty>Complete this habit to start a streak.</Empty>
                )}
              </div>
            </section>

            {/* weekday frequency */}
            <section className="panel">
              <div className="panel-head">Frequency</div>
              <div className="px-4 pb-3">
                <Bars
                  values={detail.weekdayFrequency.map((w) => w.pct)}
                  labels={DAY_LETTERS}
                  height={88}
                  showValues
                  yMax={100}
                  color={detail.habit.color}
                />
              </div>
            </section>

            {/* destructive actions live at the bottom, out of the way */}
            {habit && <DangerRow habitId={habit.id} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Seg({ periods, value, onChange }: {
  periods: { id: Period; label: string }[];
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <span className="seg normal-case tracking-normal">
      {periods.map((p) => (
        <button key={p.id} aria-pressed={value === p.id} onClick={() => onChange(p.id)}>
          {p.label}
        </button>
      ))}
    </span>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <section className="panel px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink-soft">{label}</div>
      <div className="num text-xl font-bold leading-tight" style={{ color }}>{value}</div>
      <div className="text-[10px] text-ink-soft">{sub}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-ink-soft py-2">{children}</p>;
}

function DangerRow({ habitId }: { habitId: string }) {
  const { archiveHabit, deleteHabit } = useApp();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <button
        onClick={() => archiveHabit(habitId)}
        className="text-[11px] text-ink-soft hover:text-ink border border-line rounded-lg px-3 py-1.5"
      >
        Archive
      </button>
      {confirm ? (
        <button
          onClick={() => deleteHabit(habitId)}
          className="text-[11px] text-red-400 border border-red-400/40 rounded-lg px-3 py-1.5"
        >
          Confirm delete
        </button>
      ) : (
        <button
          onClick={() => setConfirm(true)}
          className="text-[11px] text-ink-soft hover:text-red-400 border border-line rounded-lg px-3 py-1.5"
        >
          Delete
        </button>
      )}
    </div>
  );
}


// GitHub-style year heatmap built from the detail's 365-day entry list
function YearHeatmap({ detail, color }: { detail: HabitDetailData; color: string }) {
  const habit = detail.habit;
  const today = todayISO();
  const start = weekKey(addDays(today, -364)); // align to Monday
  const byDate = new Map(detail.entries.map((e) => [e.date, e.value]));
  const CELLW = 11;
  const GAP = 2;

  const weeks: { date: string; level: number }[][] = [];
  for (let wk = start; wk <= today; wk = addDays(wk, 7)) {
    const col: { date: string; level: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(wk, i);
      if (d > today) break;
      const v = byDate.get(d);
      let level = 0; // 0 empty/off, 1 partial, 2 done, -1 skip
      if (isSkip(v)) level = -1;
      else if (isQuit(habit) && d < detail.habit.createdDate) level = 0;
      else if (isCompleted(habit, v)) level = 2; // quit habits: a clean day
      else if (isQuit(habit) && v != null && v >= 1) level = 1; // a slip
      else if (v != null && v > 0) level = 1;
      else if (d < detail.habit.createdDate
        || (isFixedDay(habit) && !habit.activeDays.includes(dow(d)))) level = 0;
      col.push({ date: d, level });
    }
    weeks.push(col);
  }

  const fill = (level: number) =>
    level === 2 ? color
    : level === 1 ? 'rgb(var(--forest-700))'
    : level === -1 ? 'rgb(var(--forest-800))'
    : 'rgb(var(--forest-850))';

  const w = weeks.length * (CELLW + GAP);
  const h = 7 * (CELLW + GAP);
  return (
    <svg width={w} height={h} className="block" role="img" aria-label="Year activity heatmap">
      {weeks.map((col, x) =>
        col.map((cell, y) => (
          <rect
            key={cell.date}
            x={x * (CELLW + GAP)}
            y={y * (CELLW + GAP)}
            width={CELLW}
            height={CELLW}
            rx={2.5}
            fill={fill(cell.level)}
            opacity={cell.level === 2 ? 0.9 : 1}
          >
            <title>{cell.date}{cell.level === -1 ? ' — skipped' : ''}</title>
          </rect>
        ))
      )}
    </svg>
  );
}
