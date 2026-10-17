// Data ownership: full JSON export/import and CSV export.
// Runs entirely client-side through the DataAdapter, so it works identically
// against the API and in demo mode.
import type { DataAdapter } from '../api';
import type { Entry, Habit, WellnessDay } from './types';
import { todayISO } from './stats';

const EXPORT_VERSION = 1;
const EPOCH = '2000-01-01';

export interface ExportFile {
  app: 'openhabit';
  version: number;
  exportedAt: string;
  habits: Habit[];
  entries: Entry[];
  wellness: WellnessDay[];
}

function download(name: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function collect(adapter: DataAdapter): Promise<ExportFile> {
  const today = todayISO();
  const [active, archived, entries, wellness] = await Promise.all([
    adapter.listHabits(),
    adapter.listArchived(),
    adapter.getEntries(EPOCH, today),
    adapter.getWellness(EPOCH, today),
  ]);
  return {
    app: 'openhabit',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    habits: [...active, ...archived],
    entries,
    wellness,
  };
}

export async function exportJSON(adapter: DataAdapter) {
  const data = await collect(adapter);
  download(`openhabit-export-${todayISO()}.json`, 'application/json', JSON.stringify(data, null, 2));
  return { habits: data.habits.length, entries: data.entries.length, wellness: data.wellness.length };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCSV(adapter: DataAdapter) {
  const data = await collect(adapter);
  const byId = new Map(data.habits.map((h) => [h.id, h]));
  const rows = [['date', 'habit', 'value', 'skipped', 'unit', 'notes']];
  for (const e of [...data.entries].sort((a, b) => a.date.localeCompare(b.date))) {
    const h = byId.get(e.habitId);
    rows.push([
      e.date,
      h?.name ?? e.habitId,
      e.value === -1 ? '' : String(e.value),
      e.value === -1 ? 'yes' : '',
      h?.unit ?? '',
      e.notes ?? '',
    ]);
  }
  download(`openhabit-entries-${todayISO()}.csv`, 'text/csv',
    rows.map((r) => r.map(csvCell).join(',')).join('\n'));
  return { entries: data.entries.length };
}

export interface ImportResult {
  habits: number;
  entries: number;
  wellness: number;
  skippedHabits: number; // name collisions merged into existing habits
}

/**
 * Import a previously exported JSON file.
 * - Habits are matched by name (case-insensitive): existing ones are reused
 *   (entries merge into them), new ones are created.
 * - Entries upsert via the bulk endpoint; last-write-wins per (habit, date).
 */
export async function importJSON(adapter: DataAdapter, file: File): Promise<ImportResult> {
  const text = await file.text();
  let data: ExportFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('not a valid JSON file');
  }
  if (data?.app !== 'openhabit' || !Array.isArray(data.habits) || !Array.isArray(data.entries)) {
    throw new Error('not an OpenHabit export file');
  }
  if (data.version > EXPORT_VERSION) {
    throw new Error(`export version ${data.version} is newer than this app understands`);
  }

  const existing = [...(await adapter.listHabits()), ...(await adapter.listArchived())];
  const byName = new Map(existing.map((h) => [h.name.trim().toLowerCase(), h.id]));
  const idMap = new Map<string, string>(); // old id -> new id
  let created = 0;
  let merged = 0;

  for (const h of data.habits) {
    const key = (h.name ?? '').trim().toLowerCase();
    if (!key) continue;
    const hit = byName.get(key);
    if (hit) {
      idMap.set(h.id, hit);
      merged += 1;
      continue;
    }
    const fresh = await adapter.createHabit({
      name: h.name,
      question: h.question,
      type: h.type,
      unit: h.unit,
      target: h.target,
      targetType: h.targetType,
      color: h.color,
      icon: h.icon,
      scheduleType: h.scheduleType ?? 'weekdays',
      frequency: h.frequency ?? 3,
      webhookUrl: h.webhookUrl ?? '',
      reminderTime: h.reminderTime ?? '',
      activeDays: h.activeDays,
      category: h.category ?? '',
      cue: h.cue ?? '',
      savingsPerDay: h.savingsPerDay ?? 0,
      savingsUnit: h.savingsUnit ?? '',
      streakFreezes: h.streakFreezes ?? 1,
      kind: h.kind === 'quit' ? 'quit' : 'build',
    });
    idMap.set(h.id, fresh.id);
    byName.set(key, fresh.id);
    created += 1;
  }

  // remap and bulk-upsert entries in chunks
  const remapped: Entry[] = data.entries
    .filter((e) => idMap.has(e.habitId) && typeof e.value === 'number' && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .map((e) => ({ habitId: idMap.get(e.habitId)!, date: e.date, value: e.value, notes: e.notes ?? '' }));
  let imported = 0;
  const CHUNK = 500;
  for (let i = 0; i < remapped.length; i += CHUNK) {
    imported += await adapter.bulkPutEntries(remapped.slice(i, i + CHUNK));
  }

  // wellness upserts (COALESCE on the server keeps whichever side has data)
  // (in batches: a request per day would be hundreds of calls for a year of history)
  const days = (data.wellness ?? [])
    .filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.date))
    .map((w) => ({ date: w.date, mood: w.mood ?? null, sleepHours: w.sleepHours ?? null }));
  const wellnessN = await adapter.bulkPutWellness(days);

  return { habits: created, entries: imported, wellness: wellnessN, skippedHabits: merged };
}

