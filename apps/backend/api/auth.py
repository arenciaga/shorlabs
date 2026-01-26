"""
Authentication utilities for Clerk JWT verification.
"""
import os
from typing import Optional
from functools import lru_cache

import httpx
import jwt
from jwt import PyJWKClient
from fastapi import HTTPException, Header


# Clerk configuration
CLERK_ISSUER = os.environ.get("CLERK_ISSUER", "")  # e.g., https://crisp-kite-78.clerk.accounts.dev
CLERK_SECRET_KEY = os.environ.get("CLERK_SECRET_KEY", "")


@lru_cache()
def get_jwks_client():
    """Get the JWKS client for Clerk JWT verification."""
    jwks_url = f"{CLERK_ISSUER}/.well-known/jwks.json"
    return PyJWKClient(jwks_url)


def verify_clerk_token(token: str) -> dict:
    """Verify a Clerk JWT and return the payload."""
    try:
        jwks_client = get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            options={
                "verify_aud": False,  # Clerk doesn't always set audience
            },
            leeway=60,  # Allow 60 seconds of clock skew
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.ImmatureSignatureError:
        raise HTTPException(status_code=401, detail="Token not yet valid (clock skew)")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    """FastAPI dependency to get current user ID from Clerk JWT."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    token = authorization.split(" ", 1)[1]
    payload = verify_clerk_token(token)
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")
    
    return user_id


async def get_github_oauth_token(user_id: str) -> Optional[str]:
    """
    Get GitHub OAuth token for a user.
    
    Strategy:
    1. Check local DynamoDB token storage (new flow)
    2. Fallback to Clerk Backend API (legacy flow)
    """
    # 1. Check DynamoDB (avoid circular import with inner import)
    try:
        from api.db.dynamodb import get_github_token
        db_token = get_github_token(user_id)
        if db_token:
            return db_token
    except Exception as e:
        print(f"⚠️ Error checking DynamoDB token: {e}")

    # 2. Fallback to Clerk
    if not CLERK_SECRET_KEY:
        # If we don't have Clerk key and DB failed/empty, we can't do anything
        return None
    
    url = f"https://api.clerk.com/v1/users/{user_id}/oauth_access_tokens/github"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            url,
            headers={
                "Authorization": f"Bearer {CLERK_SECRET_KEY}",
                "Content-Type": "application/json",
            },
        )
    
    if response.status_code == 404:
        return None  # User hasn't connected GitHub
    
    if response.status_code != 200:
        # Don't fail hard on Clerk errors if we are just checking
        print(f"⚠️ Clerk API error: {response.status_code} {response.text}")
        return None
    
    data = response.json()
    if data and len(data) > 0:
        return data[0].get("token")
    
    return None
