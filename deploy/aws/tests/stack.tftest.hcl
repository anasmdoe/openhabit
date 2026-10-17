# Offline test of the whole stack with a mocked AWS provider (no account, no
# credentials): `tofu test` or `terraform test` from deploy/aws after
# scripts/build-lambdas.sh. Checks routing, wiring and per-service settings.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      domain_name = "d111111abcdef8.cloudfront.net"
      arn         = "arn:aws:cloudfront::123456789012:distribution/EDFDVBD6EXAMPLE"
    }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      api_endpoint  = "https://abc123.execute-api.ap-south-1.amazonaws.com"
      execution_arn = "arn:aws:execute-api:ap-south-1:123456789012:abc123"
    }
  }
  mock_resource "aws_lambda_function" {
    defaults = {
      arn        = "arn:aws:lambda:ap-south-1:123456789012:function:openhabit"
      invoke_arn = "arn:aws:apigateway:ap-south-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-south-1:123456789012:function:openhabit/invocations"
    }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:ap-south-1:123456789012:log-group:/aws/lambda/openhabit" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = {
      arn                         = "arn:aws:s3:::openhabit-web-123456789012"
      bucket_regional_domain_name = "openhabit-web-123456789012.s3.ap-south-1.amazonaws.com"
    }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:openhabit/app-AbCdEf" }
  }
  mock_resource "aws_rds_cluster" {
    defaults = {
      id       = "openhabit-aurora"
      endpoint = "openhabit-aurora.cluster-abc123.us-east-1.rds.amazonaws.com"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/openhabit" }
  }
  mock_resource "aws_db_instance" {
    defaults = { address = "openhabit-db.abc123.us-east-1.rds.amazonaws.com" }
  }
  mock_data "aws_vpc" {
    defaults = { id = "vpc-123", cidr_block = "172.31.0.0/16" }
  }
  mock_data "aws_subnets" {
    defaults = { ids = ["subnet-a", "subnet-b"] }
  }
}

# the untagged provider copy used for the EventBridge rule (var.tag_event_rule)
mock_provider "aws" {
  alias = "events"
  mock_resource "aws_cloudwatch_event_rule" {
    defaults = { arn = "arn:aws:events:us-east-1:123456789012:rule/openhabit-reminders" }
  }
}

variables {
  db_host    = "ep-test-pooler.example.neon.tech"
  jwt_secret = "0123456789abcdef0123456789abcdef0123456789abcdef"
  db_passwords = {
    auth      = "auth-pw-0123456789abcdef"
    habit     = "habit-pw/needs+escaping"
    tracking  = "tracking-pw-0123456789"
    analytics = "analytics-pw-0123456789"
    social    = "social-pw-0123456789ab"
    reminder  = "reminder-pw-0123456789"
  }
}

