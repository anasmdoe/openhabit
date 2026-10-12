# Private S3 bucket for the built SPA, served through CloudFront. CloudFront
# also forwards /api/* to the HTTP API, so the app and API share one origin
# (no CORS) exactly like the docker gateway.
#
# With enable_cdn = false (accounts without CloudFront) the bucket stays private
# and unread, and the web Lambda in api.tf serves the frontend instead.

resource "aws_s3_bucket" "web" {
  bucket        = "${var.name}-web-${data.aws_caller_identity.current.account_id}"
  force_destroy = true # only build output lives here
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "web" {
  count                             = var.enable_cdn ? 1 : 0
  name                              = "${var.name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Only the CloudFront distribution may read the bucket.
data "aws_iam_policy_document" "web_bucket" {
  count = var.enable_cdn ? 1 : 0
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.app[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  count  = var.enable_cdn ? 1 : 0
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket[0].json
}

data "aws_cloudfront_cache_policy" "optimized" {
  count = var.enable_cdn ? 1 : 0
  name  = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  count = var.enable_cdn ? 1 : 0
  name  = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  count = var.enable_cdn ? 1 : 0
  name  = "Managed-AllViewerExceptHostHeader"
}

# Same security headers and CSP as gateway/nginx.conf (and the web Lambda).
resource "aws_cloudfront_response_headers_policy" "security" {
  count = var.enable_cdn ? 1 : 0
  name  = "${var.name}-security"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      override                   = true
    }
    content_security_policy {
      content_security_policy = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; script-src 'self'; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com"
      override                = true
    }
  }
}

resource "aws_cloudfront_distribution" "app" {
  count               = var.enable_cdn ? 1 : 0
  enabled             = true
  comment             = var.name
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  http_version        = "http2and3"

  origin {
    origin_id                = "web"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web[0].id
  }

  origin {
    origin_id   = "api"
    domain_name = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = "web"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized[0].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled[0].id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host[0].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