// ---------------------------------------------------------------------------
// Loop Habit Tracker importer
// ---------------------------------------------------------------------------
// Loop exports a "Checkmarks.csv" in a wide matrix layout:
//   Date,Habit A,Habit B,...
//   2024-01-15,2,0,...
// where for yes/no habits 2 = completed, 1 = partial (rare), 0/-1 = not done,
// and for numeric habits the cell holds the measured value (scaled by 1000 in
// some Loop versions; we detect and unscale). We map 2 -> done, positive
// numeric -> value, and skip empty/zero cells.
//
// Accepts either the raw Checkmarks.csv text or a File. Habit definitions
// (color/question) come from an optional Habits.csv if present in the same
// import; otherwise sensible defaults are used.

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export interface LoopImportResult extends ImportResult {
  detectedHabits: string[];
}

export async function importLoopCSV(
  adapter: DataAdapter,
  checkmarks: File | string,
  habitsMeta?: File | string
): Promise<LoopImportResult> {
  const text = typeof checkmarks === 'string' ? checkmarks : await checkmarks.text();
  const rows = parseCSV(text.trim());
  if (rows.length < 2) throw new Error('Checkmarks.csv looks empty');

  const header = rows[0].map((h) => h.trim());
  if (!/date/i.test(header[0])) {
    throw new Error('this does not look like a Loop Checkmarks.csv (expected a Date column first)');
  }
  const habitNames = header.slice(1);

  // optional metadata: name -> { color, question }
  const meta = new Map<string, { color?: string; question?: string }>();
  if (habitsMeta) {
    const mtext = typeof habitsMeta === 'string' ? habitsMeta : await habitsMeta.text();
    const mrows = parseCSV(mtext.trim());
    if (mrows.length > 1) {
      const mh = mrows[0].map((h) => h.trim().toLowerCase());
      const iName = mh.indexOf('name');
      const iColor = mh.indexOf('color');
      const iQ = mh.indexOf('question');
      for (const r of mrows.slice(1)) {
        if (iName < 0 || !r[iName]) continue;
        meta.set(r[iName].trim(), {
          color: iColor >= 0 ? r[iColor]?.trim() : undefined,
          question: iQ >= 0 ? r[iQ]?.trim() : undefined,
        });
      }
    }
  }

  // detect the per-column value scale (Loop stores numeric values ×1000)
  const colMax: number[] = habitNames.map(() => 0);
  for (const r of rows.slice(1)) {
    for (let c = 0; c < habitNames.length; c++) {
      const v = parseFloat(r[c + 1]);
      if (Number.isFinite(v) && v > colMax[c]) colMax[c] = v;
    }
  }
  // a column is boolean if its max is <= 2 (Loop yes/no uses 2); else numeric ×1000
  const isBoolCol = colMax.map((m) => m <= 2);

  // ensure habits exist (match by name, create missing)
  const existing = [...(await adapter.listHabits()), ...(await adapter.listArchived())];
  const byName = new Map(existing.map((h) => [h.name.trim().toLowerCase(), h]));
  const targetHabit = new Map<string, string>(); // loop name -> habit id
  let created = 0;
  let merged = 0;
  for (let c = 0; c < habitNames.length; c++) {
    const nm = habitNames[c].trim();
    if (!nm) continue;
    const hit = byName.get(nm.toLowerCase());
    if (hit) { targetHabit.set(nm, hit.id); merged++; continue; }
    const m = meta.get(nm) ?? {};
    const color = /^#[0-9a-fA-F]{6}$/.test(m.color ?? '') ? m.color : undefined;
    const h = await adapter.createHabit({
      name: nm,
      question: m.question || '',
      type: isBoolCol[c] ? 'boolean' : 'numeric',
      unit: isBoolCol[c] ? '' : '',
      target: isBoolCol[c] ? 1 : Math.max(1, Math.round(colMax[c] / 1000)),
      color,
      activeDays: [0, 1, 2, 3, 4, 5, 6],
    });
    targetHabit.set(nm, h.id);
    byName.set(nm.toLowerCase(), h);
    created++;
  }

  // build entries
  const entries: Entry[] = [];
  for (const r of rows.slice(1)) {
    const date = r[0].trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (let c = 0; c < habitNames.length; c++) {
      const id = targetHabit.get(habitNames[c].trim());
      if (!id) continue;
      const raw = parseFloat(r[c + 1]);
      if (!Number.isFinite(raw)) continue;
      if (isBoolCol[c]) {
        if (raw >= 2) entries.push({ habitId: id, date, value: 1 });
        // Loop's 1 (partial) and 0/-1 (not done) are left unlogged
      } else if (raw > 0) {
        entries.push({ habitId: id, date, value: Math.round(raw / 1000) });
      }
    }
  }

  let imported = 0;
  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    imported += await adapter.bulkPutEntries(entries.slice(i, i + CHUNK));
  }

  return {
    habits: created,
    entries: imported,
    wellness: 0,
    skippedHabits: merged,
    detectedHabits: habitNames.filter((n) => n.trim()),
  };
}
