# One Lambda per service. Each runs the same Express app as docker/k8s through
# services/_shared/lambda.js; scripts/build-lambdas.sh produces build/<svc>.zip.

locals {
  services = {
    auth      = ["/api/auth", "/api/auth/{proxy+}"]
    habit     = ["/api/habits", "/api/habits/{proxy+}"]
    tracking  = ["/api/entries", "/api/entries/{proxy+}", "/api/wellness", "/api/wellness/{proxy+}"]
    analytics = ["/api/analytics/{proxy+}"]
    social = [
      "/api/groups", "/api/groups/{proxy+}", "/api/invites", "/api/invites/{proxy+}",
      "/api/join", "/api/reactions", "/api/reactions/{proxy+}",
    ]
    reminder = ["/api/reminders/{proxy+}"]
  }

  # every function this stack runs (for log groups and the logs policy)
  functions = concat(keys(local.services), ["migrate"], var.enable_cdn ? [] : ["web"])

  public_url = (var.public_url != "" ? trimsuffix(var.public_url, "/")
    : var.enable_cdn ? "https://${aws_cloudfront_distribution.app[0].domain_name}"
  : aws_apigatewayv2_api.api.api_endpoint)

  db_host = (var.create_database
    ? (var.db_engine == "aurora-serverless" ? aws_rds_cluster.aurora[0].endpoint : aws_db_instance.db[0].address)
  : var.db_host)

  service_env = {
    auth = {
      ALLOW_REGISTRATION  = tostring(var.allow_registration)
      OIDC_ISSUER         = var.oidc.issuer
      OIDC_CLIENT_ID      = var.oidc.client_id
      OIDC_CLIENT_SECRET  = var.oidc.client_secret
      OIDC_PROVIDER_NAME  = var.oidc.provider_name
      OIDC_REDIRECT_URI   = var.oidc.issuer == "" ? "" : "${local.public_url}/api/auth/oidc/callback"
      OIDC_POST_LOGIN_URI = "${local.public_url}/"
      VAPID_PUBLIC_KEY    = var.vapid.public_key
      # email links point at the app's own address (never taken from a request)
      PUBLIC_URL                 = local.public_url
      MAIL_TRANSPORT             = var.mail.transport
      MAIL_FROM                  = var.mail.from
      MAIL_WEBHOOK_URL           = var.mail.webhook_url
      SMTP_URL                   = var.mail.smtp_url
      REQUIRE_EMAIL_VERIFICATION = tostring(var.require_email_verification)
    }
    reminder = {
      PUBLIC_URL = local.public_url
      # the catch-up window must outlast the gap between scheduled runs
      REMINDER_CATCH_UP_MINUTES = tostring(max(15, var.reminder_interval_minutes + 5))
      VAPID_PUBLIC_KEY          = var.vapid.public_key
      VAPID_PRIVATE_KEY         = var.vapid.private_key
      VAPID_SUBJECT             = var.vapid.subject
    }
  }

  # the full environment of each service function, before any secret moves to Secrets Manager
  service_fn_env = {
    for svc, _ in local.services : svc => merge(
      local.common_env,
      {
        DATABASE_URL = format("postgres://%s_svc:%s@%s:%d/%s?sslmode=%s",
        svc, urlencode(var.db_passwords[svc]), local.db_host, var.db_port, var.db_name, var.db_sslmode)
        JWT_SECRET  = var.jwt_secret
        PG_POOL_MAX = "2" # one container serves one request at a time
      },
      lookup(local.service_env, svc, {}),
    )
  }

  # Lambda's Node runtimes don't trust the Amazon RDS CAs unless pointed at them.
  common_env = { NODE_EXTRA_CA_CERTS = "/var/runtime/ca-cert.pem" }
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
  name               = var.lambda_role_name != "" ? var.lambda_role_name : "${var.name}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Logs only: the functions talk to Postgres over TLS and need no other AWS API.
data "aws_iam_policy_document" "lambda_logs" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [for g in aws_cloudwatch_log_group.fn : "${g.arn}:*"]
  }
}

resource "aws_iam_role_policy" "lambda_logs" {
  count  = var.use_managed_iam_policies ? 0 : 1
  name   = "logs"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_logs.json
}

# Broader AWS-managed equivalent (all log groups; plus network interfaces in VPC mode).
resource "aws_iam_role_policy_attachment" "lambda_managed" {
  count = var.use_managed_iam_policies ? 1 : 0
  role  = aws_iam_role.lambda.name
  policy_arn = (var.create_database
    ? "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  : "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole")
}

resource "aws_cloudwatch_log_group" "fn" {
  for_each          = toset(local.functions)
  name              = "/aws/lambda/${var.name}-${each.key}" # kept when a function is renamed (log groups cannot be deleted in some sandboxes)
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "svc" {
  for_each = local.services

  function_name    = lookup(var.function_names, each.key, "${var.name}-${each.key}")
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = [var.lambda_architecture]
  handler          = "src/lambda.handler"
  filename         = "${path.module}/build/${each.key}.zip"
  source_code_hash = filebase64sha256("${path.module}/build/${each.key}.zip")
  memory_size      = var.lambda_memory_mb
  timeout          = var.lambda_timeout

  dynamic "vpc_config" {
    for_each = local.vpc_config
    content {
      subnet_ids         = vpc_config.value.subnet_ids
      security_group_ids = vpc_config.value.security_group_ids
    }
  }

  environment {
    variables = merge(
      # with Secrets Manager the secret values are dropped from the plain-text environment
      { for k, v in local.service_fn_env[each.key] : k => v if !(var.use_secrets_manager && contains(local.secret_env_keys, k)) },
      var.use_secrets_manager ? { SECRETS_ARN = aws_secretsmanager_secret.app[0].arn, OPENHABIT_SERVICE = each.key } : {},
    )
  }

  depends_on = [aws_cloudwatch_log_group.fn, aws_iam_role_policy.lambda_logs, aws_iam_role_policy.lambda_vpc, aws_iam_role_policy_attachment.lambda_managed, aws_iam_role_policy.lambda_secrets, aws_iam_role_policy_attachment.lambda_secrets_managed, aws_iam_role_policy.lambda_ses, aws_iam_role_policy_attachment.lambda_ses_managed]
}
