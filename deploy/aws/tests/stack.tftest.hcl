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
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/openhabit" }
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
    condition     = length(aws_lambda_function.svc) == 6 && length(aws_apigatewayv2_route.svc) == 17
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
    condition     = nonsensitive(aws_lambda_function.svc["habit"].environment[0].variables.DATABASE_URL) == "postgres://habit_svc:habit-pw%2Fneeds%2Bescaping@ep-test-pooler.example.neon.tech:5432/openhabit?sslmode=require"
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
    condition     = aws_scheduler_schedule.reminders.schedule_expression == "rate(5 minutes)" && nonsensitive(aws_lambda_function.svc["reminder"].environment[0].variables.REMINDER_CATCH_UP_MINUTES) == "15"
    error_message = "default: reminders every 5 minutes with a 15-minute catch-up window"
  }
  assert {
    condition     = aws_lambda_function.svc["auth"].architectures[0] == "arm64" && aws_lambda_function.svc["auth"].runtime == "nodejs22.x"
    error_message = "functions run on arm64 / Node 22"
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
    condition     = aws_scheduler_schedule.reminders.schedule_expression == "rate(1 minute)"
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
