// AWS Lambda entry point (handler: src/lambda.handler). Copied verbatim into
// each service as src/lambda.js — keep the copies identical (CI checks).
//
// The service's Express app runs here unchanged: on cold start it listens on a
// loopback port, and each API Gateway (HTTP API, payload v2) event is replayed
// against it as a real HTTP request. Events without an HTTP context come from
// EventBridge Scheduler and run the service's onSchedule() job instead.
import { once } from 'node:events';

process.env.OPENHABIT_RUNTIME = 'lambda'; // index.js: no listen(), no timers
const service = await import('./index.js');
const server = service.app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;

// connection-level headers that must not be copied between the two hops
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding', 'host']);

export async function handler(event) {
  if (!event?.requestContext?.http) {
    if (typeof service.onSchedule !== 'function') throw new Error('this service has no scheduled job');
    await service.onSchedule();
    return { ok: true };
  }

  // /api/<path> is what the browser calls; services serve /<path> (the
  // docker/k8s gateway strips /api the same way).
  const path = event.rawPath.replace(/^\/api(?=\/|$)/, '') || '/';
  const headers = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) if (!HOP.has(k)) headers[k] = v;
  if (event.cookies?.length) headers.cookie = event.cookies.join('; ');
  const method = event.requestContext.http.method;
  const body = event.body == null || method === 'GET' || method === 'HEAD'
    ? undefined
    : Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');

  const res = await fetch(`${origin}${path}${event.rawQueryString ? `?${event.rawQueryString}` : ''}`, {
    method, headers, body, redirect: 'manual',
  });

  const outHeaders = {};
  res.headers.forEach((v, k) => { if (!HOP.has(k) && k !== 'set-cookie') outHeaders[k] = v; });
  return {
    statusCode: res.status,
    headers: outHeaders,
    cookies: res.headers.getSetCookie(),
    body: Buffer.from(await res.arrayBuffer()).toString('base64'),
    isBase64Encoded: true,
  };
}
