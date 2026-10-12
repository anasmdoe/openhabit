# HTTP API: pay per request, no idle cost. Same /api/* routing as the docker
# gateway and the k8s Ingress; /metrics is deliberately not routed.

resource "aws_apigatewayv2_api" "api" {
  name          = var.name
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.api_throttle_rate
    throttling_burst_limit = var.api_throttle_burst
  }
}

resource "aws_apigatewayv2_integration" "svc" {
  for_each = local.services

  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.svc[each.key].invoke_arn
  payload_format_version = "2.0"
}

locals {
  routes = merge([
    for svc, cfg in local.services : { for path in cfg.routes : "ANY ${path}" => svc }
  ]...)
}

resource "aws_apigatewayv2_route" "svc" {
  for_each = local.routes

  api_id    = aws_apigatewayv2_api.api.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.svc[each.value].id}"
}

resource "aws_lambda_permission" "api" {
  for_each = local.services

  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.svc[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
