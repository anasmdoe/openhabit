variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name" {
  description = "Prefix for the runner's resources."
  type        = string
  default     = "openhabit-runner"
}

variable "github_repository" {
  description = "owner/repo the runner serves, e.g. anasmdoe/openhabit."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like owner/repo."
  }
}

variable "runner_labels" {
  description = "Extra labels; workflows select the runner with runs-on: [self-hosted, <label>]."
  type        = list(string)
  default     = ["openhabit-aws"]
}

variable "instance_type" {
  description = "Chromium plus the Vite build want 4 GB of RAM: t3.medium. t3.small works for the demo-mode suite."
  type        = string
  default     = "t3.medium"
}

variable "use_spot" {
  description = "Run on a persistent spot instance (about 70% cheaper). When AWS reclaims the capacity the instance is stopped, not terminated, and starts again when capacity returns; the data disk and the runner service survive, and the runner re-registers itself."
  type        = bool
  default     = true
}

variable "data_volume_gb" {
  description = "Size of the separate data disk that keeps the npm cache, Playwright browsers and job workspaces across restarts and instance replacements. 0 = no data disk."
  type        = number
  default     = 40
}

variable "volume_gb" {
  type    = number
  default = 30
}

variable "subnet_id" {
  description = "Subnet for the instance (needs outbound internet to reach GitHub and npm). Empty = a subnet of the default VPC."
  type        = string
  default     = ""
}

variable "runner_version" {
  description = "actions/runner release to install; empty = the latest."
  type        = string
  default     = ""
}

variable "secret_name" {
  description = "Secrets Manager secret that holds the GitHub token the instance uses to register itself."
  type        = string
  default     = ""
}

variable "use_managed_iam_policies" {
  description = "For sandboxes that deny inline role policies (iam:PutRolePolicy): attach the broader AWS-managed SecretsManagerReadWrite instead of a policy limited to the one secret."
  type        = bool
  default     = false
}
