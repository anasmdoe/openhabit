// Signed webhooks. Every delivery carries
//   X-OpenHabit-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
//   X-OpenHabit-Event:     habit.completed
//   X-OpenHabit-Delivery:  <uuid, the same as "id" in the body: use it to drop duplicates>
// The key is the user's signing secret (`whsec_...`, shown in the app under Account > Webhooks).
// A receiver recomputes the HMAC over the raw bytes it received, compares in constant time and
// rejects timestamps older than five minutes (replays).
import crypto from 'node:crypto';

export const TOLERANCE_S = 300;

/** The user's signing secret. auth-service derives the same value; bumping `version` rotates it. */
export function signingSecret(jwtSecret, userId, version) {
  const mac = crypto.createHmac('sha256', jwtSecret).update(`webhook:${userId}:${version}`).digest('base64url');
  return `whsec_${mac}`;
}

const hmac = (secret, t, body) => crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

export function signBody(secret, body, now = Date.now()) {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${hmac(secret, t, body)}`;
}

/** Receiver side (also exported for tests and docs). `body` is the raw request body string. */
export function verifySignature(secret, body, header, now = Date.now()) {
  const parts = Object.fromEntries(String(header ?? '').split(',').map((kv) => kv.trim().split('=')).filter((p) => p.length === 2));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(now / 1000 - t) > TOLERANCE_S) return false;
  const want = Buffer.from(hmac(secret, t, body));
  const got = Buffer.from(parts.v1);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
