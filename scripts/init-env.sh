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

# Web Push (VAPID) key pair: raw P-256 keys, base64url. Generated together;
# changing them later invalidates every browser's push subscription.
b64u() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
if ! grep -qE "^VAPID_PRIVATE_KEY=.+" .env; then
  if command -v openssl >/dev/null; then
    pem=$(openssl ecparam -name prime256v1 -genkey -noout 2>/dev/null)
    # SEC1 DER: 7 header bytes, then the 32-byte private key; SPKI ends with the 65-byte point
    fill VAPID_PRIVATE_KEY "$(printf '%s\n' "$pem" | openssl ec -outform DER 2>/dev/null | tail -c +8 | head -c 32 | b64u)"
    sed -i.bak '/^VAPID_PUBLIC_KEY=/d' .env && rm -f .env.bak
    fill VAPID_PUBLIC_KEY "$(printf '%s\n' "$pem" | openssl ec -pubout -outform DER 2>/dev/null | tail -c 65 | b64u)"
  else
    echo "openssl not found: skipping VAPID keys (Web Push stays off)" >&2
  fi
fi
chmod 600 .env
echo ".env is ready"
