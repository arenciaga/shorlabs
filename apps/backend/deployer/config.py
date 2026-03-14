"""
Deployer Configuration

Centralized constants and configuration for the Shorlabs deployer.
"""

# AWS Resource Naming
CODEBUILD_PROJECT_NAME = "shorlabs-builder"
LAMBDA_FUNCTION_PREFIX = "shorlabs"
ECR_REPO_PREFIX = "shorlabs"

# IAM Role Names
CODEBUILD_ROLE_NAME = "shorlabs-codebuild-role"
LAMBDA_ROLE_NAME = "shorlabs-lambda-execution-role"

# Default deployment settings
DEFAULT_MEMORY = 1024 # MB
DEFAULT_TIMEOUT = 30  # seconds (30s)
DEFAULT_EPHEMERAL_STORAGE = 1024  # MB (512-10240 allowed)

# Reserved environment variable prefixes (cannot be set by users)
RESERVED_ENV_PREFIXES = (
    "AWS_",           # AWS credentials and config
    "LAMBDA_",        # Lambda runtime vars
    "CODEBUILD_",     # CodeBuild reserved vars
    "_X_AMZN_",       # X-Ray tracing
    "_AWS_XRAY_",     # X-Ray
    "_HANDLER",       # Handler
    "_RUNTIME_",      # Runtime
)

RESERVED_ENV_VARS = ("_HANDLER", "TZ")

# Aurora Serverless v2 Configuration
AURORA_CLUSTER_PREFIX = "shorlabs"
DB_SECURITY_GROUP_NAME = "shorlabs-db-sg"
DEFAULT_DB_NAME = "shorlabs"
DEFAULT_DB_PORT = 5432
DEFAULT_MIN_ACU = 0       # Scale to zero
DEFAULT_MAX_ACU = 2       # Default max capacity
AURORA_ENGINE_VERSION = "16.1"  # PostgreSQL 16.1 (Aurora Serverless v2, supports scale-to-zero)

# ECS EC2 Configuration
ECS_CLUSTER_PREFIX = "shorlabs"
ECS_SERVICE_PREFIX = "shorlabs"
ECS_TASK_EXECUTION_ROLE_NAME = "shorlabs-ecs-task-execution-role"
ECS_INSTANCE_ROLE_NAME = "shorlabs-ecs-instance-role"
ECS_INSTANCE_PROFILE_NAME = "shorlabs-ecs-instance-profile"
ALB_NAME = "shorlabs-alb"
ALB_SECURITY_GROUP_NAME = "shorlabs-alb-sg"
ECS_SECURITY_GROUP_NAME = "shorlabs-ecs-sg"
ECS_EC2_SECURITY_GROUP_NAME = "shorlabs-ecs-ec2-sg"
ECS_LAUNCH_TEMPLATE_PREFIX = "shorlabs-ecs-lt"
ECS_ASG_PREFIX = "shorlabs-ecs-asg"
ECS_CAPACITY_PROVIDER_PREFIX = "shorlabs-ecs-cp"
DEFAULT_INSTANCE_TYPE = "t4g.micro"
ALLOWED_INSTANCE_TYPES = ["t4g.nano", "t4g.micro", "t4g.small", "t4g.medium"]
DEFAULT_TASK_CPU = 256         # 0.25 vCPU
DEFAULT_TASK_MEMORY = 512      # 512 MB
ECS_CONTAINER_PORT = 8080
