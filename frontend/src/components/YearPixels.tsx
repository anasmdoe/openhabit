import React, { useEffect, useMemo, useState } from 'react';
import { useApp, today } from '../store';
import { addDays, fromISO } from '../lib/stats';
import type { WellnessDay } from '../lib/types';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MOOD_ALPHA = [0, 0.2, 0.38, 0.58, 0.8, 1]; // 1 = low ... 5 = high: brighter is better, no red
const MOOD_WORD = ['', 'low', 'down', 'okay', 'good', 'great'];

// A year of moods at a glance: one square per day (months down, days across), brighter = better mood.
export function YearPixels() {
  const { adapter, wellnessVersion } = useApp();
  const t = today();
  const [days, setDays] = useState<Map<string, WellnessDay>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const year = +t.slice(0, 4);

  useEffect(() => {
    if (!adapter) return;
    let live = true;
    adapter.getWellness(`${year}-01-01`, t)
      .then((rows) => { if (live) { setDays(new Map(rows.map((w) => [w.date, w]))); setLoaded(true); } })
      .catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [adapter, year, t, wellnessVersion]);

  const logged = useMemo(() => [...days.values()].filter((w) => w.mood != null).length, [days]);
  if (!loaded) return <section className="panel"><div className="panel-head">{year} in pixels</div><div className="px-4 pb-4"><div className="shimmer h-24 w-full" /></div></section>;

  const sel = picked ? days.get(picked) : null;
  return (
    <section className="panel">
      <div className="panel-head">
        {year} in pixels
        <span className="normal-case tracking-normal font-medium num">{logged} day{logged === 1 ? '' : 's'} logged</span>
      </div>
      <div className="px-4 pb-3 flex flex-col gap-2">
        {logged === 0 ? (
          <p className="text-[12.5px] text-ink-soft leading-snug">
            Log how you feel each day (the “How was today?” card) and the year fills in, one square a day.
          </p>
        ) : (
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: '14px repeat(31, minmax(0, 1fr))' }}>
            {MONTHS.map((m, mi) => {
              const dim = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
              return (
                <React.Fragment key={mi}>
                  <span className="text-[8.5px] text-ink-soft leading-none self-center">{m}</span>
                  {Array.from({ length: 31 }, (_, di) => {
                    if (di >= dim) return <span key={di} />;
                    const date = `${year}-${String(mi + 1).padStart(2, '0')}-${String(di + 1).padStart(2, '0')}`;
                    const w = days.get(date);
                    const future = date > t;
                    const mood = w?.mood ?? 0;
                    return (
                      <button
                        key={di}
                        onClick={() => setPicked(date === picked ? null : date)}
                        disabled={future}
                        aria-label={`${date}${mood ? `, mood ${mood} of 5` : ', no mood logged'}`}
                        className={`aspect-square rounded-[2px] ${date === t ? 'ring-1 ring-ink' : ''} ${date === picked ? 'ring-1 ring-mint' : ''}`}
                        style={{
                          background: mood ? `rgb(var(--mint) / ${MOOD_ALPHA[mood]})` : 'rgb(var(--forest-850))',
                          opacity: future ? 0.35 : 1,
                        }}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 min-h-5">
          <span className="text-[11px] text-ink-soft">
            {picked
              ? `${+picked.slice(8, 10)} ${fromISO(picked).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })}: ${sel?.mood ? `${MOOD_WORD[sel.mood]} (${sel.mood}/5)` : 'no mood logged'}${sel?.sleepHours != null ? ` · ${sel.sleepHours} h sleep` : ''}`
              : 'Tap a square for the day.'}
          </span>
          <span className="flex items-center gap-1 text-[9.5px] text-ink-soft shrink-0" aria-hidden>
            low
            {[1, 2, 3, 4, 5].map((m) => <span key={m} className="w-2.5 h-2.5 rounded-[2px]" style={{ background: `rgb(var(--mint) / ${MOOD_ALPHA[m]})` }} />)}
            high
          </span>
        </div>
      </div>
    </section>
  );
}
