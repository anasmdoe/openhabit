# Optional RDS Postgres (create_database) and the migrate Lambda, which applies
# db/init.sql and the service role passwords from inside AWS on every apply
# where they changed — no direct database connection needed from your machine.
#
# create_database keeps the instance private: the Lambdas join the default VPC
# and only their security group may connect. VPC Lambdas have no internet
# access unless nat_mode is set (NAT gateway or a cheap NAT instance), so without it ntfy
# reminder pushes, webhooks and SSO discovery don't work. For production, an
# external Postgres (db_host) keeps the Lambdas out of a VPC and costs nothing idle.

data "aws_vpc" "default" {
  count   = var.create_database ? 1 : 0
  default = true
}

# the VPC's default (public) subnets — not the private ones nat_mode adds
data "aws_subnets" "default" {
  count = var.create_database ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default[0].id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# Not every AZ offers every instance type (t3.micro is missing from us-east-1e),
# so the NAT instance goes into a default subnet whose AZ does.
data "aws_ec2_instance_type_offerings" "nat" {
  count         = var.create_database && var.nat_mode != "none" ? 1 : 0
  location_type = "availability-zone"
  filter {
    name   = "instance-type"
    values = ["t3.micro"]
  }
}

data "aws_subnets" "nat" {
  count = var.create_database && var.nat_mode != "none" ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default[0].id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
  filter {
    name   = "availability-zone"
    values = data.aws_ec2_instance_type_offerings.nat[0].locations
  }
}

resource "aws_security_group" "lambda" {
  count       = var.create_database ? 1 : 0
  name        = "${var.name}-lambda"
  description = "${var.name} Lambda functions"
  vpc_id      = data.aws_vpc.default[0].id

  egress {
    description = "Postgres and AWS APIs inside the VPC"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [data.aws_vpc.default[0].cidr_block]
  }

  # with the NAT gateway: ntfy pushes, webhooks and SSO discovery (HTTP/HTTPS only)
  dynamic "egress" {
    for_each = local.nat ? [80, 443] : []
    content {
      description = "Outbound HTTP(S) through the NAT gateway"
      from_port   = egress.value
      to_port     = egress.value
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }
}

resource "aws_security_group" "db" {
  count       = var.create_database ? 1 : 0
  name        = "${var.name}-db"
  description = "Postgres for ${var.name}: Lambda functions only"
  vpc_id      = data.aws_vpc.default[0].id

  ingress {
    description     = "Postgres from the Lambda functions"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda[0].id]
  }
}

resource "aws_db_subnet_group" "db" {
  count      = var.create_database ? 1 : 0
  name       = "${var.name}-db"
  subnet_ids = data.aws_subnets.default[0].ids
}

resource "aws_db_instance" "db" {
  count = var.create_database && var.db_engine == "rds" ? 1 : 0

  identifier              = "${var.name}-db"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = var.db_instance_class
  allocated_storage       = 20
  storage_type            = "gp2"
  storage_encrypted       = true
  db_name                 = var.db_name
  username                = "openhabit_admin"
  password                = var.db_admin_password
  publicly_accessible     = false
  db_subnet_group_name    = aws_db_subnet_group.db[0].name
  vpc_security_group_ids  = [aws_security_group.db[0].id]
  backup_retention_period = 0
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = true

  lifecycle {
    precondition {
      condition     = length(var.db_admin_password) >= 16
      error_message = "create_database needs db_admin_password (16+ characters)."
    }
  }
}

# ---- Aurora PostgreSQL Serverless v2 (db_engine = "aurora-serverless") --------------
# Scales to zero capacity after aurora_pause_after_seconds without connections, so an idle
# deployment costs only storage (about $0.10 per GB-month). The first request after a pause waits
# ~15 s while the database resumes: Lambda timeouts of 30 s absorb that, the 10 s sandbox limit does
# not (the request fails once and the retry works).

locals {
  aurora = var.create_database && var.db_engine == "aurora-serverless"
}

resource "aws_rds_cluster" "aurora" {
  count = local.aurora ? 1 : 0

  cluster_identifier      = "${var.name}-aurora"
  engine                  = "aurora-postgresql"
  engine_version          = "16"
  database_name           = var.db_name
  master_username         = "openhabit_admin"
  master_password         = var.db_admin_password
  db_subnet_group_name    = aws_db_subnet_group.db[0].name
  vpc_security_group_ids  = [aws_security_group.db[0].id]
  storage_encrypted       = true
  backup_retention_period = 1 # Aurora's minimum
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = true

  serverlessv2_scaling_configuration {
    min_capacity             = 0
    max_capacity             = var.aurora_max_acu
    seconds_until_auto_pause = var.aurora_pause_after_seconds
  }

  lifecycle {
    precondition {
      condition     = length(var.db_admin_password) >= 16
      error_message = "create_database needs db_admin_password (16+ characters)."
    }
  }
}

resource "aws_rds_cluster_instance" "aurora" {
  count = local.aurora ? 1 : 0

  identifier         = "${var.name}-aurora-1"
  cluster_identifier = aws_rds_cluster.aurora[0].id
  engine             = aws_rds_cluster.aurora[0].engine
  engine_version     = aws_rds_cluster.aurora[0].engine_version
  instance_class     = "db.serverless"
}

# ---- optional internet egress (nat_mode) -----------------------------------------
# The VPC functions move to two private subnets whose default route goes through
# either a managed NAT gateway or a small NAT instance in a public default subnet.
# The database stays private either way.

data "aws_availability_zones" "available" {
  count = local.nat ? 1 : 0
  state = "available"
}

resource "aws_subnet" "private" {
  count             = local.nat ? 2 : 0
  vpc_id            = data.aws_vpc.default[0].id
  cidr_block        = cidrsubnet(data.aws_vpc.default[0].cidr_block, 8, 200 + count.index)
  availability_zone = data.aws_availability_zones.available[0].names[count.index]
  tags              = { Name = "${var.name}-private-${count.index}" }
}

resource "aws_eip" "nat" {
  count  = local.nat && var.nat_mode == "gateway" ? 1 : 0
  domain = "vpc"
}

resource "aws_nat_gateway" "nat" {
  count         = local.nat && var.nat_mode == "gateway" ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = data.aws_subnets.default[0].ids[0]
  tags          = { Name = var.name }
}

# NAT instance: Amazon Linux forwarding and masquerading for the private subnets.
data "aws_ssm_parameter" "al2023" {
  count = local.nat && var.nat_mode == "instance" ? 1 : 0
  name  = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_security_group" "nat" {
  count       = local.nat && var.nat_mode == "instance" ? 1 : 0
  name        = "${var.name}-nat"
  description = "${var.name} NAT instance: forwards traffic from the Lambda functions only"
  vpc_id      = data.aws_vpc.default[0].id

  ingress {
    description     = "Traffic to forward, from the Lambda functions"
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    security_groups = [aws_security_group.lambda[0].id]
  }
  egress {
    description = "Forwarded traffic to the internet"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "nat" {
  count                       = local.nat && var.nat_mode == "instance" ? 1 : 0
  ami                         = data.aws_ssm_parameter.al2023[0].value
  instance_type               = "t3.micro"
  subnet_id                   = concat(data.aws_subnets.nat[0].ids, data.aws_subnets.default[0].ids)[0]
  vpc_security_group_ids      = [aws_security_group.nat[0].id]
  associate_public_ip_address = true
  source_dest_check           = false

  credit_specification {
    cpu_credits = "standard"
  }
  metadata_options {
    http_tokens = "required"
  }

  user_data = <<-EOT
    #!/bin/bash
    set -e
    echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/90-nat.conf
    sysctl --system
    dnf install -y iptables-services
    IF=$(ip route show default | awk '{print $5; exit}')
    iptables -t nat -A POSTROUTING -o "$IF" -j MASQUERADE
    iptables -P FORWARD ACCEPT
    iptables -F FORWARD
    service iptables save
    systemctl enable --now iptables
  EOT

  tags = { Name = "${var.name}-nat" }
}

resource "aws_route_table" "private" {
  count  = local.nat ? 1 : 0
  vpc_id = data.aws_vpc.default[0].id

  route {
    cidr_block           = "0.0.0.0/0"
    nat_gateway_id       = var.nat_mode == "gateway" ? aws_nat_gateway.nat[0].id : null
    network_interface_id = var.nat_mode == "instance" ? aws_instance.nat[0].primary_network_interface_id : null
  }
}

resource "aws_route_table_association" "private" {
  count          = local.nat ? 2 : 0
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}

# Lets the functions attach to the VPC (create_database only).
data "aws_iam_policy_document" "lambda_vpc" {
  statement {
    actions = [
      "ec2:CreateNetworkInterface", "ec2:DescribeNetworkInterfaces", "ec2:DeleteNetworkInterface",
      "ec2:AssignPrivateIpAddresses", "ec2:UnassignPrivateIpAddresses",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "lambda_vpc" {
  count  = var.create_database && !var.use_managed_iam_policies ? 1 : 0
  name   = "vpc"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_vpc.json
}

locals {
  # functions that talk to the database join the VPC when it's private
  nat = var.create_database && var.nat_mode != "none"

  vpc_config = var.create_database ? [{
    subnet_ids         = local.nat ? aws_subnet.private[*].id : data.aws_subnets.default[0].ids
    security_group_ids = [aws_security_group.lambda[0].id]
  }] : []

  admin_url = (var.create_database
    ? format("postgres://openhabit_admin:%s@%s:%d/%s?sslmode=%s",
    urlencode(var.db_admin_password), local.db_host, var.db_port, var.db_name, var.db_sslmode)
  : var.db_admin_url)
  run_migrations = var.create_database || nonsensitive(var.db_admin_url != "")
}

resource "aws_lambda_function" "migrate" {
  function_name    = "${var.name}-migrate"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = [var.lambda_architecture]
  handler          = "index.handler"
  filename         = "${path.module}/build/migrate.zip"
  source_code_hash = filebase64sha256("${path.module}/build/migrate.zip")
  memory_size      = var.lambda_memory_mb
  timeout          = var.lambda_timeout

  dynamic "vpc_config" {
    for_each = local.vpc_config
    content {
      subnet_ids         = vpc_config.value.subnet_ids
      security_group_ids = vpc_config.value.security_group_ids
    }
  }

  environment {
    variables = var.use_secrets_manager ? merge(local.common_env, {
      SECRETS_ARN = aws_secretsmanager_secret.app[0].arn
      }) : merge(local.common_env, {
      ADMIN_DATABASE_URL    = local.admin_url
      AUTH_DB_PASSWORD      = var.db_passwords["auth"]
      HABIT_DB_PASSWORD     = var.db_passwords["habit"]
      TRACKING_DB_PASSWORD  = var.db_passwords["tracking"]
      ANALYTICS_DB_PASSWORD = var.db_passwords["analytics"]
      SOCIAL_DB_PASSWORD    = var.db_passwords["social"]
      REMINDER_DB_PASSWORD  = var.db_passwords["reminder"]
    })
  }

  depends_on = [aws_cloudwatch_log_group.fn, aws_iam_role_policy.lambda_logs, aws_iam_role_policy.lambda_vpc, aws_iam_role_policy_attachment.lambda_managed, aws_iam_role_policy.lambda_secrets, aws_iam_role_policy_attachment.lambda_secrets_managed]
}

resource "aws_lambda_invocation" "migrate" {
  count         = local.run_migrations ? 1 : 0
  function_name = aws_lambda_function.migrate.function_name
  input         = jsonencode({})

  # re-run when the schema, the migrate code or a password changes
  triggers = {
    code      = aws_lambda_function.migrate.source_code_hash
    passwords = sha256(jsonencode(var.db_passwords))
    secrets   = var.use_secrets_manager ? aws_secretsmanager_secret_version.app[0].version_id : ""
  }

  depends_on = [aws_db_instance.db, aws_rds_cluster_instance.aurora]
}
