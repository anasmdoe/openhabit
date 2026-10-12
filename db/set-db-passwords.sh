#!/usr/bin/env bash
# Sets the login password of each per-service database role (created by
# init.sql) from the <SERVICE>_DB_PASSWORD environment variables. Safe to re-run;
# run it after init.sql on every migrate so password rotations take effect.
#
# Connection: standard libpq variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE),
# or a connection URL as the first argument (cloud Postgres, e.g. Neon). Inside the postgres image's /docker-entrypoint-initdb.d it falls back to
# POSTGRES_USER / POSTGRES_DB over the local socket.

# The postgres image *sources* non-executable *.sh init files; run in our own
# process instead so `set -u` and `exit` can't leak into its entrypoint.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  bash "${BASH_SOURCE[0]}"
  return $?
fi
set -euo pipefail

export PGUSER="${PGUSER:-${POSTGRES_USER:-postgres}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-$PGUSER}}"

args=()
for svc in auth habit tracking analytics social reminder; do
  var="${svc^^}_DB_PASSWORD"
  pw="${!var:-}"
  if [ "${#pw}" -lt 16 ] || [[ "$pw" == *change-me* ]]; then
    echo "FATAL: $var must be a random string of at least 16 characters (e.g. \`openssl rand -hex 24\`)" >&2
    exit 1
  fi
  args+=(-v "${svc}_pw=$pw")
done

psql -X -q -v ON_ERROR_STOP=1 "${args[@]}" "$@" <<'SQL'
ALTER ROLE auth_svc      PASSWORD :'auth_pw';
ALTER ROLE habit_svc     PASSWORD :'habit_pw';
ALTER ROLE tracking_svc  PASSWORD :'tracking_pw';
ALTER ROLE analytics_svc PASSWORD :'analytics_pw';
ALTER ROLE social_svc    PASSWORD :'social_pw';
ALTER ROLE reminder_svc  PASSWORD :'reminder_pw';
SQL
echo "set passwords for 6 service roles"
