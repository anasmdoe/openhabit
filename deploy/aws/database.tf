# Optional RDS Postgres (create_database) and the migrate Lambda, which applies
# db/init.sql and the service role passwords from inside AWS on every apply
# where they changed — no direct database connection needed from your machine.
#
# create_database keeps the instance private: the Lambdas join the default VPC
# and only their security group may connect. VPC Lambdas have no internet
# access without a NAT gateway (~$30+/month), so ntfy reminder pushes, webhooks
# and SSO discovery don't work in this mode — it's meant for sandboxes and
# testing. For production, use an external Postgres (db_host) instead.

data "aws_vpc" "default" {
  count   = var.create_database ? 1 : 0
  default = true
}

data "aws_subnets" "default" {
  count = var.create_database ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default[0].id]
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
  count = var.create_database ? 1 : 0

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
  vpc_config = var.create_database ? [{
    subnet_ids         = data.aws_subnets.default[0].ids
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
    variables = merge(local.common_env, {
      ADMIN_DATABASE_URL    = local.admin_url
      AUTH_DB_PASSWORD      = var.db_passwords["auth"]
      HABIT_DB_PASSWORD     = var.db_passwords["habit"]
      TRACKING_DB_PASSWORD  = var.db_passwords["tracking"]
      ANALYTICS_DB_PASSWORD = var.db_passwords["analytics"]
      SOCIAL_DB_PASSWORD    = var.db_passwords["social"]
      REMINDER_DB_PASSWORD  = var.db_passwords["reminder"]
    })
  }

  depends_on = [aws_cloudwatch_log_group.fn, aws_iam_role_policy.lambda_logs, aws_iam_role_policy.lambda_vpc, aws_iam_role_policy_attachment.lambda_managed]
}

resource "aws_lambda_invocation" "migrate" {
  count         = local.run_migrations ? 1 : 0
  function_name = aws_lambda_function.migrate.function_name
  input         = jsonencode({})

  # re-run when the schema, the migrate code or a password changes
  triggers = {
    code      = aws_lambda_function.migrate.source_code_hash
    passwords = sha256(jsonencode(var.db_passwords))
  }

  depends_on = [aws_db_instance.db]
}
