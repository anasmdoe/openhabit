import React from 'react';
import { useApp } from '../store';
import { HabitIcon } from '../lib/icons';

// Wellness × habit correlations: what your own data says about you.
export function InsightsPanel() {
  const { insights, habits } = useApp();
  const quitIds = new Set(habits.filter((h) => h.kind === 'quit').map((h) => h.id));
  if (!insights) return null;
  const mood = insights.moodImpact.slice(0, 3);
  const sleep = insights.sleepCompletion.filter((b) => b.pct != null && b.days >= 10);
  if (!mood.length && sleep.length < 2) return null; // not enough data yet

  return (
    <section className="panel">
      <div className="panel-head">
        Insights
        <span className="normal-case tracking-normal font-medium">last {insights.span} days</span>
      </div>
      <div className="px-4 pb-3.5 flex flex-col gap-2.5">
        {mood.map((m) => (
          <div key={m.habitId} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">
              {m.icon
                ? <HabitIcon name={m.icon} color={m.color} size={15} />
                : <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />}
            </span>
            <p className="text-[12.5px] leading-snug text-ink">
              {quitIds.has(m.habitId) ? 'On days without' : 'On days you complete'}{' '}
              <span className="font-semibold">{m.name}</span>, your mood averages{' '}
              <span className="num font-semibold text-mint">{m.avgMoodDone}</span> vs{' '}
              <span className="num font-semibold text-ink-soft">{m.avgMoodMissed}</span>{' '}
              {quitIds.has(m.habitId) ? 'when you slip' : "when you don't"}
              {m.diff < 0 ? ' — interesting, it runs the other way' : ''}.
            </p>
          </div>
        ))}
        {sleep.length >= 2 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-line">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">Completion by sleep</span>
            {sleep.map((b) => (
              <span key={b.id} className="text-[12px] text-ink">
                {b.label}: <span className="num font-semibold text-mint">{b.pct}%</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
