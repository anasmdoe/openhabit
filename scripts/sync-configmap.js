#!/usr/bin/env node
// Copies db/init.sql into the postgres-init ConfigMap in k8s/10-postgres.yaml.
//   node scripts/sync-configmap.js          rewrite the manifest
//   node scripts/sync-configmap.js --check  exit 1 if the two have drifted (CI)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sqlPath = path.join(root, 'db/init.sql');
const yamlPath = path.join(root, 'k8s/10-postgres.yaml');

const sql = fs.readFileSync(sqlPath, 'utf8').replace(/\n+$/, '');
const lines = fs.readFileSync(yamlPath, 'utf8').split('\n');

const start = lines.findIndex((l) => l === '  init.sql: |');
if (start === -1) throw new Error('`  init.sql: |` not found in k8s/10-postgres.yaml');
let end = start + 1;
while (end < lines.length && lines[end] !== '---') end++;
if (end === lines.length) throw new Error('no `---` after the init.sql block');

const block = sql.split('\n').map((l) => (l ? `    ${l}` : ''));
const next = [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join('\n');
const current = lines.join('\n');

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('k8s/10-postgres.yaml is out of sync with db/init.sql — run: node scripts/sync-configmap.js');
    process.exit(1);
  }
  console.log('ConfigMap matches db/init.sql');
} else if (next === current) {
  console.log('ConfigMap already up to date');
} else {
  fs.writeFileSync(yamlPath, next);
  console.log('Updated k8s/10-postgres.yaml from db/init.sql');
}
