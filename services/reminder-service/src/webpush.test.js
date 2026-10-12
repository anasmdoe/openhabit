import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encrypt, decrypt, vapidAuthorization, generateVapidKeys } from './webpush.js';

// Produced by http_ece (the reference RFC 8188/8291 implementation) with these
// fixed keys and salt; our encryption must match it byte for byte.
const VECTOR = {
  uaPrivate: 'wGvhPtGolBNBendtSg_NbIk5VGKRW-sG8JyLlIsCdMs',
  uaPublic: 'BKtklzLqZimhWetRunWYBBCFjQI2ek-XDLf0ccYYn-qjOsu6FNvcSTRFVxeeq97movYZOzielKR1c6PxxacXsRo',
  auth: 'G9Fjo25USNoL1anpsqWknw',
  asPrivate: 'E96uqKOkW-_JYn1egeRTuiVCUuPOIOTTi_KXPCimQhA',
  salt: 'rMzj56gSeng69rQ0ltZ0dg',
  body: 'rMzj56gSeng69rQ0ltZ0dgAAEABBBCu1PoFTq794QU7p7FDxphcUkb0M5dpHC69bdiZl3pvPkaGoMNtSfgB4azzb1CuwheDNV-fLynzPN9n906r_tpmBOvAnHsJc7JAmiDxA6iWBdvaksCokrv-b76Sp-JlXVfSGGRPdn62lnKQvLaOPoDoCms6dvGFs5H8R',
};
const TEXT = 'When I grow up, I want to be a watermelon';

test('encrypt matches the reference implementation byte for byte', () => {
  const as = crypto.createECDH('prime256v1');
  as.setPrivateKey(Buffer.from(VECTOR.asPrivate, 'base64url'));
  const out = encrypt(TEXT, { p256dh: VECTOR.uaPublic, auth: VECTOR.auth },
    { serverKey: as, salt: Buffer.from(VECTOR.salt, 'base64url') });
  assert.equal(out.toString('base64url'), VECTOR.body);
});

test('decrypt reads the reference message; a wrong auth secret fails', () => {
  const body = Buffer.from(VECTOR.body, 'base64url');
  assert.equal(decrypt(body, { privateKey: VECTOR.uaPrivate, auth: VECTOR.auth }), TEXT);
  assert.throws(() => decrypt(body, { privateKey: VECTOR.uaPrivate, auth: crypto.randomBytes(16).toString('base64url') }));
});

test('round trip with fresh keys; oversized payloads are refused', () => {
  const ua = crypto.createECDH('prime256v1');
  ua.generateKeys();
  const sub = { p256dh: ua.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
  const msg = JSON.stringify({ title: 'OpenHabit', body: "Don't break the chain" });
  assert.equal(decrypt(encrypt(msg, sub), { privateKey: ua.getPrivateKey('base64url'), auth: sub.auth }), msg);
  assert.throws(() => encrypt('x'.repeat(4096), sub), /too large/);
});

test('VAPID JWT: ES256 signature verifies, audience is the push service origin', () => {
  const keys = generateVapidKeys();
  const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc123',
    { ...keys, subject: 'mailto:ops@example.com' }, 1_700_000_000_000);
  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [h, c, s] = jwt.split('.');
  const pub = Buffer.from(k, 'base64url');
  const key = crypto.createPublicKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') },
  });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url')),
    { aud: 'https://fcm.googleapis.com', exp: 1_700_000_000 + 12 * 3600, sub: 'mailto:ops@example.com' });
});
