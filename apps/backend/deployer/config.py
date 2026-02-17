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
