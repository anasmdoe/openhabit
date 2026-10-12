output "app_url" {
  description = "Open this in a browser (and use it as PUBLIC_URL / ntfy snooze base)."
  value       = local.public_url
}

output "api_endpoint" {
  description = "Direct HTTP API endpoint (normally reached via app_url/api)."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "web_bucket" {
  description = "S3 bucket that holds the built frontend."
  value       = aws_s3_bucket.web.bucket
}

output "distribution_id" {
  description = "CloudFront distribution to invalidate after a frontend upload."
  value       = aws_cloudfront_distribution.app.id
}
