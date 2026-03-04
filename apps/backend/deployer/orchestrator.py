"""
Deployment Orchestrator

Main deployment logic that coordinates all the deployment steps.
"""

from typing import Optional

from .utils import extract_project_name  # From utils.py file
from .utils import detect_runtime_from_github  # From utils/ module
from .aws import (
    create_ecr_repository,
    get_or_create_codebuild_role,
    create_or_update_codebuild_project,
    start_build,
    wait_for_build,
    get_or_create_lambda_role,
    create_or_update_lambda,
    delete_lambda,
    delete_ecr_repository,
    delete_lambda_logs,
)
from .aws.ecr import get_ecr_repo_name




def deploy_project(
    github_url: str,
    github_token: Optional[str] = None,
    root_directory: str = "./",
    start_command: str = "uvicorn main:app --host 0.0.0.0 --port 8080",
    env_vars: Optional[dict] = None,
    memory: Optional[int] = None,
    timeout: Optional[int] = None,
    ephemeral_storage: Optional[int] = None,
    on_build_start: Optional[callable] = None,
    project_id: Optional[str] = None,
    codebuild_compute_type: Optional[str] = None,
) -> str:
    """
    Deploy a project from GitHub to AWS Lambda using Lambda Web Adapter.

    This is the main entry point for deployments.

    Args:
        github_url: GitHub repository URL
        github_token: OAuth token for private repos
        root_directory: Root directory for monorepos
        start_command: Command to start the application
        env_vars: Environment variables for the build and Lambda function
        memory: Memory in MB (optional, uses default)
        timeout: Timeout in seconds (optional, uses default)
        ephemeral_storage: Ephemeral storage in MB (optional, uses default)
        on_build_start: Optional callback(build_id) called immediately when build starts
        project_id: Unique project identifier for Lambda naming (ensures unique per deployment)
        codebuild_compute_type: CodeBuild compute type override (e.g. BUILD_GENERAL1_SMALL for hobby)
        
    Returns:
        Dict with 'function_url', 'build_id', and 'function_name'
        
    Raises:
        Exception: If deployment fails
    """
    if not github_token:
        raise ValueError("github_token is required for authentication")
    
    # Use project_id for unique naming if provided, otherwise fall back to repo name
    repo_name = extract_project_name(github_url)
    if project_id:
        # Use project_id to ensure unique Lambda per deployment
        project_name = f"{repo_name}-{project_id[:8]}"  # e.g., "fast-api-dockerfile-efe76c65"
    else:
        project_name = repo_name
    
    print(f"\n🔧 Shorlabs Deployer (Lambda Web Adapter)")
    print(f"   Repository: {github_url}")
    print(f"   Project Name: {project_name}")
    print(f"   Start Command: {start_command}\n")
    
    # Step 1: Detect runtime via GitHub API
    print("🔍 Detecting runtime...")
    runtime = detect_runtime_from_github(github_url, github_token, root_directory)
    print(f"✅ Detected runtime: {runtime}")
    
    # Step 2: Create ECR repository
    ecr_repo_name = get_ecr_repo_name(project_name)
    ecr_repo_uri = create_ecr_repository(ecr_repo_name)
    print(f"✅ ECR repository ready: {ecr_repo_name}")
    
    # Step 3: Setup CodeBuild
    print("🏗️ Setting up build environment...")
    codebuild_role = get_or_create_codebuild_role()
    create_or_update_codebuild_project(codebuild_role)
    
    # Step 4: Start build directly from GitHub with detected runtime
    print("🚀 Starting build from GitHub...")
    build_id = start_build(
        github_url=github_url,
        github_token=github_token,
        ecr_repo_uri=ecr_repo_uri,
        project_name=project_name,
        start_command=start_command,
        runtime=runtime,
        root_directory=root_directory,
        env_vars=env_vars,
        compute_type_override=codebuild_compute_type,
    )
    print(f"🔨 Build started: {build_id}")
    
    # Call the callback immediately so deployment record can be created
    if on_build_start:
        on_build_start(build_id)
    
    # Step 5: Wait for build
    if not wait_for_build(build_id):
        raise Exception("Build failed")
    print("✅ Build completed")
    
    # Step 6: Deploy to Lambda
    print("🚀 Deploying to Lambda...")
    lambda_role = get_or_create_lambda_role()
    image_uri = f"{ecr_repo_uri}:latest"
    
    function_url = create_or_update_lambda(
        function_name=project_name,
        image_uri=image_uri,
        role_arn=lambda_role,
        env_vars=env_vars,
        memory=memory,
        timeout=timeout,
        ephemeral_storage=ephemeral_storage,
    )
    
    print(f"\n✅ Deployment successful!")
    print(f"🌐 Your API is live at: {function_url}")
    
    return {
        "function_url": function_url,
        "build_id": build_id,
        "function_name": project_name,  # Return function name for storage
    }


def delete_project_resources(github_url: str, function_name: Optional[str] = None) -> dict:
    """
    Delete all AWS resources for a project.

    Args:
        github_url: GitHub repository URL
        function_name: The stored Lambda function name (for new projects with unique naming)

    Returns:
        Dict with deletion status
    """
    # Use stored function_name if provided, otherwise derive from github_url (backwards compat)
    if function_name:
        project_name = function_name
        print(f"🗑️ Deleting project resources using stored function_name: {project_name}")
    else:
        project_name = extract_project_name(github_url)
        print(f"🗑️ Deleting project resources using derived name from URL: {project_name}")

    print(f"🗑️ Deleting Lambda function...")
    lambda_deleted = delete_lambda(project_name)

    print(f"🗑️ Deleting ECR repository...")
    ecr_deleted = delete_ecr_repository(get_ecr_repo_name(project_name))

    print(f"🗑️ Deleting CloudWatch log group for project_name='{project_name}'...")
    print(f"🗑️ Expected log group: /aws/lambda/shorlabs-{project_name}")
    logs_deleted = delete_lambda_logs(project_name)

    print(f"🗑️ Deletion complete - Lambda: {lambda_deleted}, ECR: {ecr_deleted}, Logs: {logs_deleted}")

    return {
        "lambda_deleted": lambda_deleted,
        "ecr_deleted": ecr_deleted,
        "logs_deleted": logs_deleted,
    }


# Keep main() for CLI usage
def main():
    """CLI entry point for deployer."""
    import sys
    
    if len(sys.argv) < 3:
        print("Usage: python -m deployer <github_url> <start_command>")
        print("Example: python -m deployer https://github.com/user/fastapi-app 'uvicorn main:app --host 0.0.0.0 --port 8080'")
        sys.exit(1)
    
    github_url = sys.argv[1]
    start_command = sys.argv[2]
    
    try:
        result = deploy_project(github_url, start_command=start_command)
        print(f"\n🌐 Your API is live at: {result['function_url']}")
    except Exception as e:
        print(f"\n❌ Deployment failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
