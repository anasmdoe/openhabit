variable "region" {
  description = "AWS region for the Lambdas, API and bucket (ap-south-1 = Mumbai)."
  type        = string
  default     = "ap-south-1"
}

variable "name" {
  description = "Prefix for every resource name."
  type        = string
  default     = "openhabit"
}

# ---- database: any Postgres reachable over the internet with TLS -------------
# (Neon, Supabase, Aiven, Crunchy Bridge, or a public RDS). Keeping it outside
# a VPC means the Lambdas need no NAT gateway, so idle cost stays near zero.

variable "db_host" {
  description = "Postgres host. With Neon, use the pooled host (\"-pooler\" in the name)."
  type        = string
}

variable "db_port" {
  type    = number
  default = 5432
}

variable "db_name" {
  type    = string
  default = "openhabit"
}

variable "db_sslmode" {
  description = "libpq sslmode for the service connections."
  type        = string
  default     = "require"
}

variable "db_passwords" {
  description = "Password per service role (auth, habit, tracking, analytics, social, reminder) — the *_DB_PASSWORD values from .env. scripts/deploy-aws.sh passes them in."
  type        = map(string)
  sensitive   = true

  validation {
    condition = alltrue([
      for svc in ["auth", "habit", "tracking", "analytics", "social", "reminder"] :
      length(lookup(var.db_passwords, svc, "")) >= 16
    ])
    error_message = "db_passwords needs a 16+ character entry for each of: auth, habit, tracking, analytics, social, reminder."
  }
}

variable "jwt_secret" {
  description = "Shared JWT secret (JWT_SECRET from .env), at least 32 characters."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.jwt_secret) >= 32 && !strcontains(lower(var.jwt_secret), "change-me")
    error_message = "jwt_secret must be at least 32 random characters."
  }
}

# ---- app settings -------------------------------------------------------------

variable "public_url" {
  description = "Public address of the app if you put a custom domain in front; empty = the CloudFront URL."
  type        = string
  default     = ""
}

variable "allow_registration" {
  description = "Allow new sign-ups. Turn off once your accounts exist."
  type        = bool
  default     = true
}

variable "oidc" {
  description = "Optional OIDC single sign-on (Cognito, Authentik, Keycloak, Google, ...). Leave issuer empty to disable."
  type = object({
    issuer        = string
    client_id     = string
    client_secret = string
    provider_name = string
  })
  default = {
    issuer        = ""
    client_id     = ""
    client_secret = ""
    provider_name = "SSO"
  }
  sensitive = true
}

variable "reminder_interval_minutes" {
  description = "How often EventBridge Scheduler runs the reminder check (1-15). Each run queries Postgres, so a short interval keeps a scale-to-zero database awake."
  type        = number
  default     = 5

  validation {
    condition     = var.reminder_interval_minutes >= 1 && var.reminder_interval_minutes <= 15
    error_message = "reminder_interval_minutes must be between 1 and 15."
  }
}

# ---- cost guards ----------------------------------------------------------------

variable "lambda_memory_mb" {
  type    = number
  default = 256
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "api_throttle_rate" {
  description = "Steady-state API requests per second (caps the bill if someone hammers the API)."
  type        = number
  default     = 20
}

variable "api_throttle_burst" {
  type    = number
  default = 50
}

variable "cloudfront_price_class" {
  description = "PriceClass_100 = NA/EU edges only (cheapest); PriceClass_200 adds Asia incl. India."
  type        = string
  default     = "PriceClass_200"
}
