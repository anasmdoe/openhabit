// Web Push (RFC 8030) with message encryption (RFC 8291, "aes128gcm") and
// VAPID server identification (RFC 8292), using only node:crypto.
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url');
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
const RECORD_SIZE = 4096;

/** P-256 key pair as base64url raw keys (public: 65-byte uncompressed point, private: 32 bytes). */
export function generateVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

function deriveKeys(authSecret, ecdhSecret, uaPublic, asPublic, salt) {
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
  return {
    cek: hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
    nonce: hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12),
  };
}

/**
 * Encrypts `plaintext` for a subscription's keys (p256dh, auth: base64url).
 * `serverKey` (an ECDH object) and `salt` are only passed by tests; normally
 * both are fresh per message.
 */
export function encrypt(plaintext, { p256dh, auth }, { serverKey, salt } = {}) {
  const uaPublic = unb64u(p256dh);
  const as = serverKey ?? crypto.createECDH('prime256v1');
  if (!serverKey) as.generateKeys();
  const asPublic = as.getPublicKey();
  const s = salt ?? crypto.randomBytes(16);
  const { cek, nonce } = deriveKeys(unb64u(auth), as.computeSecret(uaPublic), uaPublic, asPublic, s);

  const record = Buffer.concat([Buffer.from(plaintext), Buffer.from([2])]); // 0x02: last record, no padding
  if (record.length + 16 > RECORD_SIZE) throw new Error('push payload too large');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  s.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** The receiving side (what a browser does): used by tests. */
export function decrypt(message, { privateKey, auth }) {
  const salt = message.subarray(0, 16);
  const idLen = message.readUInt8(20);
  const asPublic = message.subarray(21, 21 + idLen);
  const ua = crypto.createECDH('prime256v1');
  ua.setPrivateKey(unb64u(privateKey));
  const { cek, nonce } = deriveKeys(unb64u(auth), ua.computeSecret(asPublic), ua.getPublicKey(), asPublic, salt);
  const data = message.subarray(21 + idLen);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(data.subarray(data.length - 16));
  const record = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  const end = record.lastIndexOf(2);
  if (end < 0) throw new Error('missing record delimiter');
  return record.subarray(0, end).toString();
}

/** VAPID `Authorization` header value for a push endpoint (JWT valid 12 h). */
export function vapidAuthorization(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  const pub = unb64u(publicKey);
  const key = crypto.createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
  });
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject,
  }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${publicKey}`;
}

/**
 * Sends one push. Returns the push service's HTTP status; 404/410 mean the
 * subscription is gone and should be deleted.
 */
export async function sendPush(subscription, payload, vapid, { ttl = 3600, urgency = 'normal', timeoutMs = 4000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        TTL: String(ttl),
        Urgency: urgency,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: vapidAuthorization(subscription.endpoint, vapid),
      },
      body: encrypt(JSON.stringify(payload), subscription.keys),
      signal: ctrl.signal,
    });
    return res.status;
  } finally {
    clearTimeout(t);
  }
}
