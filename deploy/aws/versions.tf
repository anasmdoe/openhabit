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
    tags = {
      app = var.name
    }
  }
}

data "aws_caller_identity" "current" {}
