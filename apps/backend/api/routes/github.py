"""
GitHub API routes - fetch user's repositories and handle GitHub App installation.
"""
import os
import time
import httpx
import jwt
from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel

from api.auth import get_current_user_id
from api.db.dynamodb import save_github_token, get_github_token, get_github_installation

router = APIRouter(prefix="/api/github", tags=["github"])

# GitHub App Configuration
GITHUB_APP_SLUG = os.environ.get("GITHUB_APP_SLUG")
GITHUB_APP_ID = os.environ.get("GITHUB_APP_ID")
GITHUB_PRIVATE_KEY = os.environ.get("GITHUB_PRIVATE_KEY", "").replace("\\n", "\n")
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID")

# Frontend URL for callback redirect
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

class ConnectRequest(BaseModel):
    installation_id: Optional[str] = None
    setup_action: Optional[str] = None


def generate_github_app_jwt() -> str:
    """
    Generate JWT for GitHub App authentication.
    This JWT is used to authenticate as the GitHub App itself.
    """
    if not GITHUB_APP_ID or not GITHUB_PRIVATE_KEY:
        raise ValueError("GITHUB_APP_ID and GITHUB_PRIVATE_KEY must be set")

    # JWT expires after 10 minutes (GitHub maximum)
    now = int(time.time())
    payload = {
        "iat": now - 60,  # Issued 60 seconds in the past to account for clock drift
        "exp": now + (10 * 60),  # Expires in 10 minutes
        "iss": GITHUB_APP_ID,  # GitHub App ID
    }

    # Sign JWT with RS256 using the private key
    token = jwt.encode(payload, GITHUB_PRIVATE_KEY, algorithm="RS256")
    return token


async def generate_installation_token(installation_id: str) -> dict:
    """
    Generate an installation access token for a GitHub App installation.

    Args:
        installation_id: The GitHub App installation ID

    Returns:
        dict with keys: token, expires_at
    """
    app_jwt = generate_github_app_jwt()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.github.com/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

        if response.status_code != 201:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to generate installation token: {response.text}"
            )

        data = response.json()
        return {
            "token": data["token"],
            "expires_at": data["expires_at"],  # ISO 8601 format
        }


async def get_or_refresh_token(user_id: str) -> Optional[str]:
    """
    Get GitHub token for user, refreshing if expired.

    Args:
        user_id: Clerk user ID

    Returns:
        Valid GitHub installation token, or None if not connected

    Raises:
        HTTPException: If token refresh fails due to installation removal
    """
    installation = get_github_installation(user_id)
    if not installation:
        print(f"[GitHub] No installation found for user {user_id}")
        return None

    # Check if token is expired
    if installation.get("expires_at"):
        try:
            expires_at = datetime.fromisoformat(installation["expires_at"].replace("Z", "+00:00"))
            # Refresh if expired or expiring in next 5 minutes
            if datetime.now(expires_at.tzinfo) >= expires_at - timedelta(minutes=5):
                installation_id = installation.get("installation_id")
                if installation_id:
                    print(f"[GitHub] Token expired/expiring, refreshing for installation {installation_id}")
                    try:
                        # Refresh token
                        token_data = await generate_installation_token(installation_id)
                        save_github_token(
                            user_id,
                            token_data["token"],
                            metadata=installation.get("metadata"),
                            installation_id=installation_id,
                            expires_at=token_data["expires_at"]
                        )
                        print(f"[GitHub] Token refreshed successfully, expires at {token_data['expires_at']}")
                        return token_data["token"]
                    except HTTPException as e:
                        # Installation may have been removed
                        print(f"[GitHub] Token refresh failed (installation may be removed): {e.detail}")
                        raise HTTPException(
                            status_code=401,
                            detail="GitHub installation removed or permissions revoked. Please reconnect."
                        )
                    except Exception as e:
                        print(f"[GitHub] Unexpected error refreshing token: {type(e).__name__}: {e}")
                        raise HTTPException(
                            status_code=401,
                            detail="Failed to refresh GitHub token. Please reconnect."
                        )
                else:
                    print(f"[GitHub] Token expired but no installation_id stored")
                    return None
        except ValueError as e:
            print(f"[GitHub] Error parsing expires_at timestamp: {e}")

    return installation.get("token")

@router.get("/auth-url")
async def get_auth_url():
    """Get the GitHub OAuth authorization URL."""
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GITHUB_CLIENT_ID not configured")

    # If using GitHub App with a known slug, use the installation flow
    # This enables the "Only select repositories" UI
    if GITHUB_APP_SLUG:
        # Note: The GitHub App must have its "Setup URL" configured to FRONTEND_URL/new
        # in the GitHub App settings for the redirect to work after installation
        return {
            "url": f"https://github.com/apps/{GITHUB_APP_SLUG}/installations/new"
        }

    return {
        "url": f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=repo,user"
    }


