#!/usr/bin/env node
// Scheduled export of your data: the same JSON the app's "Export" button produces
// (re-importable from the app), written to a folder and/or PUT to a remote URL.
//
//   OPENHABIT_URL=https://habits.example.com/api OPENHABIT_TOKEN=oh_... \
//     node scripts/export-data.js [--out DIR] [--keep N] [--put URL [--put-auth user:pass]]
//
// --out   folder for openhabit-export-YYYY-MM-DD.json (default ./openhabit-backups)
// --keep  newest files to keep in that folder (default 14; 0 keeps all)
// --put   also upload the file with HTTP PUT: WebDAV (Nextcloud, etc.) or a presigned S3 URL
// Create the token under Account > API tokens. Run it from cron, a systemd timer, a
// GitHub Actions schedule, or a Kubernetes CronJob running a node image.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = (process.env.OPENHABIT_URL || '').replace(/\/$/, '');
const TOKEN = process.env.OPENHABIT_TOKEN || '';
if (!BASE || !TOKEN) {
  console.error('Set OPENHABIT_URL (e.g. https://host/api) and OPENHABIT_TOKEN (an oh_ API token).');
  process.exit(2);
}

async function get(p) {
  const res = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`GET ${p} -> ${res.status}`);
  return res.json();
}

const today = new Date().toISOString().slice(0, 10);
const [active, archived, entries, wellness] = await Promise.all([
  get('/habits'), get('/habits?archived=true'),
  get(`/entries?from=2000-01-01&to=${today}`), get(`/wellness?from=2000-01-01&to=${today}`),
]);
// /habits?archived=true returns everything; keep each habit once
const habits = [...new Map([...active, ...archived].map((h) => [h.id, h])).values()];
const file = { app: 'openhabit', version: 1, exportedAt: new Date().toISOString(), habits, entries, wellness };
const json = JSON.stringify(file, null, 2);
const name = `openhabit-export-${today}.json`;

const out = opt('out', process.env.OPENHABIT_EXPORT_DIR || './openhabit-backups');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, name), json, { mode: 0o600 });
console.log(`wrote ${path.join(out, name)}: ${habits.length} habits, ${entries.length} entries, ${wellness.length} wellness days`);

const keep = Number(opt('keep', 14));
if (keep > 0) {
  const old = fs.readdirSync(out).filter((f) => /^openhabit-export-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -keep);
  for (const f of old) fs.unlinkSync(path.join(out, f));
  if (old.length) console.log(`removed ${old.length} older export${old.length === 1 ? '' : 's'}`);
}

const put = opt('put', process.env.OPENHABIT_EXPORT_PUT_URL);
if (put) {
  const auth = opt('put-auth', process.env.OPENHABIT_EXPORT_PUT_AUTH);
  const target = put.endsWith('/') ? `${put}${name}` : put;
  const res = await fetch(target, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Basic ${Buffer.from(auth).toString('base64')}` } : {}) },
    body: json,
  });
  if (!res.ok) { console.error(`upload failed: PUT -> ${res.status}`); process.exit(1); }
  console.log(`uploaded to ${new URL(target).origin}/…/${name}`);
}
