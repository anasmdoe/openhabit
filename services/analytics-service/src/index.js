import express from 'express';
import pg from 'pg';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3003;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://openhabit:openhabit@localhost:5432/openhabit',
  max: 10,
});

const app = express();
app.use(metricsMiddleware('analytics-service'));

// ---- auth: verify JWTs issued by auth-service (shared JWT_SECRET) ------
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || /change-me/i.test(JWT_SECRET)) {
  console.error('FATAL: JWT_SECRET must be a random string of at least 32 characters, shared by all services (e.g. `openssl rand -base64 48`).');
  process.exit(1);
}

function verifyToken(token) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const raw = h.startsWith('Bearer ') ? h.slice(7) : null;

  // personal API token (long-lived, "oh_" prefix)
  if (raw && raw.startsWith('oh_')) {
    try {
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      const { rows } = await pool.query(
        `SELECT t.id AS tid, u.id, u.email FROM api_tokens t
         JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1`,
        [hash]
      );
      if (!rows.length) return res.status(401).json({ error: 'unauthorized' });
      req.userId = rows[0].id;
      req.email = rows[0].email;
      req.authMethod = 'token';
      // touch last_used_at at most once a minute (fire-and-forget)
      pool.query(
        `UPDATE api_tokens SET last_used_at = now()
         WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '60 seconds')`,
        [rows[0].tid]
      ).catch(() => {});
      return next();
    } catch (e) {
      return next(e);
    }
  }

  // session JWT
  const payload = verifyToken(raw);
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.userId = payload.sub;
  req.email = payload.email;
  req.authMethod = 'jwt';
  next();
}

const asyncH = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---- date helpers (UTC-date-string math) --------------------------------
const iso = (d) => d.toISOString().slice(0, 10);
const fromISO = (s) => new Date(`${s}T00:00:00Z`);
const addDays = (s, n) => { const d = fromISO(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = (s) => fromISO(s).getUTCDay();
const todayISO = () => iso(new Date());
const monthRange = (year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endD = new Date(Date.UTC(year, month, 0));
  return { start, end: iso(endD), daysInMonth: endD.getUTCDate() };
};
const weekKey = (s) => { // Monday-start week bucket
  const d = fromISO(s);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
};

// ---- semantics -----------------------------------------------------------
// value === -1  => SKIP: day excused; streak preserved; removed from goals
const SKIP = -1;
const isSkip = (v) => v === SKIP;

function isCompleted(habit, value) {
  if (value == null || isSkip(value)) return false;
  if (habit.type === 'boolean') return value >= 1;
  return habit.targetType === 'at_most' ? value <= habit.target : value >= habit.target;
}

const isFixedDay = (h) => h.scheduleType !== 'per_week';
const isScheduled = (habit, dateStr) =>
  isFixedDay(habit) && habit.activeDays.includes(dow(dateStr)) && dateStr >= habit.createdDate;

// prorated weekly quota for a segment of `segDays` days
const quotaFor = (freq, segDays) => Math.max(1, Math.round((freq * segDays) / 7));

async function loadHabits(userId) {
  const { rows } = await pool.query(
    `SELECT h.id, h.name, h.question, h.type, h.unit, h.target::float AS target,
            h.target_type AS "targetType", h.color, h.icon,
            h.schedule_type AS "scheduleType", h.frequency, h.active_days AS "activeDays",
            h.position,
            to_char(LEAST(h.created_at::date, COALESCE(MIN(e.date), h.created_at::date)), 'YYYY-MM-DD') AS "createdDate"
     FROM habits h
     LEFT JOIN entries e ON e.habit_id = h.id
     WHERE h.user_id = $1 AND NOT h.archived
     GROUP BY h.id
     ORDER BY h.position, h.created_at`,
    [userId]
  );
  return rows;
}

async function loadEntries(userId, from, to, habitId = null) {
  const params = [from, to, userId];
  let sql = `SELECT e.habit_id AS "habitId", to_char(e.date,'YYYY-MM-DD') AS date, e.value::float AS value
             FROM entries e JOIN habits h ON h.id = e.habit_id AND h.user_id = $3
             WHERE e.date BETWEEN $1 AND $2`;
  if (habitId) { params.push(habitId); sql += ' AND e.habit_id = $4'; }
  const { rows } = await pool.query(sql, params);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.habitId)) map.set(r.habitId, new Map());
    map.get(r.habitId).set(r.date, r.value);
  }
  return map;
}

