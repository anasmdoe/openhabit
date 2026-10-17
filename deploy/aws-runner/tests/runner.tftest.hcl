# Offline: `tofu test` in deploy/aws-runner (mocked AWS provider, no account needed).
mock_provider "aws" {
  mock_data "aws_vpc" {
    defaults = { id = "vpc-123" }
  }
  mock_data "aws_subnets" {
    defaults = { ids = ["subnet-a"] }
  }
  mock_data "aws_ssm_parameter" {
    defaults = { value = "ami-0123456789abcdef0" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:openhabit-runner/github-token-AbCdEf" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/openhabit-runner" }
  }
}

variables {
  github_repository = "anasmdoe/openhabit"
}

run "defaults" {
  command = apply

  assert {
    condition     = aws_instance.runner.metadata_options[0].http_tokens == "required"
    error_message = "IMDSv2 must be required"
  }
  assert {
    condition     = aws_instance.runner.root_block_device[0].encrypted == true
    error_message = "the root volume must be encrypted"
  }
  assert {
    condition     = length(aws_security_group.runner.ingress) == 0
    error_message = "the runner must have no inbound rules"
  }
  assert {
    condition     = strcontains(aws_instance.runner.user_data, "--ephemeral") && strcontains(aws_instance.runner.user_data, "anasmdoe/openhabit")
    error_message = "the runner must be ephemeral and bound to the repository"
  }
  assert {
    condition     = strcontains(aws_instance.runner.user_data, "self-hosted,openhabit-aws")
    error_message = "labels must include self-hosted and openhabit-aws"
  }
  assert {
    condition     = !strcontains(aws_instance.runner.user_data, "ghp_") && !strcontains(aws_instance.runner.user_data, "github_pat_")
    error_message = "no token may be baked into user data"
  }
  assert {
    condition     = length(aws_instance.runner.instance_market_options) == 0
    error_message = "on-demand by default"
  }
}

run "spot" {
  command = apply
  variables {
    use_spot = true
  }
  assert {
    condition     = length(aws_instance.runner.instance_market_options) == 1
    error_message = "use_spot must request a spot instance"
  }
}

run "rejects_bad_repository" {
  command = plan
  variables {
    github_repository = "not a repo"
  }
  expect_failures = [var.github_repository]
}
