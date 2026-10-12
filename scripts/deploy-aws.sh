#!/usr/bin/env bash
# Deploys OpenHabit to AWS serverless (Lambda + API Gateway + EventBridge, and
# CloudFront/S3 unless enable_cdn = false) with a cloud Postgres such as Neon:
#   1. build the frontend and the Lambda packages
#   2. terraform/tofu apply (the migrate Lambda applies db/init.sql + role passwords)
#   3. upload the frontend to S3 and invalidate CloudFront (CDN mode only)
#
# Needs: AWS credentials (aws configure / AWS_PROFILE), the aws CLI, tofu or
# terraform, and node/npm. Secrets come from .env (scripts/init-env.sh) plus
# AWS_DB_ADMIN_URL, an owner/admin connection URL the migrate Lambda uses
# (not needed with create_database = true). Settings live in
# deploy/aws/terraform.tfvars. AUTO_APPROVE=1 skips the prompt.
set -euo pipefail
cd "$(dirname "$0")/.."

TF=${TF:-$(command -v tofu || command -v terraform || true)}
[ -n "$TF" ] || { echo "FATAL: install OpenTofu (tofu) or Terraform" >&2; exit 1; }
for bin in aws npm; do
  command -v "$bin" >/dev/null || { echo "FATAL: $bin is not installed" >&2; exit 1; }
done
[ -f .env ] || { echo "FATAL: no .env — run scripts/init-env.sh first" >&2; exit 1; }
[ -f deploy/aws/terraform.tfvars ] ||
  { echo "FATAL: copy deploy/aws/terraform.tfvars.example to deploy/aws/terraform.tfvars and fill it in" >&2; exit 1; }

set -a
# shellcheck disable=SC1091
. ./.env
set +a
echo "==> 1/3 building the frontend and Lambda packages"
(cd frontend && npm ci --no-audit --no-fund && npm run build)
scripts/build-lambdas.sh

echo "==> 2/3 applying infrastructure with $(basename "$TF") (includes database migrations)"
TF_VAR_jwt_secret="$JWT_SECRET"
TF_VAR_db_admin_url="${AWS_DB_ADMIN_URL:-}"
TF_VAR_db_passwords=$(node -e 'const e = process.env; console.log(JSON.stringify({
  auth: e.AUTH_DB_PASSWORD, habit: e.HABIT_DB_PASSWORD, tracking: e.TRACKING_DB_PASSWORD,
  analytics: e.ANALYTICS_DB_PASSWORD, social: e.SOCIAL_DB_PASSWORD, reminder: e.REMINDER_DB_PASSWORD }))')
TF_VAR_vapid=$(node -e 'const e = process.env; console.log(JSON.stringify({
  public_key: e.VAPID_PUBLIC_KEY || "", private_key: e.VAPID_PRIVATE_KEY || "", subject: e.VAPID_SUBJECT || "" }))')
export TF_VAR_jwt_secret TF_VAR_db_admin_url TF_VAR_db_passwords TF_VAR_vapid
"$TF" -chdir=deploy/aws init -input=false
"$TF" -chdir=deploy/aws apply -input=false ${AUTO_APPROVE:+-auto-approve}

bucket=$("$TF" -chdir=deploy/aws output -raw web_bucket)
distribution=$("$TF" -chdir=deploy/aws output -raw distribution_id)
app_url=$("$TF" -chdir=deploy/aws output -raw app_url)

if [ -n "$distribution" ]; then
  echo "==> 3/3 uploading the frontend to s3://$bucket and invalidating CloudFront"
  # hashed assets first (cached for a year, old ones kept for open tabs), then
  # the entry points with no-cache so a deploy takes effect immediately
  aws s3 sync frontend/dist/assets "s3://$bucket/assets" --cache-control "public,max-age=31536000,immutable"
  aws s3 sync frontend/dist "s3://$bucket" --delete --exclude "assets/*" --cache-control "no-cache"
  aws cloudfront create-invalidation --distribution-id "$distribution" --paths "/" "/index.html" "/sw.js" >/dev/null
else
  echo "==> 3/3 frontend is served by the web Lambda (enable_cdn = false); nothing to upload"
fi

echo "==> deployed: $app_url"
