# Optional: secrets in AWS Secrets Manager (use_secrets_manager = true).
#
# One secret holds a JSON object: a "shared" section plus one section per function. The functions get
# only SECRETS_ARN and OPENHABIT_SERVICE in their environment and read their sections at cold start
# (services/_shared/lambda.js, db/migrate-lambda/index.mjs). The role may read this one secret only.
# The values are still in Terraform state, so keep the state private (encrypted S3 backend).

locals {
  secret_env_keys = ["JWT_SECRET", "DATABASE_URL", "OIDC_CLIENT_SECRET", "VAPID_PRIVATE_KEY", "SMTP_URL"]

  secret_name = var.secret_name != "" ? var.secret_name : "${var.name}/app"

  # what each service function would otherwise carry in plain text
  secret_sections = {
    for svc, env in local.service_fn_env : svc => {
      for k, v in env : k => v if contains(local.secret_env_keys, k) && nonsensitive(v != "")
    }
  }
}

resource "aws_secretsmanager_secret" "app" {
  count                   = var.use_secrets_manager ? 1 : 0
  name                    = local.secret_name
  description             = "OpenHabit runtime secrets (read by the Lambda functions at start-up)"
  recovery_window_in_days = 0 # allow `tofu destroy` followed by a fresh apply with the same name
}

resource "aws_secretsmanager_secret_version" "app" {
  count     = var.use_secrets_manager ? 1 : 0
  secret_id = aws_secretsmanager_secret.app[0].id
  secret_string = jsonencode(merge(
    local.secret_sections,
    {
      migrate = {
        ADMIN_DATABASE_URL    = local.admin_url
        AUTH_DB_PASSWORD      = var.db_passwords["auth"]
        HABIT_DB_PASSWORD     = var.db_passwords["habit"]
        TRACKING_DB_PASSWORD  = var.db_passwords["tracking"]
        ANALYTICS_DB_PASSWORD = var.db_passwords["analytics"]
        SOCIAL_DB_PASSWORD    = var.db_passwords["social"]
        REMINDER_DB_PASSWORD  = var.db_passwords["reminder"]
      }
    }
  ))
}

data "aws_iam_policy_document" "lambda_secrets" {
  count = var.use_secrets_manager ? 1 : 0
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app[0].arn]
  }
}

resource "aws_iam_role_policy" "lambda_secrets" {
  count  = var.use_secrets_manager && !var.use_managed_iam_policies ? 1 : 0
  name   = "read-app-secret"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_secrets[0].json
}

# Sandboxes that deny inline role policies (use_managed_iam_policies): the broader AWS-managed read policy.
resource "aws_iam_role_policy_attachment" "lambda_secrets_managed" {
  count      = var.use_secrets_manager && var.use_managed_iam_policies ? 1 : 0
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/SecretsManagerReadWrite"
}
