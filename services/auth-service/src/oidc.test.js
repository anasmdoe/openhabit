import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'a'.repeat(48);
const { newState, takeState } = await import('./oidc.js');

test('OIDC state is self-contained: any instance with the secret can verify it', () => {
  const { state, nonce } = newState();
  assert.deepEqual(takeState(state), { nonce });
});

test('OIDC state rejects tampering, expiry and a different secret', () => {
  const now = Date.now();
  const { state } = newState(now);
  const [payload, sig] = state.split('.');
  const forged = Buffer.from(JSON.stringify({ n: 'attacker-nonce', e: now + 60_000 })).toString('base64url');
  assert.equal(takeState(`${forged}.${sig}`), null);
  assert.equal(takeState(`${payload}.${sig}x`), null);
  assert.equal(takeState(payload), null);
  assert.equal(takeState(`${state}.extra`), null);
  assert.equal(takeState(state, now + 10 * 60_000 + 1), null);

  process.env.JWT_SECRET = 'b'.repeat(48);
  assert.equal(takeState(state, now), null);
  process.env.JWT_SECRET = 'a'.repeat(48);
});
