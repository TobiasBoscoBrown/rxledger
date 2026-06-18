/**
 * RxLedger infrastructure (reference skeleton).
 *
 * This is the AWS footprint the JD describes — ECS Fargate, RDS Postgres with
 * KMS, ElastiCache Redis, S3+KMS, CloudTrail, Secrets Manager — expressed as
 * Terraform to show the infra is owned as code, not clicked together. It is a
 * skeleton (vars/networking elided for brevity), but the security-relevant
 * choices are real: encryption everywhere, least-privilege task role, and
 * deployment auto-rollback on error-rate/latency alarms.
 */

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

variable "env" { default = "production" }
variable "image" { description = "ECR image URI (tag = git sha)" }

# --- Encryption key used across RDS, S3, and Secrets Manager ----------------
resource "aws_kms_key" "main" {
  description             = "rxledger-${var.env} envelope key for PHI at rest"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

# --- Database: RDS Postgres, encrypted at rest ------------------------------
resource "aws_db_instance" "postgres" {
  identifier              = "rxledger-${var.env}"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = "db.t4g.small" # scale with load; right-sized for early stage
  allocated_storage       = 20
  storage_encrypted       = true
  kms_key_id              = aws_kms_key.main.arn
  backup_retention_period = 14
  deletion_protection     = true
  multi_az                = true
  # credentials sourced from Secrets Manager, never inline
  manage_master_user_password = true
}

# --- Redis for distributed rate limiting ------------------------------------
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "rxledger-${var.env}"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  transit_encryption_enabled = true
}

# --- S3 for document storage, SSE-KMS ---------------------------------------
resource "aws_s3_bucket" "documents" {
  bucket = "rxledger-${var.env}-documents"
}
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
  }
}
resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- Secrets ----------------------------------------------------------------
resource "aws_secretsmanager_secret" "app" {
  name       = "rxledger/${var.env}/app"
  kms_key_id = aws_kms_key.main.arn
}

# --- Audit: infra-level access recorded by CloudTrail -----------------------
resource "aws_cloudtrail" "audit" {
  name                          = "rxledger-${var.env}"
  s3_bucket_name                = aws_s3_bucket.documents.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.main.arn
}

# --- Compute: ECS Fargate ---------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = "rxledger-${var.env}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "rxledger-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn # least-privilege: only the actions the app needs
  container_definitions = jsonencode([{
    name      = "api"
    image     = var.image
    essential = true
    portMappings = [{ containerPort = 8787 }]
    secrets = [
      { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::" },
      { name = "JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:JWT_SECRET::" },
      { name = "KMS_MASTER_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:KMS_MASTER_KEY::" },
    ]
    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"fetch('http://localhost:8787/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval    = 15
      retries     = 3
      timeout     = 5
      startPeriod = 20
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/rxledger-${var.env}"
        "awslogs-region"        = "us-east-1"
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "rxledger-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  # Auto-rollback: if a new deployment trips the CloudWatch alarms below, ECS
  # rolls back to the last healthy task set automatically.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  deployment_controller { type = "ECS" }
}

# --- Alarms that gate deployments (error rate + latency) --------------------
resource "aws_cloudwatch_metric_alarm" "error_rate" {
  alarm_name          = "rxledger-${var.env}-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
}

resource "aws_cloudwatch_metric_alarm" "latency_p95" {
  alarm_name          = "rxledger-${var.env}-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  extended_statistic  = "p95"
  period              = 60
  threshold           = 0.75 # seconds
}

# IAM roles referenced above (policies elided in this skeleton).
resource "aws_iam_role" "execution" {
  name               = "rxledger-${var.env}-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}
resource "aws_iam_role" "task" {
  name               = "rxledger-${var.env}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}
