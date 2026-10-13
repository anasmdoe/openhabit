import React, { useMemo, useState } from 'react';
import { useApp, today } from '../store';
import { Delta } from './StatsPanels';
import { entryLookup, recap, recapSentences } from '../lib/periodStats';
import { DAY_LETTERS } from '../lib/types';

const RANGES = [
  { id: 7, label: 'Week', words: 'week' },
  { id: 30, label: 'Month', words: 'month' },
] as const;

// "How did I do?": the last 7 or 30 days against the period before, with the best and
// weakest habit, the strongest weekday, and a few plain sentences.
export function RecapPanel() {
  const { habits, entries } = useApp();
  const [range, setRange] = useState<7 | 30>(7);
  const t = today();
  const r = useMemo(() => recap(habits, entryLookup(entries), range, t), [habits, entries, range, t]);
  const words = RANGES.find((x) => x.id === range)!.words;
  const weekdays = r.weekdays;
  if (!habits.length) return null;

  return (
    <section className="panel">
      <div className="panel-head">
        Recap
        <div className="seg" role="group" aria-label="Recap range">
          {RANGES.map((x) => (
            <button key={x.id} onClick={() => setRange(x.id)} aria-pressed={range === x.id}>{x.label}</button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 flex flex-col gap-3">
        {r.enough ? (
          <>
            <div className="flex items-end gap-3">
              <span className="num text-3xl font-bold leading-none">{r.current.pct}%</span>
              <span className="flex flex-col gap-0.5 pb-0.5">
                <span className="text-[11px] text-ink-soft">{r.current.done} of {r.current.goal} done · last {range} days</span>
                <Delta value={r.delta} vs={`the ${range} before`} />
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Highlight label="Went best" name={r.best?.name} pct={r.best?.pct} />
              <Highlight label="Most room" name={r.weakest?.name} pct={r.weakest?.pct} muted />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">By weekday · last 4 weeks</div>
              <div className="flex items-end gap-1.5 h-14" role="img"
                aria-label={`Completion by weekday: ${weekdays.map((w) => `${DAY_LETTERS[w.dow]} ${w.pct ?? 'no data'}`).join(', ')}`}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const w = weekdays[d];
                  const isBest = r.bestDay?.dow === d;
                  const isWeak = r.weakestDay?.dow === d;
                  return (
                    <div key={d} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <div
                        className="w-full rounded-sm"
                        style={{
                          height: `${Math.max(w.pct ?? 0, 4)}%`,
                          background: isBest ? 'rgb(var(--mint))' : 'rgb(var(--forest-700))',
                          opacity: isWeak ? 0.55 : 1,
                        }}
                        title={w.pct === null ? 'no data' : `${w.pct}%`}
                      />
                      <span className={`text-[9.5px] ${isBest ? 'text-mint font-semibold' : 'text-ink-soft'}`}>{DAY_LETTERS[d]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
        <p className="text-[12.5px] leading-snug text-ink">
          {recapSentences(r, words).join(' ')}
          {r.enough && r.perfectDays > 0 && ` ${r.perfectDays} perfect day${r.perfectDays === 1 ? '' : 's'}.`}
        </p>
      </div>
    </section>
  );
}

function Highlight({ label, name, pct, muted }: { label: string; name?: string; pct?: number | null; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.14em] text-ink-soft">{label}</div>
      {name ? (
        <>
          <div className="text-[13px] font-semibold truncate">{name}</div>
          <div className={`num text-[11px] ${muted ? 'text-ink-soft' : 'text-mint'}`}>{pct}%</div>
        </>
      ) : (
        <div className="text-[12px] text-ink-soft mt-0.5">—</div>
      )}
    </div>
  );
}
