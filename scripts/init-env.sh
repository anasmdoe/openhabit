#!/usr/bin/env bash
# Creates .env from .env.example (if missing) and fills every required secret
# that is missing or empty with a random value. Never overwrites a value you
# already set, so it is safe to re-run after upgrading.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { cp .env.example .env; echo "created .env from .env.example"; }

rand() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

fill() {
  local key=$1 value=$2
  if grep -qE "^${key}=.+" .env; then
    return
  elif grep -qE "^${key}=$" .env; then
    sed -i.bak "s|^${key}=$|${key}=${value}|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
  echo "generated $key"
}

fill JWT_SECRET "$(rand 48)"
for svc in AUTH HABIT TRACKING ANALYTICS SOCIAL REMINDER; do
  fill "${svc}_DB_PASSWORD" "$(rand 24)"
done
chmod 600 .env
echo ".env is ready"
