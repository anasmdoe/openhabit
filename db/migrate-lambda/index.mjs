// Database migration as a Lambda, so deploys need no direct connection to
// Postgres (handy when it is only reachable from AWS). Terraform invokes it on
// every apply where db/init.sql or a role password changed. Does exactly what
// `docker compose run --rm migrate` does: init.sql, then the role passwords.
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const SERVICES = ['auth', 'habit', 'tracking', 'analytics', 'social', 'reminder'];

export async function handler() {
  const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
  await client.connect();
  try {
    await client.query(await readFile(new URL('./init.sql', import.meta.url), 'utf8'));
    for (const svc of SERVICES) {
      const pw = process.env[`${svc.toUpperCase()}_DB_PASSWORD`] ?? '';
      if (pw.length < 16 || /change-me/i.test(pw)) throw new Error(`${svc.toUpperCase()}_DB_PASSWORD must be 16+ random characters`);
      await client.query(`ALTER ROLE ${svc}_svc PASSWORD ${client.escapeLiteral(pw)}`);
    }
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`);
    return { ok: true, tables: rows[0].n };
  } finally {
    await client.end();
  }
}
