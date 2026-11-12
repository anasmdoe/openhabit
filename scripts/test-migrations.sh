#!/usr/bin/env bash
# Proves the two ways of applying db/migrations agree: `psql -f db/init.sql` (Docker, Kubernetes,
# deploy scripts) and `node db/migrate.mjs` (the migrate Lambda) must produce the same schema and the
# same schema_migrations rows, both must be re-runnable, and editing an applied migration must be refused.
# Needs libpq variables for a role that can create databases, and `npm ci` in db/migrate-lambda.
set -euo pipefail
cd "$(dirname "$0")/.."

export PGOPTIONS='--client-min-messages=warning'
suffix=$$
A="mig_psql_$suffix"; B="mig_node_$suffix"; C="mig_drift_$suffix"
admin_db=${PGDATABASE:-postgres}
cleanup() { for d in "$A" "$B" "$C"; do psql -X -q -d "$admin_db" -c "DROP DATABASE IF EXISTS $d" >/dev/null 2>&1 || true; done; rm -rf "${tmp:-}"; }
trap cleanup EXIT
tmp=$(mktemp -d)
for d in "$A" "$B" "$C"; do psql -X -q -d "$admin_db" -c "CREATE DATABASE $d"; done

url() { echo "postgres://${PGUSER:-postgres}:${PGPASSWORD:-}@${PGHOST:-localhost}:${PGPORT:-5432}/$1"; }
dump() { pg_dump -d "$1" --schema-only --no-owner | grep -vE '^\\(un)?restrict ' > "$2"; }
rows() { psql -X -At -d "$1" -c "SELECT version, name, checksum FROM schema_migrations ORDER BY version" > "$2"; }
node_migrate() { ADMIN_DATABASE_URL="$(url "$1")" node --input-type=module -e "
  import { createRequire } from 'node:module';
  const require = createRequire(process.cwd() + '/db/migrate-lambda/');
  const pg = require('pg');
  const { migrate } = await import('./db/migrate.mjs');
  const c = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
  await c.connect(); const r = await migrate(c); await c.end(); console.log(JSON.stringify(r));"; }

echo "psql path: apply twice"
psql -X -q -v ON_ERROR_STOP=1 -d "$A" -f db/init.sql; psql -X -q -v ON_ERROR_STOP=1 -d "$A" -f db/init.sql
echo "node path: apply twice"
node_migrate "$B" >/dev/null; second=$(node_migrate "$B")
echo "$second" | grep -q '"applied":\[\]' || { echo "FAIL: second node run applied something: $second" >&2; exit 1; }

dump "$A" "$tmp/a.sql"; dump "$B" "$tmp/b.sql"
diff -u "$tmp/a.sql" "$tmp/b.sql" || { echo "FAIL: psql and node produce different schemas" >&2; exit 1; }
rows "$A" "$tmp/a.rows"; rows "$B" "$tmp/b.rows"
diff -u "$tmp/a.rows" "$tmp/b.rows" || { echo "FAIL: schema_migrations differs between the two paths" >&2; exit 1; }
echo "OK: both paths give the same schema and the same $(wc -l < "$tmp/a.rows") recorded migrations"

echo "drift: an edited migration must be refused by both paths"
psql -X -q -v ON_ERROR_STOP=1 -d "$C" -f db/init.sql
psql -X -q -d "$C" -c "UPDATE schema_migrations SET checksum = 'edited' WHERE version = '0001'"
if psql -X -q -v ON_ERROR_STOP=1 -d "$C" -f db/init.sql 2>"$tmp/err"; then echo "FAIL: psql accepted an edited migration" >&2; exit 1; fi
if node_migrate "$C" 2>"$tmp/err2"; then echo "FAIL: node accepted an edited migration" >&2; exit 1; fi
grep -q "edited after it was applied" "$tmp/err2" || { echo "FAIL: unexpected node error: $(cat "$tmp/err2")" >&2; exit 1; }
echo "OK: edited migrations are refused"