app.get('/metrics', await metricsHandler(pool, 'analytics-service'));

app.get('/healthz', asyncH(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'analytics-service' });
}));


// ---- group dashboard helpers --------------------------------------------
async function memberRole(groupId, userId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  return rows.length > 0;
}

// current streak for a single habit from its date->value map (skip-aware, per_week-aware)
function quickStreak(habit, valById) {
  const today = todayISO();
  if (!isFixedDay(habit)) {
    const cnt = new Map();
    let d = today;
    for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
      const v = valById.get(d);
      if (v != null && isCompleted(habit, v)) cnt.set(weekKey(d), (cnt.get(weekKey(d)) ?? 0) + 1);
    }
    let streak = 0;
    let wk = weekKey(today);
    if ((cnt.get(wk) ?? 0) >= habit.frequency) streak += 1;
    for (wk = addDays(wk, -7); ; wk = addDays(wk, -7)) {
      if ((cnt.get(wk) ?? 0) >= habit.frequency) streak += 1; else break;
      if (streak > 60) break;
    }
    return streak;
  }
  let streak = 0;
  let d = today;
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    if (!habit.activeDays.includes(dow(d))) continue;
    const v = valById.get(d);
    if (isSkip(v)) continue;
    if (v != null && isCompleted(habit, v)) streak += 1;
    else if (d === today) continue;
    else break;
  }
  return streak;
}

const isSkipVal = isSkip; // alias for clarity

// combined walk for a group habit. Day states:
//   complete  — every member required that day responded, >=1 done  (streak +1)
//   excused   — everyone responded but all skipped                   (streak kept)
//   broken    — a past day where someone required didn't respond     (streak reset)
//   pending   — today, not everyone in yet                           (streak kept)
// Members are only "required" from their join date onward.
function walkGroupHabit(habit, members, entriesByDate, today, fromCap) {
  const from = habit.createdDate > fromCap ? habit.createdDate : fromCap;
  let streak = 0;
  const crossings = [];
  const states = new Map(); // date -> state
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const required = members.filter((m) => m.joinedDate <= d);
    if (!required.length) continue;
    const day = entriesByDate.get(d) ?? new Map();
    let done = 0, skip = 0;
    for (const m of required) {
      const v = day.get(m.id);
      if (v != null && v >= 1) done += 1;
      else if (v === -1) skip += 1;
    }
    const responded = done + skip;
    let state;
    if (responded < required.length) state = d === today ? 'pending' : 'broken';
    else if (done >= 1) state = 'complete';
    else state = 'excused';
    states.set(d, state);
    if (state === 'complete') {
      streak += 1;
      if (DAY_MILESTONES.includes(streak)) crossings.push({ milestone: streak, unit: 'days', date: d });
    } else if (state === 'broken') {
      streak = 0;
    }
    // excused & pending leave the streak untouched
  }
  return { streak, states, crossings };
}

// streak-milestone crossings within the last `windowDays`
const DAY_MILESTONES = [7, 30, 100, 365];
const WEEK_MILESTONES = [4, 12, 26, 52];

