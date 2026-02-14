"""
CodeBuild Operations

CodeBuild project and build management.
"""

import time
from typing import Optional

from ..clients import get_codebuild_client
from ..config import CODEBUILD_PROJECT_NAME
from .lambda_service import filter_env_vars


def create_or_update_codebuild_project(role_arn: str) -> None:
    """
    Create or update the CodeBuild project.

    Args:
        role_arn: CodeBuild service role ARN
    """
    codebuild_client = get_codebuild_client()

    desired_environment = {
        "type": "LINUX_CONTAINER",
        "image": "aws/codebuild/standard:7.0",
        "computeType": "BUILD_GENERAL1_LARGE",
        "privilegedMode": True,  # Required for Docker builds
    }

    try:
        projects = codebuild_client.batch_get_projects(names=[CODEBUILD_PROJECT_NAME])
        if projects["projects"]:
            existing = projects["projects"][0]
            current_compute = existing["environment"].get("computeType")
            if current_compute != desired_environment["computeType"]:
                print(f"🔄 Updating CodeBuild project compute: {current_compute} → {desired_environment['computeType']}")
                codebuild_client.update_project(
                    name=CODEBUILD_PROJECT_NAME,
                    environment=desired_environment,
                    serviceRole=role_arn,
                )
                print(f"✅ Updated CodeBuild project")
            else:
                print(f"✅ CodeBuild project exists: {CODEBUILD_PROJECT_NAME}")
            return
    except Exception:
        pass

    print(f"🔨 Creating CodeBuild project: {CODEBUILD_PROJECT_NAME}")

    codebuild_client.create_project(
        name=CODEBUILD_PROJECT_NAME,
        source={
            "type": "NO_SOURCE",
            "buildspec": "version: 0.2\nphases:\n  build:\n    commands:\n      - echo 'Buildspec will be provided inline'"
        },
        artifacts={"type": "NO_ARTIFACTS"},
        environment=desired_environment,
        serviceRole=role_arn,
    )

    print(f"✅ Created CodeBuild project")


