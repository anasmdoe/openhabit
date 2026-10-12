#!/usr/bin/env bash
# Deploys OpenHabit to AWS serverless (Lambda + API Gateway + CloudFront/S3 +
# EventBridge Scheduler) with a cloud Postgres such as Neon:
#   1. build the Lambda packages          4. build + upload the frontend
#   2. migrate the database               5. invalidate the CloudFront cache
#   3. terraform/tofu apply
#
# Needs: AWS credentials (aws configure / AWS_PROFILE), the aws CLI, tofu or
# terraform, node/npm and psql. Secrets come from .env (scripts/init-env.sh)
# plus AWS_DB_ADMIN_URL, an owner/admin connection URL used only to migrate.
# Settings live in deploy/aws/terraform.tfvars. AUTO_APPROVE=1 skips the prompt.
set -euo pipefail
cd "$(dirname "$0")/.."

TF=${TF:-$(command -v tofu || command -v terraform || true)}
[ -n "$TF" ] || { echo "FATAL: install OpenTofu (tofu) or Terraform" >&2; exit 1; }
for bin in aws npm psql; do
  command -v "$bin" >/dev/null || { echo "FATAL: $bin is not installed" >&2; exit 1; }
done
[ -f .env ] || { echo "FATAL: no .env — run scripts/init-env.sh first" >&2; exit 1; }
[ -f deploy/aws/terraform.tfvars ] ||
  { echo "FATAL: copy deploy/aws/terraform.tfvars.example to deploy/aws/terraform.tfvars and fill it in" >&2; exit 1; }

set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${AWS_DB_ADMIN_URL:?set AWS_DB_ADMIN_URL in .env (admin connection URL of your cloud Postgres)}"

echo "==> 1/5 building Lambda packages"
scripts/build-lambdas.sh

echo "==> 2/5 migrating the database (schema + service role passwords)"
psql -X -q -v ON_ERROR_STOP=1 -f db/init.sql "$AWS_DB_ADMIN_URL"
db/set-db-passwords.sh "$AWS_DB_ADMIN_URL"

echo "==> 3/5 applying infrastructure with $(basename "$TF")"
TF_VAR_jwt_secret="$JWT_SECRET"
TF_VAR_db_passwords=$(node -e 'const e = process.env; console.log(JSON.stringify({
  auth: e.AUTH_DB_PASSWORD, habit: e.HABIT_DB_PASSWORD, tracking: e.TRACKING_DB_PASSWORD,
  analytics: e.ANALYTICS_DB_PASSWORD, social: e.SOCIAL_DB_PASSWORD, reminder: e.REMINDER_DB_PASSWORD }))')
export TF_VAR_jwt_secret TF_VAR_db_passwords
"$TF" -chdir=deploy/aws init -input=false
"$TF" -chdir=deploy/aws apply -input=false ${AUTO_APPROVE:+-auto-approve}

bucket=$("$TF" -chdir=deploy/aws output -raw web_bucket)
distribution=$("$TF" -chdir=deploy/aws output -raw distribution_id)
app_url=$("$TF" -chdir=deploy/aws output -raw app_url)

echo "==> 4/5 building and uploading the frontend to s3://$bucket"
(cd frontend && npm ci --no-audit --no-fund && npm run build)
# hashed assets first (cached for a year, old ones kept for open tabs), then the
# entry points with no-cache so a deploy takes effect immediately
aws s3 sync frontend/dist/assets "s3://$bucket/assets" --cache-control "public,max-age=31536000,immutable"
aws s3 sync frontend/dist "s3://$bucket" --delete --exclude "assets/*" --cache-control "no-cache"

echo "==> 5/5 invalidating CloudFront"
aws cloudfront create-invalidation --distribution-id "$distribution" --paths "/" "/index.html" "/sw.js" >/dev/null

echo "==> deployed: $app_url"