run "stack" {
  command = apply

  assert {
    condition     = contains(keys(aws_apigatewayv2_route.svc), "ANY /api/v1/habits/{proxy+}") && contains(keys(aws_apigatewayv2_route.svc), "ANY /api/habits/{proxy+}")
    error_message = "every route is served under /api and the versioned /api/v1"
  }
  assert {
    condition     = length(aws_lambda_function.svc) == 6 && length(aws_apigatewayv2_route.svc) == 34
    error_message = "expected 6 functions and 17 API routes"
  }
  assert {
    condition     = aws_apigatewayv2_route.svc["ANY /api/join"].target == "integrations/${aws_apigatewayv2_integration.svc["social"].id}"
    error_message = "/api/join must go to the social service"
  }
  assert {
    condition     = !contains(keys(aws_apigatewayv2_route.svc), "ANY /api/metrics")
    error_message = "/metrics must not be public"
  }
  assert {
    condition     = nonsensitive(aws_lambda_function.svc["habit"].environment[0].variables.DATABASE_URL) == "postgres://habit_svc:habit-pw%2Fneeds%2Bescaping@ep-test-pooler.example.neon.tech:5432/openhabit?sslmode=verify-full"
    error_message = "habit DATABASE_URL must use the habit_svc role with a URL-encoded password"
  }
  assert {
    condition     = nonsensitive(aws_lambda_function.svc["reminder"].environment[0].variables.PUBLIC_URL) == "https://d111111abcdef8.cloudfront.net"
    error_message = "reminder PUBLIC_URL should default to the CloudFront URL"
  }
  assert {
    condition     = nonsensitive(lookup(aws_lambda_function.svc["habit"].environment[0].variables, "PUBLIC_URL", "unset")) == "unset"
    error_message = "service-specific settings must not leak into other services"
  }
  assert {
    condition     = nonsensitive(aws_lambda_function.svc["auth"].environment[0].variables.OIDC_REDIRECT_URI) == ""
    error_message = "SSO stays off without an issuer"
  }
  assert {
    condition     = aws_cloudwatch_event_rule.reminders.schedule_expression == "rate(5 minutes)" && nonsensitive(aws_lambda_function.svc["reminder"].environment[0].variables.REMINDER_CATCH_UP_MINUTES) == "15"
    error_message = "default: reminders every 5 minutes with a 15-minute catch-up window"
  }
  assert {
    condition     = aws_lambda_function.svc["auth"].architectures[0] == "arm64" && aws_lambda_function.svc["auth"].runtime == "nodejs22.x"
    error_message = "functions run on arm64 / Node 22"
  }
  assert {
    condition     = length(aws_cloudfront_distribution.app) == 1 && length(aws_lambda_function.web) == 0 && length(aws_lambda_invocation.migrate) == 0
    error_message = "defaults: CloudFront serves the frontend; no migrations without an admin URL"
  }
  assert {
    condition     = length(aws_lambda_function.svc["habit"].vpc_config) == 0
    error_message = "with an external database the functions stay out of a VPC (no NAT needed)"
  }
  assert {
    condition     = length(aws_iam_role_policy.lambda_logs) == 1 && length(aws_iam_role_policy_attachment.lambda_managed) == 0
    error_message = "default: least-privilege inline logs policy"
  }
}

run "sandbox_private_rds_without_cdn" {
  command = apply

  variables {
    create_database          = true
    db_host                  = ""
    db_admin_password        = "admin-pw-0123456789abcdef"
    enable_cdn               = false
    log_retention_days       = 0
    use_managed_iam_policies = true
  }

  assert {
    condition = (length(aws_iam_role_policy.lambda_logs) == 0 && length(aws_iam_role_policy.lambda_vpc) == 0
    && aws_iam_role_policy_attachment.lambda_managed[0].policy_arn == "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole")
    error_message = "managed mode: no inline policies, the AWS VPC execution policy instead"
  }

  assert {
    condition     = aws_db_instance.db[0].publicly_accessible == false && aws_db_instance.db[0].storage_encrypted
    error_message = "the created database must be private and encrypted"
  }
  assert {
    condition = (length(aws_security_group.db[0].ingress) == 1
      && length(coalesce(one(aws_security_group.db[0].ingress).cidr_blocks, [])) == 0
    && contains(one(aws_security_group.db[0].ingress).security_groups, aws_security_group.lambda[0].id))
    error_message = "Postgres must only accept the Lambda security group, never a CIDR"
  }
  assert {
    condition     = length(aws_lambda_function.svc["habit"].vpc_config) == 1 && length(aws_lambda_function.migrate.vpc_config) == 1
    error_message = "functions that use the private database must join the VPC"
  }
  assert {
    condition     = strcontains(nonsensitive(aws_lambda_function.svc["habit"].environment[0].variables.DATABASE_URL), "@openhabit-db.abc123.us-east-1.rds.amazonaws.com:5432/")
    error_message = "services must connect to the created RDS instance"
  }
  assert {
    condition     = length(aws_lambda_invocation.migrate) == 1
    error_message = "migrations run on apply when the database is created here"
  }
  assert {
    condition     = length(aws_cloudfront_distribution.app) == 0 && aws_apigatewayv2_route.web[0].route_key == "$default"
    error_message = "without CloudFront, the web Lambda serves everything outside /api"
  }
  assert {
    condition     = length(aws_s3_bucket_policy.web) == 0 && aws_s3_bucket_public_access_block.web.restrict_public_buckets
    error_message = "without CloudFront the bucket stays fully private with no read policy"
  }
  assert {
    condition     = nonsensitive(aws_lambda_function.svc["reminder"].environment[0].variables.PUBLIC_URL) == "https://abc123.execute-api.ap-south-1.amazonaws.com"
    error_message = "without CloudFront the API endpoint is the public URL"
  }
}