@router.post("/connect")
async def connect_github(
    payload: ConnectRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Handle GitHub App installation callback and generate access token."""
    if not GITHUB_APP_ID or not GITHUB_PRIVATE_KEY:
        raise HTTPException(status_code=500, detail="GitHub App not configured")

    if not payload.installation_id:
        raise HTTPException(status_code=400, detail="installation_id required")

    try:
        # Step 1: Get installation info using App JWT (NOT installation token)
        # This gives us the account info (username, avatar, etc.)
        app_jwt = generate_github_app_jwt()

        async with httpx.AsyncClient() as client:
            install_resp = await client.get(
                f"https://api.github.com/app/installations/{payload.installation_id}",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )

            if install_resp.status_code != 200:
                print(f"[GitHub] Failed to get installation info: {install_resp.status_code} - {install_resp.text}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to get installation info: {install_resp.text}"
                )

            install_data = install_resp.json()
            account = install_data.get("account", {})
            print(f"[GitHub] Installation found for account: {account.get('login')}")

        # Step 2: Generate installation access token
        token_data = await generate_installation_token(payload.installation_id)

        # Step 3: Validate that we can actually access repositories
        async with httpx.AsyncClient() as client:
            repos_resp = await client.get(
                "https://api.github.com/installation/repositories",
                headers={
                    "Authorization": f"Bearer {token_data['token']}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                params={"per_page": 1},  # Just check access, don't fetch all
            )

            if repos_resp.status_code != 200:
                print(f"[GitHub] Token cannot access repos: {repos_resp.status_code} - {repos_resp.text}")
                raise HTTPException(
                    status_code=400,
                    detail="Installation token cannot access repositories. Please check app permissions."
                )

            repos_data = repos_resp.json()
            total_count = repos_data.get("total_count", 0)
            print(f"[GitHub] Successfully validated access to {total_count} repositories")

        # Step 4: Save installation data to DynamoDB with correct account info
        save_github_token(
            user_id,
            token_data["token"],
            metadata={
                "username": account.get("login"),
                "github_id": account.get("id"),
                "avatar_url": account.get("avatar_url"),
                "account_type": account.get("type"),  # "User" or "Organization"
            },
            installation_id=payload.installation_id,
            expires_at=token_data["expires_at"]
        )

        return {
            "status": "connected",
            "username": account.get("login"),
            "installation_id": payload.installation_id,
            "repository_count": total_count,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[GitHub] Error connecting: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repos")
async def list_github_repos(user_id: str = Depends(get_current_user_id)):
    """List GitHub repositories accessible via GitHub App installation."""
    # Get or refresh token
    token = await get_or_refresh_token(user_id)

    if not token:
        raise HTTPException(
            status_code=400,
            detail="GitHub account not connected. Please connect GitHub first.",
        )

    async with httpx.AsyncClient() as client:
        # For GitHub App installations, use the installation/repositories endpoint
        response = await client.get(
            "https://api.github.com/installation/repositories",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            params={
                "per_page": 100,
            },
        )

    if response.status_code != 200:
        # If 401, token might be revoked or installation removed
        if response.status_code == 401:
             raise HTTPException(status_code=401, detail="GitHub token expired or invalid. Please reconnect.")

        raise HTTPException(
            status_code=response.status_code,
            detail=f"GitHub API error: {response.text}",
        )

    data = response.json()
    repos = data.get("repositories", [])

    return [
        {
            "id": repo["id"],
            "name": repo["name"],
            "full_name": repo["full_name"],
            "html_url": repo["html_url"],
            "clone_url": repo["clone_url"],
            "private": repo["private"],
            "default_branch": repo["default_branch"],
            "updated_at": repo["updated_at"],
            "language": repo.get("language"),
        }
        for repo in repos
    ]


@router.get("/status")
async def github_connection_status(user_id: str = Depends(get_current_user_id)):
    """Check if user has connected their GitHub App."""
    installation = get_github_installation(user_id)

    if not installation:
        return {"connected": False}

    return {
        "connected": True,
        "username": installation.get("metadata", {}).get("username"),
    }


@router.get("/repos/{repo:path}/contents")
async def get_repo_contents(
    repo: str,
    path: str = "",
    user_id: str = Depends(get_current_user_id),
):
    """Get contents of a repository directory for the directory picker."""
    # Get or refresh token
    token = await get_or_refresh_token(user_id)

    if not token:
        raise HTTPException(
            status_code=400,
            detail="GitHub account not connected.",
        )

    # GitHub API URL for repository contents
    url = f"https://api.github.com/repos/{repo}/contents"
    if path:
        url = f"{url}/{path}"

    async with httpx.AsyncClient() as client:
        response = await client.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

    if response.status_code == 404:
        return []

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"GitHub API error: {response.text}",
        )

    contents = response.json()

    if isinstance(contents, dict):
        return []

    return [
        {
            "name": item["name"],
            "path": item["path"],
            "type": item["type"],
        }
        for item in contents
    ]
