"""
Shorlabs Deployer Package

A modular deployment system for Python and Node.js backends to AWS Lambda.

Usage:
    from deployer import deploy_project
    
    result = deploy_project(
        github_url="https://github.com/user/my-api",
        github_token="...",
        start_command="uvicorn main:app --host 0.0.0.0 --port 8080",
        env_vars={"DATABASE_URL": "..."}
    )
"""

from .orchestrator import deploy_project, delete_project_resources
from .database_orchestrator import provision_database, delete_database_resources
from .fargate_orchestrator import deploy_fargate_project, delete_fargate_resources
from .utils import extract_project_name

__all__ = [
    "deploy_project",
    "delete_project_resources",
    "provision_database",
    "delete_database_resources",
    "deploy_fargate_project",
    "delete_fargate_resources",
    "extract_project_name",
]
