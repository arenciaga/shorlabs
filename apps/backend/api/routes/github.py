"""
GitHub API routes - fetch user's repositories and handle OAuth.
"""
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel

from api.auth import get_current_user_id
from api.db.dynamodb import save_github_token, get_github_token

router = APIRouter(prefix="/api/github", tags=["github"])

# GitHub OAuth Configuration
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET")
# Frontend URL for callback redirect
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
# The URL the user is redirected to after GitHub auth (should match GitHub App settings)
REDIRECT_URI = f"{FRONTEND_URL}/new" 

class ConnectRequest(BaseModel):
    code: str

@router.get("/auth-url")
async def get_auth_url():
    """Get the GitHub OAuth authorization URL."""
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GITHUB_CLIENT_ID not configured")
        
    return {
        "url": f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=repo,user"
    }


@router.post("/connect")
async def connect_github(
    payload: ConnectRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Exchange OAuth code for access token and save it."""
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")

    async with httpx.AsyncClient() as client:
        # Exchange code for token
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": payload.code,
                "redirect_uri": REDIRECT_URI,
            },
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange code")
            
        data = response.json()
        if "error" in data:
            raise HTTPException(status_code=400, detail=data.get("error_description", "OAuth error"))
            
        access_token = data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="No access token received")
            
        # Verify token works and get user info
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github.v3+json",
            }
        )
        
        if user_resp.status_code != 200:
             raise HTTPException(status_code=400, detail="Invalid token received")
             
        user_data = user_resp.json()
        
        # Save token
        save_github_token(
            user_id, 
            access_token, 
            metadata={
                "username": user_data.get("login"),
                "github_id": user_data.get("id"),
                "avatar_url": user_data.get("avatar_url")
            }
        )
        
        return {"status": "connected", "username": user_data.get("login")}


@router.get("/repos")
async def list_github_repos(user_id: str = Depends(get_current_user_id)):
    """List GitHub repositories for the current user."""
    # Try getting token from DB first
    token = get_github_token(user_id)
    
    # Fallback to legacy Clerk token if not in DB (optional, but good for migration)
    if not token:
        # Import here to avoid circular dependencies if any
        from api.auth import get_github_oauth_token as get_clerk_token
        token = await get_clerk_token(user_id)
    
    if not token:
        raise HTTPException(
            status_code=400,
            detail="GitHub account not connected. Please connect GitHub first.",
        )
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/user/repos",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.v3+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            params={
                "sort": "updated",
                "per_page": 100,
                "visibility": "all",
                "affiliation": "owner,collaborator", # Fetch repos user owns or collaborates on
            },
        )
    
    if response.status_code != 200:
        # If 401, maybe token is invalid (revoked)
        if response.status_code == 401:
             raise HTTPException(status_code=401, detail="GitHub token expired or invalid")
             
        raise HTTPException(
            status_code=response.status_code,
            detail=f"GitHub API error: {response.text}",
        )
    
    repos = response.json()
    
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
    """Check if user has connected their GitHub account."""
    token = get_github_token(user_id)
    if token:
         return {"connected": True}
         
    # Check Clerk fallback
    from api.auth import get_github_oauth_token as get_clerk_token
    clerk_token = await get_clerk_token(user_id)
    
    return {"connected": clerk_token is not None}


@router.get("/repos/{repo:path}/contents")
async def get_repo_contents(
    repo: str,
    path: str = "",
    user_id: str = Depends(get_current_user_id),
):
    """Get contents of a repository directory for the directory picker."""
    token = get_github_token(user_id)
    if not token:
        from api.auth import get_github_oauth_token as get_clerk_token
        token = await get_clerk_token(user_id)
    
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
                "Accept": "application/vnd.github.v3+json",
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
