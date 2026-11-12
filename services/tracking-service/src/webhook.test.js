import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signingSecret, signBody, verifySignature } from './webhook.js';

const JWT = 'a'.repeat(48);
const body = JSON.stringify({ event: 'habit.completed', habit: 'Read' });

test('secrets are per user and per version', () => {
  const a = signingSecret(JWT, 'user-1', 1);
  assert.match(a, /^whsec_[\w-]{40,}$/);
  assert.equal(a, signingSecret(JWT, 'user-1', 1));
  assert.notEqual(a, signingSecret(JWT, 'user-2', 1));
  assert.notEqual(a, signingSecret(JWT, 'user-1', 2));
  assert.notEqual(a, signingSecret('b'.repeat(48), 'user-1', 1));
});

test('a fresh signature verifies; any change to body, secret or header fails', () => {
  const secret = signingSecret(JWT, 'u', 1);
  const now = Date.UTC(2026, 9, 17, 12);
  const header = signBody(secret, body, now);
  assert.equal(verifySignature(secret, body, header, now), true);
  assert.equal(verifySignature(secret, body + ' ', header, now), false);
  assert.equal(verifySignature(signingSecret(JWT, 'u', 2), body, header, now), false);
  assert.equal(verifySignature(secret, body, header.replace(/.$/, (c) => (c === '0' ? '1' : '0')), now), false);
  assert.equal(verifySignature(secret, body, 'garbage', now), false);
  assert.equal(verifySignature(secret, body, undefined, now), false);
});

test('replays older (or newer) than five minutes are rejected', () => {
  const secret = signingSecret(JWT, 'u', 1);
  const now = Date.UTC(2026, 9, 17, 12);
  const header = signBody(secret, body, now);
  assert.equal(verifySignature(secret, body, header, now + 299_000), true);
  assert.equal(verifySignature(secret, body, header, now + 301_000), false);
  assert.equal(verifySignature(secret, body, header, now - 301_000), false);
});
