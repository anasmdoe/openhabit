# A self-hosted GitHub Actions runner on EC2, for the browser-test workflow (.github/workflows/e2e.yml).
#
# Why self-hosted: the tests can run inside your AWS account next to the deployed stack, so the
# "live" suite reaches it without opening anything to the internet, and the minutes are not metered.
#
# How it works: the instance has no inbound ports (use SSM Session Manager to log in). At boot it
# reads a GitHub token from Secrets Manager, asks GitHub for a short-lived registration token, and
# registers an EPHEMERAL runner: one job, then it deregisters and registers a fresh one, so no job
# can leave anything behind for the next.
#
# Security: never point a self-hosted runner at a public repository that accepts pull requests from
# forks: their code would run on this machine. e2e.yml only runs for pushes, schedules, manual runs
# and same-repository pull requests.

locals {
  secret_name = var.secret_name != "" ? var.secret_name : "${var.name}/github-token"
  labels      = join(",", concat(["self-hosted"], var.runner_labels))
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  # the VPC's own public subnets, not private ones other stacks (nat_mode) may have added
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id"
}

# The GitHub token (fine-grained PAT with "Administration: read and write" on the repository, or a
# GitHub App token) is put here by you, never in Terraform:
#   aws secretsmanager put-secret-value --secret-id <secret_name> --secret-string ghp_xxx
resource "aws_secretsmanager_secret" "github_token" {
  name                    = local.secret_name
  description             = "Token the OpenHabit CI runner uses to register itself with GitHub"
  recovery_window_in_days = 0
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "runner" {
  name               = var.name
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

# Session Manager: shell access without SSH or an open port.
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.runner.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "read_token" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.github_token.arn]
  }
}

resource "aws_iam_role_policy" "read_token" {
  count  = var.use_managed_iam_policies ? 0 : 1
  name   = "read-github-token"
  role   = aws_iam_role.runner.id
  policy = data.aws_iam_policy_document.read_token.json
}

resource "aws_iam_role_policy_attachment" "read_token_managed" {
  count      = var.use_managed_iam_policies ? 1 : 0
  role       = aws_iam_role.runner.name
  policy_arn = "arn:aws:iam::aws:policy/SecretsManagerReadWrite"
}

resource "aws_iam_instance_profile" "runner" {
  name = var.name
  role = aws_iam_role.runner.name
}

resource "aws_security_group" "runner" {
  name        = var.name
  description = "OpenHabit CI runner: outbound only"
  vpc_id      = data.aws_vpc.default.id

  egress {
    description = "GitHub, npm, the deployed stack"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

locals {
  subnet_id = var.subnet_id != "" ? var.subnet_id : data.aws_subnets.default.ids[0]
}

data "aws_subnet" "runner" {
  id = local.subnet_id
}

# A disk of its own for caches and workspaces. It outlives the instance (spot reclaim, replacement on a
# user-data change, tofu destroy of only the instance), so a restart does not re-download Chromium and
# every npm package. It is encrypted and formatted on first use by the boot script.
resource "aws_ebs_volume" "data" {
  count             = var.data_volume_gb > 0 ? 1 : 0
  availability_zone = data.aws_subnet.runner.availability_zone
  size              = var.data_volume_gb
  type              = "gp3"
  encrypted         = true
  tags              = { Name = "${var.name}-data" }
}

resource "aws_volume_attachment" "data" {
  count                          = var.data_volume_gb > 0 ? 1 : 0
  device_name                    = "/dev/sdf"
  volume_id                      = aws_ebs_volume.data[0].id
  instance_id                    = aws_instance.runner.id
  stop_instance_before_detaching = true
}

resource "aws_instance" "runner" {
  ami                    = data.aws_ssm_parameter.ubuntu.value
  instance_type          = var.instance_type
  subnet_id              = local.subnet_id
  iam_instance_profile   = aws_iam_instance_profile.runner.name
  vpc_security_group_ids = [aws_security_group.runner.id]

  # outbound-only: a public address for reaching GitHub and npm, with no inbound rule at all
  associate_public_ip_address = true

  metadata_options {
    http_tokens                 = "required" # IMDSv2 only
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_size = var.volume_gb
    volume_type = "gp3"
    encrypted   = true
  }

  dynamic "instance_market_options" {
    for_each = var.use_spot ? [1] : []
    content {
      market_type = "spot"
      spot_options {
        instance_interruption_behavior = "stop"
        spot_instance_type             = "persistent"
      }
    }
  }

  user_data = templatefile("${path.module}/user-data.sh.tpl", {
    repository     = var.github_repository
    labels         = local.labels
    secret_id      = aws_secretsmanager_secret.github_token.name
    region         = var.region
    runner_version = var.runner_version
    # the data disk's serial as the NVMe device exposes it (the volume id without the dash)
    data_volume_serial = var.data_volume_gb > 0 ? replace(aws_ebs_volume.data[0].id, "-", "") : ""
  })
  user_data_replace_on_change = true

  tags = { Name = var.name }
}
