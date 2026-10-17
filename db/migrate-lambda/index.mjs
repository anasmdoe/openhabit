// Database migration as a Lambda, so deploys need no direct connection to
// Postgres (handy when it is only reachable from AWS). Terraform invokes it on
// every apply where the migrations or a role password changed. Does what
// `docker compose run --rm migrate` does: numbered migrations, then the role passwords.
import pg from 'pg';
import { migrate } from './migrate.mjs';

// Secrets Manager mode: same JSON layout as services/_shared/lambda.js ("shared" + "migrate" sections).
if (process.env.SECRETS_ARN) {
  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const res = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: process.env.SECRETS_ARN }));
  const all = JSON.parse(res.SecretString ?? '{}');
  for (const [k, v] of Object.entries({ ...all.shared, ...all.migrate })) if (process.env[k] === undefined) process.env[k] = String(v);
}

const SERVICES = ['auth', 'habit', 'tracking', 'analytics', 'social', 'reminder'];

export async function handler() {
  const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
  await client.connect();
  try {
    const migrations = await migrate(client);
    for (const svc of SERVICES) {
      const pw = process.env[`${svc.toUpperCase()}_DB_PASSWORD`] ?? '';
      if (pw.length < 16 || /change-me/i.test(pw)) throw new Error(`${svc.toUpperCase()}_DB_PASSWORD must be 16+ random characters`);
      await client.query(`ALTER ROLE ${svc}_svc PASSWORD ${client.escapeLiteral(pw)}`);
    }
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`);
    return { ok: true, tables: rows[0].n, migrations };
  } finally {
    await client.end();
  }
}
