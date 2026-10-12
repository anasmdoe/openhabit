#!/usr/bin/env bash
# Packages everything AWS Lambda runs into deploy/aws/build/:
#   <svc>.zip    each service: src/ (without tests) + production node_modules
#   migrate.zip  db/migrate-lambda + db/init.sql (run by Terraform on apply)
#   web.zip      the built frontend, served by Lambda when CloudFront is off
# Zips are reproducible (sorted entries, fixed timestamps), so Terraform only
# redeploys what changed.
set -euo pipefail
cd "$(dirname "$0")/.."

out="$PWD/deploy/aws/build"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

zipdir() { # <dir> <name>: reproducible deploy/aws/build/<name>.zip
  find "$1" -exec touch -h -t 198001010000 {} +
  rm -f "$out/$2.zip"
  (cd "$1" && find . -type f | LC_ALL=C sort | zip -X -q "$out/$2.zip" -@)
  echo "built deploy/aws/build/$2.zip ($(du -k "$out/$2.zip" | cut -f1) KB)"
}

for svc in auth habit tracking analytics social reminder; do
  src="services/${svc}-service"
  for shared in lambda.js actions.js; do
    [ "$shared" = actions.js ] && [ ! -f "$src/src/actions.js" ] && continue
    cmp -s "services/_shared/$shared" "$src/src/$shared" ||
      { echo "FATAL: $src/src/$shared differs from services/_shared/$shared" >&2; exit 1; }
  done

  dir="$work/$svc"
  mkdir -p "$dir"
  cp "$src/package.json" "$src/package-lock.json" "$dir/"
  cp -R "$src/src" "$dir/src"
  find "$dir/src" -name '*.test.js' -delete
  (cd "$dir" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
  rm -f "$dir/package-lock.json" "$dir/node_modules/.package-lock.json"
  zipdir "$dir" "$svc"
done

dir="$work/migrate"
mkdir -p "$dir"
cp db/migrate-lambda/index.mjs db/migrate-lambda/package.json db/migrate-lambda/package-lock.json db/init.sql "$dir/"
(cd "$dir" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
rm -f "$dir/package-lock.json" "$dir/node_modules/.package-lock.json"
zipdir "$dir" migrate

[ -f frontend/dist/index.html ] ||
  (cd frontend && npm ci --no-audit --no-fund --loglevel=error && npm run build >/dev/null)
dir="$work/web"
mkdir -p "$dir"
cp deploy/aws/web-lambda/index.mjs "$dir/"
cp -R frontend/dist "$dir/dist"
zipdir "$dir" web
