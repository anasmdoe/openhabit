#!/bin/sh
# OpenHabit restore for Docker Compose deployments.
#
#   ./scripts/restore.sh backups/openhabit-20260110-023000.sql.gz
#
# Restores a gzipped pg_dump into the running database. Because the dumps are
# taken with --clean --if-exists, this DROPs and recreates each object, so the
# target database is replaced by the backup's contents.
#
# !! This overwrites current data. You will be asked to confirm. !!
set -eu

if [ $# -ne 1 ]; then
  echo "usage: $0 <backup-file.sql.gz>" >&2
  exit 2
fi
FILE="$1"
[ -f "$FILE" ] || { echo "error: no such file: $FILE" >&2; exit 2; }

PG_SERVICE="${PG_SERVICE:-postgres}"
PG_USER="${PG_USER:-openhabit}"
PG_DB="${PG_DB:-openhabit}"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "error: neither 'docker compose' nor 'docker-compose' found" >&2
  exit 1
fi

# verify the archive before touching the database
gzip -t "$FILE" || { echo "error: ${FILE} is not a valid gzip file" >&2; exit 1; }

printf 'This will OVERWRITE the current "%s" database with %s.\nType "yes" to continue: ' "$PG_DB" "$FILE"
read -r reply
[ "$reply" = "yes" ] || { echo "aborted."; exit 1; }

echo "[$(date -u +%FT%TZ)] restoring ${FILE} -> ${PG_DB}"
# Stop app services so nothing writes mid-restore; leave postgres up.
$DC stop auth-service habit-service tracking-service analytics-service \
  social-service reminder-service >/dev/null 2>&1 || true

gzip -dc "$FILE" | $DC exec -T "$PG_SERVICE" psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB"

echo "[$(date -u +%FT%TZ)] restarting services"
$DC start auth-service habit-service tracking-service analytics-service \
  social-service reminder-service >/dev/null 2>&1 || true

echo "[$(date -u +%FT%TZ)] restore complete"
