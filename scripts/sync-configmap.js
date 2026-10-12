#!/usr/bin/env node
// Copies the database init files from db/ into the postgres-init ConfigMap in
// k8s/10-postgres.yaml (mounted as /docker-entrypoint-initdb.d and used by the
// migrate Job).
//   node scripts/sync-configmap.js          rewrite the manifest
//   node scripts/sync-configmap.js --check  exit 1 if they have drifted (CI)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FILES = ['init.sql', 'set-db-passwords.sh']; // ConfigMap key order = initdb run order
const yamlPath = path.join(root, 'k8s/10-postgres.yaml');

let lines = fs.readFileSync(yamlPath, 'utf8').split('\n');
const current = lines.join('\n');

// A key's block runs from `  <key>: |` to the next non-blank line that is not
// indented by 4+ spaces (the next key, `---`, or EOF).
function blockEnd(start) {
  let end = start + 1;
  while (end < lines.length && (lines[end] === '' || lines[end].startsWith('    '))) end++;
  return end;
}

let insertAt = -1;
for (const file of FILES) {
  const body = fs.readFileSync(path.join(root, 'db', file), 'utf8').replace(/\n+$/, '');
  const block = [`  ${file}: |`, ...body.split('\n').map((l) => (l ? `    ${l}` : ''))];
  const start = lines.indexOf(`  ${file}: |`);
  if (start !== -1) {
    const end = blockEnd(start);
    lines = [...lines.slice(0, start), ...block, ...lines.slice(end)];
    insertAt = start + block.length;
  } else if (insertAt !== -1) {
    lines = [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)];
    insertAt += block.length;
  } else {
    throw new Error(`\`  ${file}: |\` not found in k8s/10-postgres.yaml`);
  }
}
const next = lines.join('\n');

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('k8s/10-postgres.yaml is out of sync with db/ — run: node scripts/sync-configmap.js');
    process.exit(1);
  }
  console.log('ConfigMap matches db/');
} else if (next === current) {
  console.log('ConfigMap already up to date');
} else {
  fs.writeFileSync(yamlPath, next);
  console.log('Updated k8s/10-postgres.yaml from db/');
}
