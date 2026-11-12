import { test } from 'node:test';
import assert from 'node:assert/strict';

// mail.js (links) reads PUBLIC_URL when first loaded; mailer.js is re-imported per case below.
process.env.PUBLIC_URL = 'https://habits.example.com/';

// mail.js reads its settings at import time, so each case imports a fresh copy.
async function load(env) {
  const keys = ['MAIL_TRANSPORT', 'PUBLIC_URL', 'SMTP_URL', 'MAIL_WEBHOOK_URL'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try { return await import(`./mailer.js?${Math.random()}`); } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('email is off without a transport or without a public URL', async () => {
  assert.equal((await load({})).mailEnabled, false);
  assert.equal((await load({ MAIL_TRANSPORT: 'ses' })).mailEnabled, false);
  assert.equal((await load({ PUBLIC_URL: 'https://habits.example.com' })).mailEnabled, false);
});

test('each transport needs its own settings', async () => {
  const url = 'https://habits.example.com';
  assert.equal((await load({ MAIL_TRANSPORT: 'ses', PUBLIC_URL: url })).mailEnabled, true);
  assert.equal((await load({ MAIL_TRANSPORT: 'log', PUBLIC_URL: url })).mailEnabled, true);
  assert.equal((await load({ MAIL_TRANSPORT: 'smtp', PUBLIC_URL: url })).mailEnabled, false);
  assert.equal((await load({ MAIL_TRANSPORT: 'smtp', PUBLIC_URL: url, SMTP_URL: 'smtp://u:p@h:587' })).mailEnabled, true);
  assert.equal((await load({ MAIL_TRANSPORT: 'webhook', PUBLIC_URL: url })).mailEnabled, false);
  assert.equal((await load({ MAIL_TRANSPORT: 'webhook', PUBLIC_URL: url, MAIL_WEBHOOK_URL: 'http://x/y' })).mailEnabled, true);
});

test('links use PUBLIC_URL without a trailing slash and escape the token', async () => {
  const m = await import('./mail.js');
  assert.equal(m.resetLink('a b'), 'https://habits.example.com/?reset=a%20b');
  assert.equal(m.verifyLink('tok'), 'https://habits.example.com/?verify=tok');
});
