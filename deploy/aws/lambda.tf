# One Lambda per service. Each runs the same Express app as docker/k8s through
# services/_shared/lambda.js; scripts/build-lambdas.sh produces build/<svc>.zip.

locals {
  services = {
    auth      = { timeout = 10, routes = ["/api/auth", "/api/auth/{proxy+}"] }
    habit     = { timeout = 10, routes = ["/api/habits", "/api/habits/{proxy+}"] }
    tracking  = { timeout = 10, routes = ["/api/entries", "/api/entries/{proxy+}", "/api/wellness", "/api/wellness/{proxy+}"] }
    analytics = { timeout = 15, routes = ["/api/analytics/{proxy+}"] }
    social = { timeout = 10, routes = [
      "/api/groups", "/api/groups/{proxy+}", "/api/invites", "/api/invites/{proxy+}",
      "/api/join", "/api/reactions", "/api/reactions/{proxy+}",
    ] }
    reminder = { timeout = 60, routes = ["/api/reminders/{proxy+}"] }
  }

  public_url = var.public_url != "" ? trimsuffix(var.public_url, "/") : "https://${aws_cloudfront_distribution.app.domain_name}"

  service_env = {
    auth = {
      ALLOW_REGISTRATION  = tostring(var.allow_registration)
      OIDC_ISSUER         = var.oidc.issuer
      OIDC_CLIENT_ID      = var.oidc.client_id
      OIDC_CLIENT_SECRET  = var.oidc.client_secret
      OIDC_PROVIDER_NAME  = var.oidc.provider_name
      OIDC_REDIRECT_URI   = var.oidc.issuer == "" ? "" : "${local.public_url}/api/auth/oidc/callback"
      OIDC_POST_LOGIN_URI = "${local.public_url}/"
    }
    reminder = {
      PUBLIC_URL = local.public_url
      # the catch-up window must outlast the gap between scheduled runs
      REMINDER_CATCH_UP_MINUTES = tostring(max(15, var.reminder_interval_minutes + 5))
    }
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Logs only: the services talk to Postgres over TLS and need no other AWS API.
data "aws_iam_policy_document" "lambda_logs" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [for g in aws_cloudwatch_log_group.svc : "${g.arn}:*"]
  }
}

resource "aws_iam_role_policy" "lambda_logs" {
  name   = "logs"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_logs.json
}

resource "aws_cloudwatch_log_group" "svc" {
  for_each          = local.services
  name              = "/aws/lambda/${var.name}-${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "svc" {
  for_each = local.services

  function_name    = "${var.name}-${each.key}"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "src/lambda.handler"
  filename         = "${path.module}/build/${each.key}.zip"
  source_code_hash = filebase64sha256("${path.module}/build/${each.key}.zip")
  memory_size      = var.lambda_memory_mb
  timeout          = each.value.timeout

  environment {
    variables = merge(
      {
        DATABASE_URL = format("postgres://%s_svc:%s@%s:%d/%s?sslmode=%s",
        each.key, urlencode(var.db_passwords[each.key]), var.db_host, var.db_port, var.db_name, var.db_sslmode)
        JWT_SECRET  = var.jwt_secret
        PG_POOL_MAX = "2" # one container serves one request at a time
      },
      lookup(local.service_env, each.key, {}),
    )
  }

  depends_on = [aws_cloudwatch_log_group.svc, aws_iam_role_policy.lambda_logs]
}
