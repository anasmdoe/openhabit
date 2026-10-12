#!/usr/bin/env bash
# Packages each service for AWS Lambda: src/ (without tests) + production
# node_modules -> deploy/aws/build/<svc>.zip. Zips are reproducible (sorted
# entries, fixed timestamps), so Terraform only redeploys services that changed.
set -euo pipefail
cd "$(dirname "$0")/.."

out="$PWD/deploy/aws/build"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

for svc in auth habit tracking analytics social reminder; do
  src="services/${svc}-service"
  cmp -s services/_shared/lambda.js "$src/src/lambda.js" ||
    { echo "FATAL: $src/src/lambda.js differs from services/_shared/lambda.js" >&2; exit 1; }

  dir="$work/$svc"
  mkdir -p "$dir"
  cp "$src/package.json" "$src/package-lock.json" "$dir/"
  cp -R "$src/src" "$dir/src"
  find "$dir/src" -name '*.test.js' -delete
  (cd "$dir" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
  rm -f "$dir/package-lock.json" "$dir/node_modules/.package-lock.json"

  find "$dir" -exec touch -h -t 198001010000 {} +
  rm -f "$out/$svc.zip"
  (cd "$dir" && find . -type f | LC_ALL=C sort | zip -X -q "$out/$svc.zip" -@)
  echo "built deploy/aws/build/$svc.zip ($(du -k "$out/$svc.zip" | cut -f1) KB)"
done
