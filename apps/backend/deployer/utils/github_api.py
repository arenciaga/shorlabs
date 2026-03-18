"""
GitHub API Client

Utilities for interacting with GitHub API to detect project runtime.
"""

import requests
from typing import Optional


def detect_runtime_from_github(github_url: str, github_token: str, root_directory: str = "./") -> str:
    """
    Detect runtime by checking GitHub repo files via API.
    
    Args:
        github_url: GitHub repository URL
        github_token: GitHub OAuth token
        root_directory: Root directory for monorepos
        
    Returns:
        "python" or "nodejs"
    """
    # Parse owner and repo from URL
    # Examples: 
    # - https://github.com/owner/repo
    # - https://github.com/owner/repo.git
    parts = github_url.rstrip('/').rstrip('.git').split('/')
    owner = parts[-2]
    repo = parts[-1]
    
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    # Normalize root_directory path for API
    path_prefix = root_directory.strip('./').strip('/')
    if path_prefix:
        path_prefix = f"{path_prefix}/"
    
    # Check for Go indicators
    if _file_exists(owner, repo, f"{path_prefix}go.mod", headers):
        return "go"

    # Check for Node.js indicators
    if _file_exists(owner, repo, f"{path_prefix}package.json", headers):
        return "nodejs"

    # Check for Python indicators
    python_files = [
        f"{path_prefix}requirements.txt",
        f"{path_prefix}pyproject.toml",
        f"{path_prefix}setup.py",
        f"{path_prefix}Pipfile"
    ]
    
    for file_path in python_files:
        if _file_exists(owner, repo, file_path, headers):
            return "python"
    
    # Default to Python if can't determine
    print("⚠️  Could not detect runtime, defaulting to Python")
    return "python"


def _file_exists(owner: str, repo: str, path: str, headers: dict) -> bool:
    """
    Check if a file exists in GitHub repo.
    
    Args:
        owner: Repository owner
        repo: Repository name
        path: File path to check
        headers: HTTP headers with auth
        
    Returns:
        True if file exists
    """
    # Remove leading slash
    path = path.lstrip('/')
    
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    
    try:
        response = requests.head(url, headers=headers, timeout=10)
        return response.status_code == 200
    except Exception as e:
        print(f"⚠️  Error checking {path}: {e}")
        return False


def get_repo_info(github_url: str) -> tuple[str, str]:
    """
    Extract owner and repo name from GitHub URL.
    
    Args:
        github_url: GitHub repository URL
        
    Returns:
        Tuple of (owner, repo)
    """
    parts = github_url.rstrip('/').rstrip('.git').split('/')
    return parts[-2], parts[-1]
