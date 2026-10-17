import React, { useEffect, useState } from 'react';
import { useApp } from '../store';
import type { CorrelationResult } from '../api';
import { HabitIcon } from '../lib/icons';

// What your own data says about how habits go together and what they do to your sleep.
// Hidden-until-ready would be confusing, so when data is thin it says what would unlock it.
export function PatternsPanel() {
  const { adapter, habits } = useApp();
  const [res, setRes] = useState<CorrelationResult | null>(null);

  useEffect(() => {
    let live = true;
    adapter?.getCorrelations().then((r) => live && setRes(r)).catch(() => live && setRes(null));
    return () => { live = false; };
  }, [adapter, habits]);

  if (!habits.length || !res) return null;
  const { found, needed } = res;
  const sleepShort = Math.max(0, 2 * needed.minGroup - needed.sleepDays);

  return (
    <section className="panel">
      <div className="panel-head">
        Patterns
        <span className="normal-case tracking-normal font-medium">last {res.span} days</span>
      </div>
      <div className="px-4 pb-3.5 flex flex-col gap-2.5">
        {found.length === 0 && (
          <p className="text-[12.5px] leading-snug text-ink-soft">
            {needed.trackedDays < needed.minPairDays
              ? `Patterns need about ${needed.minPairDays} tracked days. You have ${needed.trackedDays} so far.`
              : sleepShort > 0
                ? `Log your sleep on ${sleepShort} more day${sleepShort === 1 ? '' : 's'} to see how your habits line up with it. Nothing stands out between your habits yet.`
                : 'Nothing stands out yet. A pattern only shows when the gap is clear and there are at least '
                  + `${needed.minGroup} days on each side.`}
          </p>
        )}
        {found.map((c) => (
          <div key={`${c.kind}|${c.habitId}|${c.otherId ?? ''}`} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">
              {c.icon
                ? <HabitIcon name={c.icon} color={c.color} size={15} />
                : <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />}
            </span>
            <p className="text-[12.5px] leading-snug text-ink">
              {c.text}{' '}
              <span className="text-ink-soft">({c.nDone} vs {c.nMissed} days)</span>
            </p>
          </div>
        ))}
        {found.length > 0 && (
          <p className="text-[11px] text-ink-soft leading-snug">Patterns are not proof: two things going together doesn't mean one causes the other.</p>
        )}
      </div>
    </section>
  );
}