function milestoneCrossings(habit, valById, windowDays = 14) {
  const today = todayISO();
  const cutoff = addDays(today, -windowDays);
  const from = habit.createdDate > addDays(today, -400) ? habit.createdDate : addDays(today, -400);
  const out = [];

  if (isFixedDay(habit)) {
    let count = 0;
    for (let d = from; d <= today; d = addDays(d, 1)) {
      if (!habit.activeDays.includes(dow(d)) || d < habit.createdDate) continue;
      const v = valById.get(d);
      if (isSkip(v)) continue;
      if (v != null && isCompleted(habit, v)) {
        count += 1;
        if (DAY_MILESTONES.includes(count) && d >= cutoff) {
          out.push({ milestone: count, unit: 'days', date: d });
        }
      } else {
        count = 0;
      }
    }
  } else {
    const cnt = new Map();
    for (const [d, v] of valById) {
      if (v != null && isCompleted(habit, v)) cnt.set(weekKey(d), (cnt.get(weekKey(d)) ?? 0) + 1);
    }
    const thisWeek = weekKey(today);
    let count = 0;
    for (let wk = weekKey(from); wk <= thisWeek; wk = addDays(wk, 7)) {
      const met = (cnt.get(wk) ?? 0) >= habit.frequency;
      if (wk === thisWeek && !met) break; // current week in progress never breaks
      if (met) {
        count += 1;
        if (WEEK_MILESTONES.includes(count) && wk >= cutoff) {
          out.push({ milestone: count, unit: 'weeks', date: wk });
        }
      } else {
        count = 0;
      }
    }
  }
  return out;
}

app.use(auth);

// ==========================================================================
// GET /analytics/overview?year&month
// ==========================================================================
app.get('/analytics/overview', asyncH(async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getUTCFullYear();
  const month = parseInt(req.query.month, 10) || now.getUTCMonth() + 1;
  if (month < 1 || month > 12 || year < 2000 || year > 2100)
    return res.status(400).json({ error: 'invalid year/month' });

  const { start, end, daysInMonth } = monthRange(year, month);
  const today = todayISO();
  const [habits, entryMap] = await Promise.all([loadHabits(req.userId), loadEntries(req.userId, start, end)]);

  const days = [];
  const weeks = new Map(); // weekIdx -> {scheduled, completed}
  const weekCount = Math.ceil(daysInMonth / 7);
  for (let w = 1; w <= weekCount; w++) weeks.set(w, { scheduled: 0, completed: 0 });

  let goal = 0, completedTotal = 0;
  const perHabit = habits.map((h) => ({
    h, goal: 0, actual: 0, sum: 0,
    weekCnt: new Map(), // per_week: completions per weekIdx
  }));

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = addDays(start, d - 1);
    const weekIdx = Math.floor((d - 1) / 7) + 1;
    let scheduled = 0, completed = 0;
    for (const p of perHabit) {
      const value = entryMap.get(p.h.id)?.get(dateStr);
      if (value != null && !isSkip(value) && p.h.type === 'numeric' && value >= 0) p.sum += value;
      if (!isFixedDay(p.h)) {
        // flexible: count completions per week; day loop doesn't schedule them
        if (isCompleted(p.h, value) && dateStr >= p.h.createdDate) {
          p.weekCnt.set(weekIdx, (p.weekCnt.get(weekIdx) ?? 0) + 1);
        }
        continue;
      }
      if (!isScheduled(p.h, dateStr)) continue;
      if (isSkip(value)) continue; // skipped: excused entirely
      p.goal += 1;
      goal += 1;
      scheduled += 1;
      if (isCompleted(p.h, value)) {
        completed += 1;
        completedTotal += 1;
        p.actual += 1;
      }
    }
    const w = weeks.get(weekIdx);
    w.scheduled += scheduled;
    w.completed += completed;
    days.push({
      date: dateStr, dow: dow(dateStr), scheduled, completed,
      pct: scheduled ? Math.round((completed / scheduled) * 100) : null,
      isFuture: dateStr > today,
    });
  }

  // fold per_week habits into weekly + habit goals
  for (const p of perHabit) {
    if (isFixedDay(p.h)) continue;
    if (p.h.createdDate > end) continue;
    for (let w = 1; w <= weekCount; w++) {
      const segDays = Math.min(7, daysInMonth - (w - 1) * 7);
      const quota = quotaFor(p.h.frequency, segDays);
      const got = Math.min(p.weekCnt.get(w) ?? 0, quota);
      p.goal += quota;
      p.actual += got;
      goal += quota;
      completedTotal += got;
      const wk = weeks.get(w);
      wk.scheduled += quota;
      wk.completed += got;
    }
  }

  const habitsOut = perHabit.map((p) => ({
    id: p.h.id, name: p.h.name, color: p.h.color, icon: p.h.icon, type: p.h.type, unit: p.h.unit,
    target: p.h.target, activeDays: p.h.activeDays,
    scheduleType: p.h.scheduleType, frequency: p.h.frequency,
    goal: p.goal, actual: p.actual, left: Math.max(0, p.goal - p.actual),
    sum: Math.round(p.sum * 10) / 10,
    pct: p.goal ? Math.round((p.actual / p.goal) * 100) : 0,
  }));

  const wellnessRows = await pool.query(
    `SELECT to_char(date,'YYYY-MM-DD') AS date, mood, sleep_hours::float AS "sleepHours"
     FROM wellness WHERE user_id = $3 AND date BETWEEN $1 AND $2 ORDER BY date`,
    [start, end, req.userId]
  );

  res.json({
    year, month, start, end, daysInMonth,
    goal, completed: completedTotal, left: Math.max(0, goal - completedTotal),
    overallPct: goal ? Math.round((completedTotal / goal) * 100) : 0,
    days,
    weeks: [...weeks.entries()].map(([week, w]) => ({
      week, pct: w.scheduled ? Math.round((w.completed / w.scheduled) * 100) : 0,
    })),
    habits: habitsOut,
    topHabits: [...habitsOut].sort((a, b) => b.pct - a.pct).slice(0, 10)
      .map(({ id, name, color, pct }) => ({ id, name, color, pct })),
    wellness: wellnessRows.rows,
  });
}));

