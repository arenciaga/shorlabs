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
