#!/usr/bin/env bash
# Runs every check the project has, in one go, and prints a PASS/FAIL table.
#   scripts/verify-all.sh                 everything that needs no cloud account
#   scripts/verify-all.sh --live URL      also checks a deployed stack (smoke test + live browser test)
#
# Needs: node 22, psql/pg_dump with a role that can create databases (libpq PG* variables, plus the
# *_DB_PASSWORD variables from db/set-db-passwords.sh for the smoke test), tofu, Playwright's Chromium
# (cd e2e && npx playwright install chromium), and `npm ci` in frontend/, e2e/, db/migrate-lambda and each service.
set -uo pipefail
cd "$(dirname "$0")/.."
LIVE=""; [ "${1:-}" = "--live" ] && LIVE="${2:?usage: --live URL}"
fails=0
step() { local label=$1; shift; printf '%-62s' "$label"; if out=$("$@" 2>&1); then echo PASS; else echo FAIL; echo "$out" | tail -8 | sed 's/^/    /'; fails=$((fails+1)); fi; }

step "frontend: typecheck"                  bash -c 'cd frontend && npx tsc -b'
step "frontend: unit tests"                 bash -c 'cd frontend && npx vitest run'
for s in auth tracking reminder; do step "service $s: unit tests" bash -c "cd services/${s}-service && npm test"; done
step "OpenAPI: routes match the services"   node scripts/check-openapi.js
step "OpenAPI: lint"                        bash -c 'cd frontend && npx -y @redocly/cli@1 lint public/openapi.yaml'
step "db/init.sql is generated from migrations" node db/build-init.js --check
step "k8s ConfigMap matches db/"            node scripts/sync-configmap.js --check
step "db: init.sql is idempotent"           scripts/test-init-sql.sh
step "db: psql and node runners agree"      env PGDATABASE=postgres scripts/test-migrations.sh
step "smoke test: HTTP services"            node scripts/smoke-test.js
step "smoke test: Lambda handlers"          node scripts/smoke-test.js --lambda
step "smoke test: packaged Lambda zips"     bash -c 'scripts/build-lambdas.sh >/dev/null && d=$(mktemp -d) && for s in auth habit tracking analytics social reminder; do unzip -q deploy/aws/build/$s.zip -d $d/$s; done && SMOKE_LAMBDA_DIR=$d node scripts/smoke-test.js --lambda'
for d in aws aws-runner; do
  step "terraform $d: fmt, validate, tests" bash -c "cd deploy/$d && tofu fmt -check -recursive && tofu init -backend=false -input=false >/dev/null && tofu validate && tofu test; rc=\$?; rm -f .terraform.lock.hcl; exit \$rc"
done
step "browser tests (demo mode, phone + desktop)" bash -c 'cd frontend && npm run build >/dev/null && cd ../e2e && CI=true npx playwright test --project=phone --project=desktop'
if [ -n "$LIVE" ]; then
  step "live: API smoke test"               node scripts/smoke-test.js --url "$LIVE"
  step "live: browser test"                 bash -c "cd e2e && E2E_BASE_URL='$LIVE' CI=true npx playwright test --project=live"
fi
echo; [ $fails -eq 0 ] && echo "all checks passed" || { echo "$fails check(s) failed"; exit 1; }