run "one_minute_reminders_and_sso" {
  command = apply

  variables {
    reminder_interval_minutes = 1
    public_url                = "https://habits.example.com/"
    oidc = {
      issuer        = "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_EXAMPLE"
      client_id     = "client"
      client_secret = "secret"
      provider_name = "Cognito"
    }
  }

  assert {
    condition     = aws_cloudwatch_event_rule.reminders.schedule_expression == "rate(1 minute)"
    error_message = "a 1-minute interval needs the singular rate expression"
  }
  assert {
    condition     = nonsensitive(aws_lambda_function.svc["auth"].environment[0].variables.OIDC_REDIRECT_URI) == "https://habits.example.com/api/auth/oidc/callback"
    error_message = "SSO callback must use the custom domain"
  }
}

run "long_interval_widens_catch_up" {
  command = apply

  variables {
    reminder_interval_minutes = 15
  }

  assert {
    condition     = nonsensitive(aws_lambda_function.svc["reminder"].environment[0].variables.REMINDER_CATCH_UP_MINUTES) == "20"
    error_message = "the catch-up window must outlast the scheduler interval"
  }
}

run "secrets_manager_keeps_secrets_out_of_the_environment" {
  command = apply

  variables {
    use_secrets_manager = true
    vapid               = { public_key = "pub", private_key = "priv-key-value", subject = "mailto:me@example.com" }
    mail                = { transport = "smtp", from = "OpenHabit <no-reply@example.com>", smtp_url = "smtp://user:pw@smtp.example.com:587", webhook_url = "" }
  }

  assert {
    condition     = nonsensitive(aws_lambda_function.svc["auth"].environment[0].variables.SECRETS_ARN) == "arn:aws:secretsmanager:ap-south-1:123456789012:secret:openhabit/app-AbCdEf"
    error_message = "functions must be told which secret to read"
  }
  assert {
    condition     = alltrue([for k, f in aws_lambda_function.svc : !contains(keys(f.environment[0].variables), "JWT_SECRET") && !contains(keys(f.environment[0].variables), "DATABASE_URL")])
    error_message = "JWT_SECRET and DATABASE_URL must not be in any function's plain-text environment"
  }
  assert {
    condition     = !contains(keys(aws_lambda_function.svc["reminder"].environment[0].variables), "VAPID_PRIVATE_KEY") && !contains(keys(aws_lambda_function.svc["auth"].environment[0].variables), "SMTP_URL")
    error_message = "the VAPID private key and SMTP URL belong in the secret"
  }
  assert {
    condition     = !contains(keys(aws_lambda_function.migrate.environment[0].variables), "ADMIN_DATABASE_URL") && !contains(keys(aws_lambda_function.migrate.environment[0].variables), "AUTH_DB_PASSWORD")
    error_message = "the migrate function must read its passwords from the secret"
  }
  assert {
    condition     = length(aws_iam_role_policy.lambda_secrets) + length(aws_iam_role_policy_attachment.lambda_secrets_managed) == 1
    error_message = "the role needs read access to the secret"
  }
  assert {
    condition     = nonsensitive(jsondecode(aws_secretsmanager_secret_version.app[0].secret_string).auth.SMTP_URL) == "smtp://user:pw@smtp.example.com:587" && nonsensitive(jsondecode(aws_secretsmanager_secret_version.app[0].secret_string).reminder.VAPID_PRIVATE_KEY) == "priv-key-value"
    error_message = "per-service secrets must be in the secret"
  }
  assert {
    condition     = nonsensitive(jsondecode(aws_secretsmanager_secret_version.app[0].secret_string).habit.DATABASE_URL) == "postgres://habit_svc:habit-pw%2Fneeds%2Bescaping@ep-test-pooler.example.neon.tech:5432/openhabit?sslmode=verify-full"
    error_message = "each service gets its own least-privilege database URL in the secret"
  }
}

