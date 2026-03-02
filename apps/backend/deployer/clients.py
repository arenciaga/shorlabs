"""
AWS Client Management

Provides lazy-loaded AWS clients for better testing and resource management.
"""

import boto3
from functools import lru_cache



@lru_cache()
def get_ecr_client():
    """Get the ECR client (cached)."""
    return boto3.client("ecr")


@lru_cache()
def get_lambda_client():
    """Get the Lambda client (cached)."""
    return boto3.client("lambda")


@lru_cache()
def get_iam_client():
    """Get the IAM client (cached)."""
    return boto3.client("iam")


@lru_cache()
def get_sts_client():
    """Get the STS client (cached)."""
    return boto3.client("sts")


@lru_cache()
def get_codebuild_client():
    """Get the CodeBuild client (cached)."""
    return boto3.client("codebuild")


@lru_cache()
def get_logs_client():
    """Get the CloudWatch Logs client (cached)."""
    return boto3.client("logs")


def get_aws_account_id() -> str:
    """Get the AWS account ID."""
    return get_sts_client().get_caller_identity()["Account"]


def get_aws_region() -> str:
    """Get the AWS region."""
    return boto3.session.Session().region_name or "us-east-1"


@lru_cache()
def get_rds_client():
    """Get the RDS client (cached)."""
    return boto3.client("rds")


@lru_cache()
def get_ec2_client():
    """Get the EC2 client (cached). Used for security group management."""
    return boto3.client("ec2")


@lru_cache()
def get_secretsmanager_client():
    """Get the Secrets Manager client (cached)."""
    return boto3.client("secretsmanager")
