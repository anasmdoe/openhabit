#!/usr/bin/env node
// openhabit-mcp: run the OpenHabit MCP server.
//   stdio (Claude Desktop, Claude Code, Cursor …):  OPENHABIT_URL=… OPENHABIT_TOKEN=… openhabit-mcp
//   HTTP (Streamable HTTP, one endpoint for many users): openhabit-mcp --http [--port 3333]
//     each request authenticates with its own "Authorization: Bearer <OpenHabit API token>" header,
//     so the server stores no tokens; OPENHABIT_URL is the OpenHabit server it talks to.
import http from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createApi } from './api.js';
import { createServer } from './server.js';

const args = process.argv.slice(2);
const baseUrl = process.env.OPENHABIT_URL;

if (args.includes('--http')) {
  const port = Number(args[args.indexOf('--port') + 1]) || Number(process.env.PORT) || 3333;
  if (!baseUrl) { console.error('OPENHABIT_URL is not set'); process.exit(1); }
  http.createServer(async (req, res) => {
    if (req.url === '/healthz') { res.writeHead(200).end('ok'); return; }
    if (!req.url.startsWith('/mcp')) { res.writeHead(404).end(); return; }
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' })
        .end(JSON.stringify({ error: 'send your OpenHabit API token as Authorization: Bearer <token>' }));
      return;
    }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) { res.writeHead(413).end(); return; } }
    let body;
    try { body = JSON.parse(raw); } catch { res.writeHead(400).end('invalid JSON'); return; }
    // stateless: a fresh server per request, bound to that request's token
    const server = createServer(createApi({ baseUrl, token }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }).listen(port, () => console.error(`openhabit-mcp listening on http://localhost:${port}/mcp (OpenHabit at ${baseUrl})`));
} else {
  try {
    const server = createServer(createApi({ baseUrl, token: process.env.OPENHABIT_TOKEN }));
    await server.connect(new StdioServerTransport());
  } catch (e) {
    console.error(`openhabit-mcp: ${e.message}`);
    process.exit(1);
  }
}
