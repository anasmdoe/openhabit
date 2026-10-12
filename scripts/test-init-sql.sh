#!/usr/bin/env bash
# Proves db/init.sql is idempotent: applies it twice and checks that the second
# run neither fails nor changes the schema. Point it at a THROWAWAY database
# with the standard libpq variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
set -euo pipefail
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export PGOPTIONS='--client-min-messages=warning'

apply() { psql -X -q -v ON_ERROR_STOP=1 -f db/init.sql; }
# drop the random per-dump \restrict key added by newer pg_dump versions
dump()  { pg_dump --schema-only --no-owner | grep -vE '^\\(un)?restrict ' > "$1"; }

echo "applying db/init.sql (1st run)"; apply; dump "$tmp/first.sql"
echo "applying db/init.sql (2nd run)"; apply; dump "$tmp/second.sql"

if ! diff -u "$tmp/first.sql" "$tmp/second.sql"; then
  echo "FAIL: second run changed the schema" >&2
  exit 1
fi
echo "OK: init.sql is idempotent ($(grep -c '^CREATE TABLE' "$tmp/first.sql") tables)"
