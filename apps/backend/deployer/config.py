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
