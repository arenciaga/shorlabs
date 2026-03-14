"""
AWS Services Module

AWS service operations for deployment.
"""

from .ecr import create_ecr_repository, delete_ecr_repository
from .iam import get_or_create_codebuild_role, get_or_create_lambda_role, get_or_create_ecs_task_execution_role, get_or_create_ecs_instance_role
from .codebuild import create_or_update_codebuild_project, start_build, wait_for_build
from .lambda_service import create_or_update_lambda, delete_lambda
from .cloudwatch import get_build_logs, get_lambda_logs, delete_lambda_logs, get_ecs_logs, delete_ecs_logs
from .rds import (
    ensure_db_security_group,
    ensure_db_subnet_group,
    get_cluster_identifier,
    create_aurora_cluster,
    wait_for_cluster_available,
    get_cluster_status,
    get_cluster_secret,
    delete_aurora_cluster,
    get_cluster_security_group_ids,
    get_security_group_rules,
)
from .ecs_service import (
    get_cluster_name,
    ensure_ecs_cluster,
    register_task_definition,
    create_or_update_ecs_service,
    wait_for_service_stable,
    delete_ecs_service,
    delete_ecs_log_group,
    delete_service_infra,
    ensure_ecs_security_group,
    ensure_ec2_security_group,
    ensure_launch_template,
    ensure_auto_scaling_group,
    ensure_ec2_capacity_provider,
    get_ecs_optimized_ami,
    get_default_vpc_and_subnets,
    get_ecs_service_name,
)
from .alb import (
    ensure_shared_alb,
    ensure_alb_security_group,
    create_target_group,
    create_listener_rule,
    delete_target_group,
    delete_listener_rule,
    get_alb_dns_name,
    get_target_group_for_host,
)

__all__ = [
    # ECR
    "create_ecr_repository",
    "delete_ecr_repository",
    # IAM
    "get_or_create_codebuild_role",
    "get_or_create_lambda_role",
    "get_or_create_ecs_task_execution_role",
    "get_or_create_ecs_instance_role",
    # CodeBuild
    "create_or_update_codebuild_project",
    "start_build",
    "wait_for_build",
    # Lambda
    "create_or_update_lambda",
    "delete_lambda",
    # CloudWatch Logs
    "get_build_logs",
    "get_lambda_logs",
    "delete_lambda_logs",
    "get_ecs_logs",
    "delete_ecs_logs",
    # RDS (Aurora Serverless v2)
    "ensure_db_security_group",
    "ensure_db_subnet_group",
    "get_cluster_identifier",
    "create_aurora_cluster",
    "wait_for_cluster_available",
    "get_cluster_status",
    "get_cluster_secret",
    "delete_aurora_cluster",
    "get_cluster_security_group_ids",
    "get_security_group_rules",
    # ECS EC2
    "get_cluster_name",
    "ensure_ecs_cluster",
    "register_task_definition",
    "create_or_update_ecs_service",
    "wait_for_service_stable",
    "delete_ecs_service",
    "delete_ecs_log_group",
    "delete_service_infra",
    "ensure_ecs_security_group",
    "ensure_ec2_security_group",
    "ensure_launch_template",
    "ensure_auto_scaling_group",
    "ensure_ec2_capacity_provider",
    "get_ecs_optimized_ami",
    "get_default_vpc_and_subnets",
    "get_ecs_service_name",
    # ALB
    "ensure_shared_alb",
    "ensure_alb_security_group",
    "create_target_group",
    "create_listener_rule",
    "delete_target_group",
    "delete_listener_rule",
    "get_alb_dns_name",
    "get_target_group_for_host",
]
