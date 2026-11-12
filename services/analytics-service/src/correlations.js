// Patterns in your own data: which habits go with longer sleep, and which habits go together.
// Pure: callers build `days` ([{ date, done: { [habitId]: true|false (absent = not scheduled / skipped) }, sleep, mood }]).
// Mirrored in frontend/src/lib/correlations.ts. A pattern is reported only when both groups are big enough
// AND the gap is both practically meaningful and statistically clear (|t| or |z| >= 2).

export const MIN_GROUP = 8; // days in each of the two groups
export const MIN_PAIR_DAYS = 20; // days both habits were scheduled
const MIN_SLEEP_DIFF_H = 0.25; // 15 minutes
const MIN_RATE_DIFF = 15; // percentage points
const T_CUTOFF = 2;
const MAX_RESULTS = 8;

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const variance = (a, m) => (a.length > 1 ? a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) : 0);
const round1 = (n) => Math.round(n * 10) / 10;

// Welch's t statistic
function welch(a, b) {
  const ma = mean(a), mb = mean(b);
  const se = Math.sqrt(variance(a, ma) / a.length + variance(b, mb) / b.length);
  if (se === 0) return ma === mb ? 0 : Math.sign(ma - mb) * 99; // no spread at all: a clean split
  return (ma - mb) / se;
}

// two-proportion z statistic (pooled)
function twoProp(k1, n1, k2, n2) {
  const p = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se === 0 ? 0 : (k1 / n1 - k2 / n2) / se;
}

const fmtMinutes = (h) => {
  const m = Math.round(Math.abs(h) * 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`.replace(' 00m', '') : `${m} minutes`;
};

export function correlations(habits, days) {
  const out = [];
  const quit = new Map(habits.map((h) => [h.id, h.kind === 'quit']));

  for (const h of habits) {
    const done = [], missed = [];
    for (const d of days) {
      if (d.sleep == null || d.done[h.id] === undefined) continue;
      (d.done[h.id] ? done : missed).push(d.sleep);
    }
    if (done.length < MIN_GROUP || missed.length < MIN_GROUP) continue;
    const diff = mean(done) - mean(missed);
    const t = welch(done, missed);
    if (Math.abs(diff) < MIN_SLEEP_DIFF_H || Math.abs(t) < T_CUTOFF) continue;
    const lead = quit.get(h.id) ? `On days without ${h.name}` : `On days you do ${h.name}`;
    out.push({
      kind: 'sleep', habitId: h.id, name: h.name, color: h.color, icon: h.icon,
      diff: round1(diff), score: Math.abs(t), nDone: done.length, nMissed: missed.length,
      text: `${lead} you sleep ${fmtMinutes(diff)} ${diff > 0 ? 'longer' : 'less'} (${round1(mean(done))}h vs ${round1(mean(missed))}h).`,
    });
  }

  const seenPair = new Set();
  for (const a of habits) {
    for (const b of habits) {
      if (a.id === b.id) continue;
      let both = 0, aDone = 0, aDoneB = 0, aMiss = 0, aMissB = 0;
      for (const d of days) {
        const x = d.done[a.id], y = d.done[b.id];
        if (x === undefined || y === undefined) continue;
        both += 1;
        if (x) { aDone += 1; if (y) aDoneB += 1; } else { aMiss += 1; if (y) aMissB += 1; }
      }
      if (both < MIN_PAIR_DAYS || aDone < MIN_GROUP || aMiss < MIN_GROUP) continue;
      const lift = Math.round((aDoneB / aDone - aMissB / aMiss) * 100);
      const z = twoProp(aDoneB, aDone, aMissB, aMiss);
      if (Math.abs(lift) < MIN_RATE_DIFF || Math.abs(z) < T_CUTOFF) continue;
      const key = [a.id, b.id].sort().join('|');
      const existing = out.find((o) => o.kind === 'pair' && o.key === key);
      if (seenPair.has(key) && existing && existing.score >= Math.abs(z)) continue;
      seenPair.add(key);
      const entry = {
        kind: 'pair', key, habitId: a.id, otherId: b.id, name: a.name, otherName: b.name,
        color: a.color, icon: a.icon, diff: lift, score: Math.abs(z), nDone: aDone, nMissed: aMiss,
        text: `${quit.get(a.id) ? `On days without ${a.name}` : `On days you do ${a.name}`}, you ${quit.get(b.id) ? 'also stay clear of' : 'also do'} ${b.name} ${aDoneB}/${aDone} times, vs ${aMissB}/${aMiss} otherwise.`,
      };
      if (existing) out.splice(out.indexOf(existing), 1);
      out.push(entry);
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, MAX_RESULTS).map(({ key, score, ...rest }) => ({ ...rest, strength: round1(score) }));
}

/** What is still missing before any pattern can show (so the UI can say it out loud). */
export function dataNeeded(habits, days) {
  const sleepDays = days.filter((d) => d.sleep != null).length;
  const trackedDays = days.filter((d) => Object.keys(d.done).length > 0).length;
  return { sleepDays, trackedDays, minGroup: MIN_GROUP, minPairDays: MIN_PAIR_DAYS };
}
