# An EventBridge rule replaces reminder-service's in-process timer. Delivery is
# at-least-once; reminders_sent makes a duplicate invocation harmless.

resource "aws_cloudwatch_event_rule" "reminders" {
  provider = aws.events
  name     = "${var.name}-reminders"
  schedule_expression = (var.reminder_interval_minutes == 1
    ? "rate(1 minute)"
  : "rate(${var.reminder_interval_minutes} minutes)")
}

resource "aws_cloudwatch_event_target" "reminders" {
  rule  = aws_cloudwatch_event_rule.reminders.name
  arn   = aws_lambda_function.svc["reminder"].arn
  input = jsonencode({ source = "openhabit.scheduler" })

  # the next run comes soon anyway; don't pile up retries
  retry_policy {
    maximum_retry_attempts       = 0
    maximum_event_age_in_seconds = 60
  }
}

resource "aws_lambda_permission" "reminders" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.svc["reminder"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.reminders.arn
}