def start_build(
    github_url: str,
    github_token: str,
    ecr_repo_uri: str,
    project_name: str,
    start_command: str,
    runtime: str = "python",
    root_directory: str = "./",
    env_vars: Optional[dict] = None,
) -> str:
    """
    Start a CodeBuild build and return the build ID.

    Args:
        github_url: GitHub repository URL
        github_token: GitHub OAuth token
        ecr_repo_uri: ECR repository URI for Docker image
        project_name: Name of the project (for logging)
        start_command: Command to start the application
        runtime: Runtime type ("python" or "nodejs")
        root_directory: Root directory for monorepos
        env_vars: Optional user environment variables for the build

    Returns:
        The build ID
    """
    print(f"🚀 Starting CodeBuild build from GitHub ({runtime})...")

    codebuild_client = get_codebuild_client()

    # Get AWS credentials for ECR login
    from ..clients import get_aws_account_id, get_aws_region
    account_id = get_aws_account_id()
    region = get_aws_region()

    # Normalize root_directory: "./", "", "." → ".", "apps/frontend/" → "apps/frontend"
    root_directory = root_directory.strip("/").strip("./").strip("/") or "."

    # Extract owner/repo from GitHub URL
    # https://github.com/owner/repo -> owner/repo
    repo_path = github_url.replace("https://github.com/", "").replace(".git", "")
    
    # Read Dockerfile template
    from pathlib import Path
    templates_dir = Path(__file__).parent.parent.parent / "templates"
    
    if runtime == "nodejs":
        template_path = templates_dir / "Dockerfile.node"
    else:  # python
        template_path = templates_dir / "Dockerfile"
    
    #Read template content
    dockerfile_template = template_path.read_text()

    # Replace CMD with appropriate start command
    if runtime == "nodejs":
        # Node.js: always use /start.sh which handles monorepos,
        # package manager detection, and workspace start scripts
        cmd_json = '["/start.sh"]'
    else:
        # Python: use the user's start command
        cmd_parts = start_command.split()
        cmd_json = str(cmd_parts).replace("'", '"')

    # Replace the CMD line in the template
    lines = dockerfile_template.split('\n')
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip().startswith('CMD '):
            lines[i] = f'CMD {cmd_json}'
            break

    dockerfile = '\n'.join(lines)

    # Filter and prepare user environment variables
    filtered_vars = {}
    if env_vars:
        filtered_vars, skipped_vars = filter_env_vars(env_vars)
        if skipped_vars:
            print(f"⚠️ Skipping reserved env vars for build: {', '.join(skipped_vars)}")

    # Generate ARG/ENV declarations for Dockerfile and replace before indenting
    user_args = "\n".join(f"ARG {key}\nENV {key}=${{{key}:-}}" for key in filtered_vars)
    dockerfile = dockerfile.replace('{{USER_ARGS}}', user_args)

    # Read buildspec template
    if runtime == "nodejs":
        buildspec_template_path = templates_dir / "buildspec.node.yml"
    else:  # python
        buildspec_template_path = templates_dir / "buildspec.yml"

    buildspec_template = buildspec_template_path.read_text()

    # Replace placeholders in buildspec
    # The Dockerfile content needs to be indented to match the YAML block scalar
    # Each line needs 8 spaces (2 levels of indentation) to align with the heredoc
    indented_dockerfile = '\n'.join('        ' + line if line.strip() else line for line in dockerfile.split('\n'))
    buildspec = buildspec_template.replace('{{DOCKERFILE_CONTENT}}', indented_dockerfile)
    buildspec = buildspec.replace('{{AWS_REGION}}', region)
    buildspec = buildspec.replace('{{AWS_ACCOUNT_ID}}', account_id)
    buildspec = buildspec.replace('{{ECR_REPO_URI}}', ecr_repo_uri)
    buildspec = buildspec.replace('{{ROOT_DIRECTORY}}', root_directory)
    buildspec = buildspec.replace('{{REPO_PATH}}', repo_path)
    # Note: GITHUB_TOKEN is passed as env var, not embedded in buildspec

    # Generate --build-arg flags for docker build command
    build_args = " ".join(f"--build-arg {key}=${key}" for key in filtered_vars)
    buildspec = buildspec.replace('{{BUILD_ARGS}}', build_args)

    # Build CodeBuild environment variables override list
    env_overrides = [
        {
            "name": "GITHUB_TOKEN",
            "value": github_token or "",
            "type": "PLAINTEXT"  # Use SECRETS_MANAGER for production
        }
    ]
    for key, value in filtered_vars.items():
        env_overrides.append({
            "name": key,
            "value": str(value),
            "type": "PLAINTEXT"
        })

    response = codebuild_client.start_build(
        projectName=CODEBUILD_PROJECT_NAME,
        buildspecOverride=buildspec,
        environmentVariablesOverride=env_overrides,
    )
    
    build_id = response["build"]["id"]
    print(f"✅ Build started: {build_id}")
    return build_id


def wait_for_build(build_id: str) -> bool:
    """
    Wait for the build to complete.
    
    Args:
        build_id: The build ID to wait for
        
    Returns:
        True if successful, False otherwise
    """
    print("⏳ Waiting for build to complete...")
    
    codebuild_client = get_codebuild_client()
    
    while True:
        response = codebuild_client.batch_get_builds(ids=[build_id])
        build = response["builds"][0]
        status = build["buildStatus"]
        
        if status == "IN_PROGRESS":
            phase = build.get("currentPhase", "UNKNOWN")
            print(f"\r   Phase: {phase}...", end="", flush=True)
            time.sleep(5)
        elif status == "SUCCEEDED":
            print(f"\n✅ Build succeeded!")
            return True
        else:
            print(f"\n❌ Build failed with status: {status}")
            # Print build logs location
            if "logs" in build:
                logs = build["logs"]
                print(f"   Logs: {logs.get('deepLink', 'N/A')}")
            return False


def get_build_status(build_id: str) -> dict:
    """
    Get the current status of a build.
    
    Args:
        build_id: The build ID
        
    Returns:
        Build status dict with status, phase, and logs_url
    """
    codebuild_client = get_codebuild_client()
    
    response = codebuild_client.batch_get_builds(ids=[build_id])
    build = response["builds"][0]
    
    return {
        "status": build["buildStatus"],
        "phase": build.get("currentPhase", "UNKNOWN"),
        "logs_url": build.get("logs", {}).get("deepLink"),
    }
