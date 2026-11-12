// Applies db/migrations/NNNN_*.sql with node-postgres: the same files, order, transaction-per-migration
// and schema_migrations bookkeeping as the generated db/init.sql, for places without psql (the migrate Lambda).
//   ADMIN_DATABASE_URL=postgres://... node db/migrate.mjs
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sha = (s) => createHash('sha256').update(s).digest('hex');

export async function migrate(client, dir = new URL('./migrations/', import.meta.url)) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const files = (await readdir(dir)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  files.forEach((f, i) => {
    if (Number(f.slice(0, 4)) !== i + 1) throw new Error(`migrations must be numbered 0001.. without gaps (got ${f})`);
  });
  const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
  const have = new Map(rows.map((r) => [r.version, r.checksum]));
  const applied = [];
  for (const f of files) {
    const version = f.slice(0, 4);
    const name = f.slice(5, -4);
    const text = await readFile(new URL(f, dir), 'utf8');
    const sum = sha(text);
    if (have.has(version)) {
      if (have.get(version) !== sum) throw new Error(`migration ${version} ${name} was edited after it was applied; add a new migration instead`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(text);
      await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [version, name, sum]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`migration ${version} ${name} failed: ${e.message}`);
    }
    applied.push(version);
  }
  return { applied, total: files.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
  await client.connect();
  try {
    const r = await migrate(client);
    console.log(r.applied.length ? `applied ${r.applied.join(', ')} (${r.total} total)` : `up to date (${r.total} migrations)`);
  } finally {
    await client.end();
  }
}
