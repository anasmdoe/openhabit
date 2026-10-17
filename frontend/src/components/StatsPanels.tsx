import { readableColor } from '../lib/contrast';
import React, { useMemo, useState } from 'react';
import { useApp, today } from '../store';
import { Bars, HBar, LineChart, MiniRing } from '../charts';
import { quickCurrentStreak } from '../lib/periods';
import { addDays, fromISO } from '../lib/stats';
import { entryLookup, periodStats } from '../lib/periodStats';
import type { PeriodStat } from '../lib/periodStats';
import { shareCard } from '../lib/share';
import { HabitIcon } from '../lib/icons';
import { MONTH_NAMES } from '../lib/types';

/** dimmed version of a hex color for quiet bars */
const dim = (hex: string, alpha = 0.55) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
};

// Four compact stat cards: today, month, best streak, last 7 days.
export function StatCards() {
  const { overview, habits, entries } = useApp();
  const t = today();

  const todayStat = useMemo(() => {
    const d = overview?.days.find((x) => x.date === t);
    return d && d.scheduled ? Math.round((d.completed / d.scheduled) * 100) : 0;
  }, [overview, t]);

  const bestStreak = useMemo(() => {
    const lookup = new Map(entries.map((e) => [`${e.habitId}|${e.date}`, e.value]));
    let best = { name: '—', len: 0, color: 'rgb(var(--ink-soft))' };
    for (const h of habits) {
      const len = quickCurrentStreak(h, lookup);
      if (len > best.len) best = { name: h.name, len, color: h.color };
    }
    return best;
  }, [habits, entries]);

  // last 7 days, and how they compare with the 7 before and with last month so far
  const trend = useMemo(() => {
    const lookup = entryLookup(entries);
    const last7 = periodStats(habits, lookup, addDays(t, -6), t, t);
    const prev7 = periodStats(habits, lookup, addDays(t, -13), addDays(t, -7), t);
    const monthStart = `${t.slice(0, 7)}-01`;
    const sofar = periodStats(habits, lookup, monthStart, t, t);
    const prevMonthStart = (() => { const d = fromISO(monthStart); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
    const prevSofar = periodStats(habits, lookup, prevMonthStart, addDays(prevMonthStart, +t.slice(8, 10) - 1), t);
    const diff = (a: PeriodStat, b: PeriodStat) =>
      a.goal >= 5 && b.goal >= 5 && a.pct !== null && b.pct !== null ? a.pct - b.pct : null;
    return {
      values: last7.days.map((d) => (d.goal ? Math.round((d.done / d.goal) * 100) : null)),
      labels: last7.days.map((d) => String(+d.date.slice(8, 10))),
      weekDelta: diff(last7, prev7),
      monthDelta: diff(sofar, prevSofar),
    };
  }, [habits, entries, t]);
  const week = trend;

  if (!overview) {
    return (
      <>
        {['Today', 'This month', 'Best streak', 'Last 7 days'].map((l) => (
          <section key={l} className="panel">
            <div className="panel-head">{l}</div>
            <div className="px-4 pb-3"><div className="shimmer h-12 w-full" /></div>
          </section>
        ))}
      </>
    );
  }

  return (
    <>
      <Card label="Today">
        <Big value={`${todayStat}%`} />
        <span className="text-[11px] text-ink-soft">of scheduled habits</span>
      </Card>
      <Card label="This month">
        <div className="flex items-center gap-3">
          <MiniRing pct={overview?.overallPct ?? 0} color="rgb(var(--mint))" size={34} />
          <div>
            <Big value={`${overview?.overallPct ?? 0}%`} />
            <div className="num text-[11px] text-ink-soft">
              {overview?.completed ?? 0} / {overview?.goal ?? 0} done
            </div>
          </div>
        </div>
        <Delta value={trend.monthDelta} vs="last month so far" />
      </Card>
      <Card label="Best streak">
        <Big value={String(bestStreak.len)} color={bestStreak.len ? bestStreak.color : undefined} />
        <span className="text-[11px] text-ink-soft truncate">{bestStreak.len ? bestStreak.name : 'no active streaks'}</span>
      </Card>
      <Card label="Last 7 days">
        <Bars values={week.values} labels={week.labels} height={56} yMax={100} />
        <Delta value={trend.weekDelta} vs="the 7 days before" />
      </Card>
    </>
  );
}

/** Change against an earlier period. Up is mint; down is neutral, never red: a dip is information, not failure. */
export function Delta({ value, vs }: { value: number | null; vs: string }) {
  if (value === null) return null;
  return (
    <span className={`num text-[10.5px] font-medium leading-tight ${value > 0 ? 'text-mint' : 'text-ink-soft'}`}>
      {value > 0 ? '▲' : value < 0 ? '▼' : '＝'} {Math.abs(value)} pt{Math.abs(value) === 1 ? '' : 's'} <span className="font-normal text-ink-soft">vs {vs}</span>
    </span>
  );
}

function ShareBtn({ onShare, label }: { onShare: () => void; label: string }) {
  return (
    <button
      onClick={onShare}
      className="normal-case tracking-normal text-ink-soft hover:text-ink"
      aria-label={`Share ${label}`}
      title="Share as image"
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3v12m0-12L8 7m4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">{label}</div>
      <div className="px-4 pb-3 flex flex-col gap-0.5 min-w-0">{children}</div>
    </section>
  );
}

function Big({ value, color }: { value: string; color?: string }) {
  useApp((s) => s.theme); // repaint when the theme (and so the panel colour) changes
  return <span className="num text-2xl font-bold leading-tight" style={{ color: color ? readableColor(color) : undefined }}>{value}</span>;
}

// Full-width daily trend for the current month.
export function MonthTrendPanel() {
  const { overview } = useApp();
  if (!overview) return <SkeletonPanel label="This month, day by day" h={92} />;
  const t = today();
  const todayIdx = overview.days.findIndex((d) => d.date === t);
  return (
    <section className="panel">
      <div className="panel-head">
        This month, day by day
        <span className="num normal-case tracking-normal font-medium">{overview.overallPct}%</span>
      </div>
      <div className="px-4 pb-3">
        <Bars
          values={overview.days.map((d) => (d.isFuture ? null : d.pct))}
          labels={overview.days.map((d) => +d.date.slice(8, 10))}
          height={92}
          highlight={todayIdx}
          yMax={100}
        />
      </div>
    </section>
  );
}

// Per-habit completion for the month — the "monthly show-off" panel.
export function MonthlyCompletionPanel() {
  const { overview, openDetail } = useApp();
  if (!overview) return <SkeletonPanel label="Monthly completion" h={140} />;
  const now = new Date();
  const share = () => shareCard(
    'Monthly completion',
    `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()} · ${overview.overallPct}% overall`,
    overview.habits.map((h) => ({ label: h.name, pct: h.pct, value: `${h.pct}%`, color: dim(h.color, 0.7) }))
  );
  return (
    <section className="panel">
      <div className="panel-head">
        Monthly completion
        <ShareBtn onShare={share} label="monthly completion" />
      </div>
      <div className="px-2 pb-2">
        {overview.habits.map((h) => (
          <button
            key={h.id}
            onClick={() => openDetail(h.id)}
            className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-forest-850/60 text-left"
          >
            <span className="flex items-center gap-1.5 w-32 shrink-0 min-w-0">
              {h.icon && <HabitIcon name={h.icon} color={h.color} size={14} className="shrink-0" />}
              <span className="text-[12px] font-medium truncate text-ink">{h.name}</span>
            </span>
            <div className="flex-1"><HBar pct={h.pct} color={dim(h.color)} /></div>
            <span className="num text-[11px] text-ink-soft w-9 text-right shrink-0">{h.pct}%</span>
          </button>
        ))}
        {!overview.habits.length && (
          <p className="px-2 py-4 text-[12px] text-ink-soft">Add habits to see monthly stats.</p>
        )}
      </div>
    </section>
  );
}

// Combined month completion per category (shown once any habit has one).
export function CategoryPanel() {
  const { overview, habits, setCategoryFilter } = useApp();
  const rows = useMemo(() => {
    if (!overview || !habits.some((h) => h.category)) return [];
    const cat = new Map(habits.map((h) => [h.id, h.category || 'Other']));
    const agg = new Map<string, { goal: number; actual: number; colors: string[] }>();
    for (const h of overview.habits) {
      const c = cat.get(h.id) ?? 'Other';
      const a = agg.get(c) ?? { goal: 0, actual: 0, colors: [] };
      a.goal += h.goal; a.actual += h.actual; a.colors.push(h.color);
      agg.set(c, a);
    }
    return [...agg.entries()]
      .map(([name, a]) => ({ name, pct: a.goal ? Math.round((a.actual / a.goal) * 100) : 0, ...a }))
      .sort((x, y) => y.pct - x.pct);
  }, [overview, habits]);
  if (!rows.length) return null;
  return (
    <section className="panel">
      <div className="panel-head">By category · this month</div>
      <div className="px-2 pb-2">
        {rows.map((r) => (
          <button
            key={r.name}
            onClick={() => { if (r.name !== 'Other') { setCategoryFilter(r.name); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}
            className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-forest-850/60 text-left"
          >
            <span className="flex items-center gap-1.5 w-32 shrink-0 min-w-0">
              <span className="flex -space-x-1 shrink-0" aria-hidden>
                {r.colors.slice(0, 3).map((c, i) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-full ring-2 ring-[rgb(var(--panel))]" style={{ background: c }} />
                ))}
              </span>
              <span className="text-[12px] font-medium truncate text-ink">{r.name}</span>
            </span>
            <div className="flex-1"><HBar pct={r.pct} color="rgb(var(--mint) / 0.75)" /></div>
            <span className="num text-[11px] text-ink-soft w-9 text-right shrink-0" data-tip={`${r.actual} of ${r.goal} this month`}>{r.pct}%</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// Current streaks across all habits.
export function StreaksPanel() {
  const { habits, entries, openDetail } = useApp();
  // same order as the habit list (the first panel), per user preference
  const rows = useMemo(() => {
    const lookup = new Map(entries.map((e) => [`${e.habitId}|${e.date}`, e.value]));
    return habits.map((h) => ({ habit: h, len: quickCurrentStreak(h, lookup) }));
  }, [habits, entries]);
  const max = Math.max(1, ...rows.map((r) => r.len));
  const share = () => shareCard(
    'Current streaks',
    `as of ${new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    rows.map((r) => ({
      label: r.habit.name, pct: (r.len / max) * 100, value: `${r.len}d`, color: dim(r.habit.color, 0.7),
    }))
  );
  return (
    <section className="panel">
      <div className="panel-head">
        Current streaks
        <ShareBtn onShare={share} label="current streaks" />
      </div>
      <div className="px-2 pb-2">
        {rows.map(({ habit, len }) => (
          <button
            key={habit.id}
            onClick={() => openDetail(habit.id)}
            className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-forest-850/60 text-left"
          >
            <span className="flex items-center gap-1.5 w-32 shrink-0 min-w-0">
              {habit.icon && <HabitIcon name={habit.icon} color={habit.color} size={14} className="shrink-0" />}
              <span className="text-[12px] font-medium truncate text-ink">{habit.name}</span>
            </span>
            <div className="flex-1 h-2.5 bg-forest-800 rounded-sm overflow-hidden">
              <div className="h-full rounded-sm" style={{ width: `${(len / max) * 100}%`, background: dim(habit.color) }} />
            </div>
            <span className="num text-[11px] text-ink-soft w-9 text-right shrink-0">{len}d</span>
          </button>
        ))}
        {!rows.length && <p className="px-2 py-4 text-[12px] text-ink-soft">No habits yet.</p>}
      </div>
    </section>
  );
}

// Wellness: compact chart + inline today logger.
export function WellnessPanel() {
  const { overview, logWellness } = useApp();
  const [sleepDraft, setSleepDraft] = useState('');
  if (!overview) return <SkeletonPanel label="Wellness" h={72} />;

  const t = today();
  const todayRow = overview.wellness.find((w) => w.date === t);
  const byDate = new Map(overview.wellness.map((w) => [w.date, w]));
  const moods = overview.days.map((d) => (byDate.get(d.date)?.mood ?? null));
  const sleep = overview.days.map((d) => (byDate.get(d.date)?.sleepHours ?? null));

  const commitSleep = () => {
    if (sleepDraft !== '') {
      logWellness(t, null, parseFloat(sleepDraft));
      setSleepDraft('');
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        Wellness
        <span className="flex items-center gap-3 normal-case tracking-normal font-medium">
          <span className="flex items-center gap-1"><i className="w-3 h-0.5 bg-mint inline-block rounded" /> sleep h</span>
          <span className="flex items-center gap-1"><i className="w-3 h-0.5 inline-block border-t border-dashed border-current" /> mood (1–5)</span>
        </span>
      </div>
      <div className="px-4 pb-3">
        <LineChart
          height={52}
          yMax={10}
          series={[
            { name: 'sleep', color: 'rgb(var(--mint))', points: sleep },
            { name: 'mood', color: 'rgb(var(--ink-soft))', points: moods.map((m) => (m == null ? null : m * 2)), dashed: true },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">How was today?</span>
          <div className="flex items-center gap-1" role="group" aria-label="Mood 1 to 5">
            {[1, 2, 3, 4, 5].map((m) => (
              <button
                key={m}
                onClick={() => logWellness(t, m, null)}
                className={`num w-7 h-7 text-[11px] rounded-lg border ${
                  todayRow?.mood === m
                    ? 'bg-mint text-forest-950 border-mint font-bold'
                    : 'border-line text-ink-soft hover:bg-forest-850'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              inputMode="decimal"
              placeholder={todayRow?.sleepHours != null ? `${todayRow.sleepHours}h` : 'sleep h'}
              value={sleepDraft}
              onChange={(e) => setSleepDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitSleep()}
              className="num w-16 bg-forest-850 border border-line rounded-lg px-2 py-1 text-[12px]"
              aria-label="Hours of sleep"
            />
            <button
              onClick={commitSleep}
              disabled={sleepDraft === ''}
              className="text-[11px] font-semibold bg-mint text-forest-950 rounded-lg px-2 py-1 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}


function SkeletonPanel({ label, h }: { label: string; h: number }) {
  return (
    <section className="panel">
      <div className="panel-head">{label}</div>
      <div className="px-4 pb-3"><div className="shimmer w-full" style={{ height: h }} /></div>
    </section>
  );
}