// ==========================================================================
// GET /analytics/habits/:id
// ==========================================================================
app.get('/analytics/habits/:id', asyncH(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT h.id, h.name, h.question, h.type, h.unit, h.target::float AS target, h.target_type AS "targetType",
            h.color, h.icon, h.schedule_type AS "scheduleType", h.frequency, h.active_days AS "activeDays",
            to_char(LEAST(h.created_at::date, COALESCE(MIN(e.date), h.created_at::date)), 'YYYY-MM-DD') AS "createdDate"
     FROM habits h
     LEFT JOIN entries e ON e.habit_id = h.id
     WHERE h.id = $1 AND h.user_id = $2
     GROUP BY h.id`,
    [req.params.id, req.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'habit not found' });
  const habit = rows[0];
  const today = todayISO();
  const from = habit.createdDate < addDays(today, -365) ? addDays(today, -365) : habit.createdDate;
  const entryMap = (await loadEntries(req.userId, from, today, habit.id)).get(habit.id) || new Map();

  let streaks = [];
  let currentStreak = 0;
  const wd = Array.from({ length: 7 }, () => ({ scheduled: 0, completed: 0 }));
  const scoreSeries = [];

  if (isFixedDay(habit)) {
    let cur = null;
    let score = 0;
    const DECAY = Math.pow(0.5, 1 / 13);
    for (let d = from; d <= today; d = addDays(d, 1)) {
      if (!isScheduled(habit, d)) continue;
      const value = entryMap.get(d);
      if (isSkip(value)) continue; // excused: streak and score untouched
      const done = isCompleted(habit, value);
      wd[dow(d)].scheduled += 1;
      if (done) {
        wd[dow(d)].completed += 1;
        if (!cur) cur = { start: d, end: d, length: 1 };
        else { cur.end = d; cur.length += 1; }
      } else if (cur) {
        streaks.push(cur);
        cur = null;
      }
      score = score * DECAY + (done ? 1 - DECAY : 0);
      scoreSeries.push({ date: d, score: Math.round(score * 1000) / 10 });
    }
    if (cur) streaks.push(cur);
    currentStreak = cur ? cur.length : 0;
  } else {
    // per_week: streaks measured in weeks meeting the quota
    const W = Math.pow(0.5, 1 / 4);
    let score = 0;
    let cur = null;
    const thisWeek = weekKey(today);
    const cnt = new Map();
    for (const [d, v] of entryMap) {
      if (isCompleted(habit, v)) cnt.set(weekKey(d), (cnt.get(weekKey(d)) ?? 0) + 1);
      if (isCompleted(habit, v)) wd[dow(d)].completed += 1;
    }
    for (let wk = weekKey(from); wk <= thisWeek; wk = addDays(wk, 7)) {
      const met = (cnt.get(wk) ?? 0) >= habit.frequency;
      if (wk === thisWeek) {
        // current week is still in progress: extends but never breaks
        if (met) {
          if (!cur) cur = { start: wk, end: wk, length: 1 };
          else { cur.end = wk; cur.length += 1; }
          score = score * W + (1 - W);
          scoreSeries.push({ date: wk, score: Math.round(score * 1000) / 10 });
        }
        break;
      }
      if (met) {
        if (!cur) cur = { start: wk, end: wk, length: 1 };
        else { cur.end = wk; cur.length += 1; }
      } else if (cur) {
        streaks.push(cur);
        cur = null;
      }
      score = score * W + (met ? 1 - W : 0);
      scoreSeries.push({ date: wk, score: Math.round(score * 1000) / 10 });
    }
    if (cur) streaks.push(cur);
    currentStreak = cur ? cur.length : 0;
    // weekday frequency for flexible habits: relative distribution
    const maxCnt = Math.max(1, ...wd.map((x) => x.completed));
    wd.forEach((x) => { x.scheduled = maxCnt; });
  }

  const hist = new Map();
  for (const [date, value] of entryMap) {
    if (isSkip(value)) continue;
    const key = date.slice(0, 7);
    if (!hist.has(key)) hist.set(key, { completions: 0, sum: 0 });
    const h = hist.get(key);
    if (isCompleted(habit, value)) h.completions += 1;
    if (habit.type === 'numeric' && value >= 0) h.sum += value;
  }

  res.json({
    habit,
    streakUnit: isFixedDay(habit) ? 'days' : 'weeks',
    currentStreak,
    bestStreaks: [...streaks].sort((a, b) => b.length - a.length).slice(0, 5),
    weekdayFrequency: wd.map((w, i) => ({
      dow: i,
      pct: w.scheduled ? Math.round((w.completed / w.scheduled) * 100) : 0,
    })),
    history: [...hist.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, h]) => ({ month, completions: h.completions, sum: Math.round(h.sum * 10) / 10 })),
    scoreSeries: isFixedDay(habit)
      ? scoreSeries.filter((_, i) => i % 3 === 0 || i === scoreSeries.length - 1)
      : scoreSeries,
    entries: [...entryMap.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  });
}));

// ==========================================================================
// GET /analytics/insights?days=90 — wellness × habit correlations
// ==========================================================================
app.get('/analytics/insights', asyncH(async (req, res) => {
  const span = Math.min(365, Math.max(14, parseInt(req.query.days, 10) || 90));
  const today = todayISO();
  const from = addDays(today, -(span - 1));
  const [habits, entryMap] = await Promise.all([loadHabits(req.userId), loadEntries(req.userId, from, today)]);
  const { rows: wellness } = await pool.query(
    `SELECT to_char(date,'YYYY-MM-DD') AS date, mood, sleep_hours::float AS "sleepHours"
     FROM wellness WHERE user_id = $3 AND date BETWEEN $1 AND $2`,
    [from, today, req.userId]
  );
  const moodByDate = new Map(wellness.filter((w) => w.mood != null).map((w) => [w.date, w.mood]));
  const sleepByDate = new Map(wellness.filter((w) => w.sleepHours != null).map((w) => [w.date, w.sleepHours]));

  // mood on done vs missed days, per habit (fixed-day habits: scheduled basis;
  // flexible: done days vs other tracked-mood days)
  const moodImpact = [];
  for (const h of habits) {
    let doneSum = 0, doneN = 0, missSum = 0, missN = 0;
    for (let d = from; d <= today; d = addDays(d, 1)) {
      const mood = moodByDate.get(d);
      if (mood == null || d < h.createdDate) continue;
      const value = entryMap.get(h.id)?.get(d);
      if (isSkip(value)) continue;
      const done = isCompleted(h, value);
      if (isFixedDay(h) && !h.activeDays.includes(dow(d))) continue;
      if (done) { doneSum += mood; doneN += 1; }
      else { missSum += mood; missN += 1; }
    }
    if (doneN >= 5 && missN >= 5) {
      const avgDone = doneSum / doneN;
      const avgMiss = missSum / missN;
      moodImpact.push({
        habitId: h.id, name: h.name, color: h.color, icon: h.icon,
        avgMoodDone: Math.round(avgDone * 10) / 10,
        avgMoodMissed: Math.round(avgMiss * 10) / 10,
        diff: Math.round((avgDone - avgMiss) * 10) / 10,
        nDone: doneN, nMissed: missN,
      });
    }
  }
  moodImpact.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // completion rate by sleep bucket (fixed-day habits, non-skipped scheduled days)
  const buckets = [
    { id: 'short', label: 'under 6h', min: 0, max: 6, scheduled: 0, completed: 0 },
    { id: 'ok', label: '6–7.5h', min: 6, max: 7.5, scheduled: 0, completed: 0 },
    { id: 'good', label: '7.5h or more', min: 7.5, max: 25, scheduled: 0, completed: 0 },
  ];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const sleep = sleepByDate.get(d);
    if (sleep == null) continue;
    const bucket = buckets.find((b) => sleep >= b.min && sleep < b.max);
    if (!bucket) continue;
    for (const h of habits) {
      if (!isScheduled(h, d)) continue;
      const value = entryMap.get(h.id)?.get(d);
      if (isSkip(value)) continue;
      bucket.scheduled += 1;
      if (isCompleted(h, value)) bucket.completed += 1;
    }
  }

  res.json({
    span,
    moodImpact: moodImpact.slice(0, 5),
    sleepCompletion: buckets.map((b) => ({
      id: b.id, label: b.label, days: b.scheduled,
      pct: b.scheduled ? Math.round((b.completed / b.scheduled) * 100) : null,
    })),
  });
}));


// ==========================================================================
// GET /analytics/groups/:id  — dashboard of shared habits across members
// ==========================================================================
app.get('/analytics/groups/:id', asyncH(async (req, res) => {
  const groupId = req.params.id;
  if (!(await memberRole(groupId, req.userId)))
    return res.status(403).json({ error: 'not a member' });

  const now = new Date();
  const { start, end } = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const today = todayISO();
  const windowStart = addDays(today, -400); // enough for streaks

  // shared habits in this group, with their owners
  const { rows: shared } = await pool.query(
    `SELECT h.id, h.name, h.color, h.icon, h.type, h.unit, h.target::float AS target,
            h.target_type AS "targetType", h.schedule_type AS "scheduleType",
            h.frequency, h.active_days AS "activeDays", h.user_id AS "userId",
            to_char(LEAST(h.created_at::date, COALESCE(MIN(e.date), h.created_at::date)),'YYYY-MM-DD') AS "createdDate"
     FROM habit_shares hs
     JOIN habits h ON h.id = hs.habit_id AND NOT h.archived
     LEFT JOIN entries e ON e.habit_id = h.id
     WHERE hs.group_id = $1
     GROUP BY h.id`,
    [groupId]
  );

  const { rows: members } = await pool.query(
    `SELECT u.id, u.name, u.email FROM group_members gm
     JOIN users u ON u.id = gm.user_id WHERE gm.group_id = $1 ORDER BY gm.joined_at`,
    [groupId]
  );

  // reaction counts within this group, keyed by to_user|habit
  const { rows: reacts } = await pool.query(
    `SELECT to_user AS "toUser", habit_id AS "habitId", emoji, count(*)::int AS n
     FROM reactions WHERE group_id = $1 GROUP BY to_user, habit_id, emoji`,
    [groupId]
  );
  const reactKey = (u, h) => `${u}|${h}`;
  const reactMap = new Map();
  for (const r of reacts) {
    const k = reactKey(r.toUser, r.habitId);
    if (!reactMap.has(k)) reactMap.set(k, []);
    reactMap.get(k).push({ emoji: r.emoji, n: r.n });
  }

  // entries for all shared habits in one query
  const habitIds = shared.map((h) => h.id);
  let entriesByHabit = new Map();
  if (habitIds.length) {
    const { rows: ent } = await pool.query(
      `SELECT habit_id AS "habitId", to_char(date,'YYYY-MM-DD') AS date, value::float AS value
       FROM entries WHERE habit_id = ANY($1) AND date BETWEEN $2 AND $3`,
      [habitIds, windowStart, today]
    );
    for (const e of ent) {
      if (!entriesByHabit.has(e.habitId)) entriesByHabit.set(e.habitId, new Map());
      entriesByHabit.get(e.habitId).set(e.date, e.value);
    }
  }

  // build per-member payload
  const milestones = [];
  const memberOut = members.map((m) => {
    const myHabits = shared.filter((h) => h.userId === m.id);
    let goal = 0, done = 0, todayScheduled = 0, todayDone = 0;
    const habitsOut = myHabits.map((h) => {
      const valById = entriesByHabit.get(h.id) ?? new Map();
      // month goal/actual (fixed-day only counts scheduled; per_week uses quota)
      let hGoal = 0, hActual = 0;
      if (isFixedDay(h)) {
        for (let d = start; d <= end && d <= today; d = addDays(d, 1)) {
          if (!h.activeDays.includes(dow(d)) || d < h.createdDate) continue;
          const v = valById.get(d);
          if (isSkip(v)) continue;
          hGoal += 1;
          if (isCompleted(h, v)) hActual += 1;
        }
      } else {
        // approximate: quota per ISO week overlapping the month
        const weeks = new Set();
        for (let d = start; d <= end && d <= today; d = addDays(d, 1)) weeks.add(weekKey(d));
        for (const wk of weeks) {
          let c = 0;
          for (let i = 0; i < 7; i++) { const v = valById.get(addDays(wk, i)); if (v != null && isCompleted(h, v)) c++; }
          hGoal += h.frequency;
          hActual += Math.min(c, h.frequency);
        }
      }
      goal += hGoal; done += hActual;

      // today
      const scheduledToday = isFixedDay(h) ? h.activeDays.includes(dow(today)) : true;
      const todayVal = valById.get(today);
      if (scheduledToday && !isSkip(todayVal)) {
        todayScheduled += 1;
        if (isCompleted(h, todayVal)) todayDone += 1;
      }

      // last 7 days strip (done / skip / miss / off)
      const strip = [];
      for (let i = 6; i >= 0; i--) {
        const d = addDays(today, -i);
        const v = valById.get(d);
        let st = 'off';
        if (isSkip(v)) st = 'skip';
        else if (v != null && isCompleted(h, v)) st = 'done';
        else if (isFixedDay(h) ? h.activeDays.includes(dow(d)) : true) st = (d <= today ? 'miss' : 'off');
        strip.push(st);
      }

      for (const cr of milestoneCrossings(h, valById)) {
        milestones.push({
          userId: m.id,
          name: m.name || m.email.split('@')[0],
          habitId: h.id, habitName: h.name, color: h.color, icon: h.icon,
          ...cr,
        });
      }

      return {
        id: h.id, name: h.name, color: h.color, icon: h.icon, unit: h.unit,
        scheduleType: h.scheduleType, frequency: h.frequency,
        streak: quickStreak(h, valById),
        monthPct: hGoal ? Math.round((hActual / hGoal) * 100) : 0,
        strip,
        reactions: reactMap.get(reactKey(m.id, h.id)) ?? [],
      };
    });

    return {
      userId: m.id,
      name: m.name || m.email.split('@')[0],
      email: m.email,
      isMe: m.id === req.userId,
      sharedCount: myHabits.length,
      todayPct: todayScheduled ? Math.round((todayDone / todayScheduled) * 100) : null,
      monthPct: goal ? Math.round((done / goal) * 100) : null,
      habits: habitsOut,
    };
  });

  // leaderboard: by month completion of shared habits (members who share nothing sink to bottom)
  const leaderboard = [...memberOut]
    .filter((m) => m.sharedCount > 0)
    .sort((a, b) => (b.monthPct ?? 0) - (a.monthPct ?? 0))
    .map((m) => ({ userId: m.userId, name: m.name, monthPct: m.monthPct ?? 0 }));

  // ---- shared group habits ----
  const { rows: gHabits } = await pool.query(
    `SELECT gh.id, gh.name, gh.question, gh.icon, gh.color, gh.created_by AS "createdBy",
            to_char(gh.created_at::date, 'YYYY-MM-DD') AS "createdDate"
     FROM group_habits gh WHERE gh.group_id = $1 ORDER BY gh.created_at`,
    [groupId]
  );
  const memberJoin = members.map((m) => ({
    id: m.id,
    name: m.name || m.email.split('@')[0],
    joinedDate: null, // filled below
  }));
  if (gHabits.length) {
    const { rows: joins } = await pool.query(
      `SELECT user_id AS id, to_char(joined_at::date, 'YYYY-MM-DD') AS jd
       FROM group_members WHERE group_id = $1`,
      [groupId]
    );
    const jd = new Map(joins.map((j) => [j.id, j.jd]));
    for (const m of memberJoin) m.joinedDate = jd.get(m.id) ?? today;
  }

  const sharedHabits = [];
  for (const gh of gHabits) {
    const { rows: ent } = await pool.query(
      `SELECT user_id AS "userId", to_char(date,'YYYY-MM-DD') AS date, value::float AS value
       FROM group_habit_entries WHERE group_habit_id = $1 AND date BETWEEN $2 AND $3`,
      [gh.id, windowStart, today]
    );
    const byDate = new Map();
    for (const e of ent) {
      if (!byDate.has(e.date)) byDate.set(e.date, new Map());
      byDate.get(e.date).set(e.userId, e.value);
    }
    const { streak, states, crossings } = walkGroupHabit(gh, memberJoin, byDate, today, windowStart);

    for (const cr of crossings) {
      if (cr.date >= addDays(today, -14)) {
        milestones.push({
          userId: null, name: 'Everyone', habitId: gh.id, habitName: gh.name,
          color: gh.color, icon: gh.icon, group: true, ...cr,
        });
      }
    }

    const strip = [];
    for (let i = 6; i >= 0; i--) strip.push(states.get(addDays(today, -i)) ?? 'off');
    const todayMap = byDate.get(today) ?? new Map();
    sharedHabits.push({
      id: gh.id, name: gh.name, question: gh.question, icon: gh.icon, color: gh.color,
      createdBy: gh.createdBy,
      streak,
      todayState: states.get(today) ?? 'pending',
      strip,
      members: memberJoin
        .filter((m) => m.joinedDate <= today)
        .map((m) => ({
          userId: m.id, name: m.name,
          today: todayMap.get(m.id) >= 1 ? 'done' : todayMap.get(m.id) === -1 ? 'skip' : null,
        })),
      myToday: todayMap.get(req.userId) >= 1 ? 'done' : todayMap.get(req.userId) === -1 ? 'skip' : null,
    });
  }

  milestones.sort((a, b) => b.date.localeCompare(a.date));

  res.json({
    groupId,
    month: start.slice(0, 7),
    members: memberOut,
    leaderboard,
    milestones: milestones.slice(0, 20),
    sharedHabits,
  });
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

app.listen(PORT, () => console.log(`analytics-service listening on :${PORT}`));