run "default_keeps_secrets_in_the_environment" {
  command = apply

  assert {
    condition     = length(aws_secretsmanager_secret.app) == 0 && length(aws_iam_role_policy.lambda_secrets) == 0
    error_message = "Secrets Manager is opt-in"
  }
  assert {
    condition     = !contains(keys(aws_lambda_function.svc["auth"].environment[0].variables), "SECRETS_ARN")
    error_message = "no SECRETS_ARN without Secrets Manager"
  }
}

run "mail_settings_reach_the_auth_function_only" {
  command = apply

  variables {
    public_url                 = "https://habits.example.com"
    require_email_verification = true
    mail                       = { transport = "smtp", from = "OpenHabit <no-reply@example.com>", smtp_url = "smtp://user:pw@smtp.example.com:587", webhook_url = "" }
  }

  assert {
    condition     = nonsensitive(aws_lambda_function.svc["auth"].environment[0].variables.MAIL_TRANSPORT) == "smtp" && nonsensitive(aws_lambda_function.svc["auth"].environment[0].variables.PUBLIC_URL) == "https://habits.example.com"
    error_message = "the auth function sends the emails and links to the public URL"
  }
  assert {
    condition     = nonsensitive(aws_lambda_function.svc["auth"].environment[0].variables.REQUIRE_EMAIL_VERIFICATION) == "true"
    error_message = "require_email_verification must reach auth"
  }
  assert {
    condition     = !contains(keys(aws_lambda_function.svc["habit"].environment[0].variables), "SMTP_URL")
    error_message = "other functions must not receive the SMTP credentials"
  }
}

run "aurora_serverless_scales_to_zero" {
  command = apply

  variables {
    create_database            = true
    db_engine                  = "aurora-serverless"
    db_admin_password          = "admin-pw-0123456789abcdef"
    aurora_pause_after_seconds = 900
    use_managed_iam_policies   = true
  }

  assert {
    condition     = length(aws_rds_cluster.aurora) == 1 && length(aws_db_instance.db) == 0
    error_message = "aurora-serverless replaces the plain RDS instance"
  }
  assert {
    condition     = aws_rds_cluster.aurora[0].serverlessv2_scaling_configuration[0].min_capacity == 0 && aws_rds_cluster.aurora[0].serverlessv2_scaling_configuration[0].seconds_until_auto_pause == 900
    error_message = "the cluster must be able to pause at zero capacity"
  }
  assert {
    condition     = aws_rds_cluster_instance.aurora[0].instance_class == "db.serverless"
    error_message = "the instance class must be db.serverless"
  }
  assert {
    condition     = strcontains(nonsensitive(aws_lambda_function.svc["habit"].environment[0].variables.DATABASE_URL), "@openhabit-aurora.cluster-abc123.us-east-1.rds.amazonaws.com:")
    error_message = "services must connect to the cluster endpoint"
  }
}

run "rejects_bad_aurora_pause" {
  command = plan
  variables {
    db_engine                  = "aurora-serverless"
    aurora_pause_after_seconds = 60
  }
  expect_failures = [var.aurora_pause_after_seconds]
}

run "rejects_weak_secrets" {
  command = plan

  variables {
    jwt_secret = "change-me-change-me-change-me-change-me"
    db_passwords = {
      auth = "short"
    }
  }

  expect_failures = [var.jwt_secret, var.db_passwords]
}
