# EventBridge Scheduler replaces reminder-service's in-process timer. Delivery is
# at-least-once; reminders_sent makes a duplicate invocation harmless.

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.svc["reminder"].arn]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "invoke-reminder"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

resource "aws_scheduler_schedule" "reminders" {
  name = "${var.name}-reminders"
  schedule_expression = (var.reminder_interval_minutes == 1
    ? "rate(1 minute)"
  : "rate(${var.reminder_interval_minutes} minutes)")

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.svc["reminder"].arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ source = "openhabit.scheduler" })

    # the next run comes soon anyway; don't pile up retries
    retry_policy {
      maximum_retry_attempts       = 0
      maximum_event_age_in_seconds = 60
    }
  }
}
