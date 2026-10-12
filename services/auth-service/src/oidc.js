// Minimal OIDC authorization-code client. No external deps — uses global fetch
// and node:crypto. Supports RS256 (JWKS) and HS256 (client secret) ID tokens,
// which together cover the common self-hosted providers (Authelia, Authentik,
// Keycloak, Zitadel, Google).
import crypto from 'node:crypto';

const ISSUER = (process.env.OIDC_ISSUER || '').replace(/\/$/, '');
const CLIENT_ID = process.env.OIDC_CLIENT_ID || '';
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || '';
// Where the provider sends the browser back (this service, via the gateway):
const REDIRECT_URI = process.env.OIDC_REDIRECT_URI || '';
// Where to land the user after we mint our own token (the SPA):
const POST_LOGIN_URI = process.env.OIDC_POST_LOGIN_URI || '/';
const SCOPES = process.env.OIDC_SCOPES || 'openid email profile';
const PROVIDER_NAME = process.env.OIDC_PROVIDER_NAME || 'SSO';

export const oidcEnabled = Boolean(ISSUER && CLIENT_ID && REDIRECT_URI);
export const oidcInfo = { enabled: oidcEnabled, name: PROVIDER_NAME };

// ---- discovery (cached) ---------------------------------------------------
let discoveryCache = null;
let discoveryAt = 0;
async function discover() {
  if (discoveryCache && Date.now() - discoveryAt < 3600_000) return discoveryCache;
  const r = await fetch(`${ISSUER}/.well-known/openid-configuration`);
  if (!r.ok) throw new Error(`OIDC discovery failed: ${r.status}`);
  discoveryCache = await r.json();
  discoveryAt = Date.now();
  return discoveryCache;
}

// ---- JWKS (cached) --------------------------------------------------------
let jwksCache = null;
let jwksAt = 0;
async function getJwks(uri) {
  if (jwksCache && Date.now() - jwksAt < 3600_000) return jwksCache;
  const r = await fetch(uri);
  if (!r.ok) throw new Error(`JWKS fetch failed: ${r.status}`);
  jwksCache = (await r.json()).keys || [];
  jwksAt = Date.now();
  return jwksCache;
}

// ---- transient state store (CSRF + nonce), 10-min TTL ---------------------
const stateStore = new Map(); // state -> { nonce, createdAt }
export function newState() {
  const state = crypto.randomBytes(16).toString('base64url');
  const nonce = crypto.randomBytes(16).toString('base64url');
  stateStore.set(state, { nonce, createdAt: Date.now() });
  return { state, nonce };
}
function takeState(state) {
  const rec = stateStore.get(state);
  if (!rec) return null;
  stateStore.delete(state);
  if (Date.now() - rec.createdAt > 10 * 60_000) return null;
  return rec;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of stateStore) if (now - v.createdAt > 10 * 60_000) stateStore.delete(k);
}, 60_000).unref();

// ---- build the authorize URL ----------------------------------------------
export async function authorizeUrl() {
  const d = await discover();
  const { state, nonce } = newState();
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
    nonce,
  });
  return `${d.authorization_endpoint}?${p.toString()}`;
}

// ---- JWT verification (RS256 via JWKS, or HS256 via client secret) --------
const b64urlJSON = (seg) => JSON.parse(Buffer.from(seg, 'base64url').toString());

async function verifyIdToken(idToken, nonce) {
  const [h, pl, sig] = idToken.split('.');
  if (!h || !pl || !sig) throw new Error('malformed id_token');
  const header = b64urlJSON(h);
  const payload = b64urlJSON(pl);
  const signingInput = `${h}.${pl}`;
  const sigBuf = Buffer.from(sig, 'base64url');

  if (header.alg === 'RS256') {
    const d = await discover();
    const jwks = await getJwks(d.jwks_uri);
    const jwk = jwks.find((k) => k.kid === header.kid) || jwks.find((k) => k.kty === 'RSA');
    if (!jwk) throw new Error('no matching JWKS key');
    const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const ok = crypto.verify('RSA-SHA256', Buffer.from(signingInput), pubKey, sigBuf);
    if (!ok) throw new Error('id_token signature invalid');
  } else if (header.alg === 'HS256') {
    const expected = crypto.createHmac('sha256', CLIENT_SECRET).update(signingInput).digest();
    if (expected.length !== sigBuf.length || !crypto.timingSafeEqual(expected, sigBuf))
      throw new Error('id_token signature invalid');
  } else {
    throw new Error(`unsupported id_token alg: ${header.alg}`);
  }

  // standard claim checks
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss?.replace(/\/$/, '') !== ISSUER) throw new Error('issuer mismatch');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(CLIENT_ID)) throw new Error('audience mismatch');
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('id_token expired');
  if (payload.nonce !== nonce) throw new Error('nonce mismatch');
  return payload;
}

// ---- exchange the code, return verified claims ----------------------------
export async function handleCallback(code, state) {
  const rec = takeState(state);
  if (!rec) throw new Error('invalid or expired state');
  const d = await discover();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
  });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  // token_endpoint_auth: prefer client_secret_basic when a secret exists
  if (CLIENT_SECRET) {
    headers.Authorization = 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  }
  const tr = await fetch(d.token_endpoint, { method: 'POST', headers, body });
  if (!tr.ok) throw new Error(`token exchange failed: ${tr.status}`);
  const tokens = await tr.json();
  if (!tokens.id_token) throw new Error('no id_token in response');

  const claims = await verifyIdToken(tokens.id_token, rec.nonce);
  return {
    sub: claims.sub,
    iss: ISSUER,
    email: (claims.email || '').toLowerCase(),
    name: claims.name || claims.preferred_username || (claims.email || '').split('@')[0] || 'user',
    emailVerified: claims.email_verified !== false,
  };
}

export const postLoginUri = POST_LOGIN_URI;
