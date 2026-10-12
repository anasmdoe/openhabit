terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }

  # State stays local by default. For a team or CI, add a backend, e.g.:
  # backend "s3" { bucket = "my-tf-state" key = "openhabit.tfstate" region = "ap-south-1" }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = var.tags
  }
}

# The EventBridge rule can be created untagged for accounts that deny
# events:TagResource (see var.tag_event_rule).
provider "aws" {
  alias  = "events"
  region = var.region

  default_tags {
    tags = var.tag_event_rule ? var.tags : {}
  }
}

data "aws_caller_identity" "current" {}
