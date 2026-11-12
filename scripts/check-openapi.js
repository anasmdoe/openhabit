#!/usr/bin/env node
// Keeps frontend/public/openapi.yaml honest: every route the services register
// must be documented, and every documented operation must exist. Dependency-free
// (the spec's paths block is read line by line), so CI needs no install step.
//   node scripts/check-openapi.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const METHODS = ['get', 'post', 'put', 'delete'];
const INTERNAL = new Set(['/metrics', '/healthz']); // scraped/probed, not part of the public API

// routes the services register (the gateway prefixes each with /api)
const registered = new Set();
const servicesDir = path.join(root, 'services');
for (const svc of fs.readdirSync(servicesDir).filter((d) => d.endsWith('-service'))) {
  const src = fs.readFileSync(path.join(servicesDir, svc, 'src/index.js'), 'utf8');
  for (const m of src.matchAll(/^app\.(get|post|put|delete)\(\s*'([^']+)'/gm)) {
    if (INTERNAL.has(m[2])) continue;
    registered.add(`${m[1].toUpperCase()} ${m[2].replace(/:(\w+)/g, '{$1}')}`);
  }
}

// operations the spec documents
const documented = new Set();
let current = null;
let inPaths = false;
for (const line of fs.readFileSync(path.join(root, 'frontend/public/openapi.yaml'), 'utf8').split('\n')) {
  if (/^\S/.test(line)) inPaths = line.startsWith('paths:');
  if (!inPaths) continue;
  const p = line.match(/^ {2}(\/\S*):\s*$/);
  if (p) { current = p[1]; continue; }
  const op = line.match(/^ {4}(get|post|put|delete):\s*$/);
  if (op && current) documented.add(`${op[1].toUpperCase()} ${current}`);
}

const missing = [...registered].filter((r) => !documented.has(r)).sort();
const stale = [...documented].filter((d) => !registered.has(d)).sort();
for (const r of missing) console.error(`not documented in openapi.yaml: ${r}`);
for (const d of stale) console.error(`documented but no such route: ${d}`);
if (missing.length || stale.length) process.exit(1);
console.log(`openapi.yaml matches the services: ${registered.size} operations`);
