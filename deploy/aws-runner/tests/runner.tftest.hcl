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
  mock_data "aws_subnet" {
    defaults = { availability_zone = "us-east-1b" }
  }
  mock_resource "aws_ebs_volume" {
    defaults = { id = "vol-0123456789abcdef0" }
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
    condition     = length(aws_instance.runner.instance_market_options) == 1 && aws_instance.runner.instance_market_options[0].spot_options[0].spot_instance_type == "persistent" && aws_instance.runner.instance_market_options[0].spot_options[0].instance_interruption_behavior == "stop"
    error_message = "spot by default, persistent, and stopped (not terminated) when reclaimed"
  }
  assert {
    condition     = length(aws_ebs_volume.data) == 1 && aws_ebs_volume.data[0].encrypted == true && length(aws_volume_attachment.data) == 1
    error_message = "an encrypted data disk must be attached"
  }
  assert {
    condition     = aws_ebs_volume.data[0].availability_zone == "us-east-1b"
    error_message = "the data disk must be in the instance's availability zone"
  }
  assert {
    condition     = strcontains(aws_instance.runner.user_data, "SERIAL=\"vol0123456789abcdef0\"") && strcontains(aws_instance.runner.user_data, "LABEL=ohdata")
    error_message = "the boot script must find, format once and mount the data disk"
  }
}

run "on_demand_without_data_disk" {
  command = apply
  variables {
    use_spot       = false
    data_volume_gb = 0
  }
  assert {
    condition     = length(aws_instance.runner.instance_market_options) == 0 && length(aws_ebs_volume.data) == 0
    error_message = "on-demand and no extra disk when asked"
  }
}

run "rejects_bad_repository" {
  command = plan
  variables {
    github_repository = "not a repo"
  }
  expect_failures = [var.github_repository]
}
