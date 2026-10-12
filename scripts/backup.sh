#!/bin/sh
# OpenHabit backup for Docker Compose deployments.
#
# Dumps the whole database to ./backups/openhabit-<timestamp>.sql.gz and rotates
# to the newest $BACKUP_KEEP files. Safe to run by hand or from cron/systemd on
# the Docker host.
#
#   ./scripts/backup.sh              # one-off backup
#   BACKUP_KEEP=30 ./scripts/backup.sh
#
# Cron example (host crontab), nightly at 02:30:
#   30 2 * * * cd /path/to/openhabit && ./scripts/backup.sh >> backups/backup.log 2>&1
set -eu

# --- config (override via env) ---------------------------------------------
PG_SERVICE="${PG_SERVICE:-postgres}"           # compose service name
PG_USER="${PG_USER:-openhabit}"
PG_DB="${PG_DB:-openhabit}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

# pick "docker compose" (v2) or "docker-compose" (v1), whichever exists
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "error: neither 'docker compose' nor 'docker-compose' found" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
ts="$(date -u +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/openhabit-${ts}.sql.gz"

echo "[$(date -u +%FT%TZ)] dumping ${PG_DB} from compose service '${PG_SERVICE}'"
# Exec pg_dump inside the running postgres container; compress on the host side.
# --clean --if-exists makes the dump self-contained (safe to restore over an
# existing schema). Write to .partial then rename so a crashed dump is never
# mistaken for a good one by the rotation step.
$DC exec -T "$PG_SERVICE" pg_dump --clean --if-exists --no-owner --no-privileges \
  -U "$PG_USER" "$PG_DB" | gzip -9 > "${out}.partial"
mv "${out}.partial" "${out}"

# integrity check before we trust it enough to prune older ones
gzip -t "${out}"
echo "[$(date -u +%FT%TZ)] wrote $(wc -c < "${out}") bytes -> ${out}"

# rotation: keep the newest $BACKUP_KEEP, remove older
ls -1t "$BACKUP_DIR"/openhabit-*.sql.gz 2>/dev/null \
  | tail -n +"$((BACKUP_KEEP + 1))" \
  | while IFS= read -r old; do
      echo "pruning ${old}"
      rm -f "${old}"
    done

echo "[$(date -u +%FT%TZ)] backup complete ($(ls -1 "$BACKUP_DIR"/openhabit-*.sql.gz 2>/dev/null | wc -l) kept)"
