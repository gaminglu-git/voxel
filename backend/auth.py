"""
Authentication utilities for FastAPI backend.
Handles Supabase JWT token validation and user extraction.
"""
import os
from typing import Optional
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase_client import supabase
import jwt
import time

security = HTTPBearer(auto_error=False)

# Get JWT secret from environment (Supabase JWT secret)
# This should be set in .env as SUPABASE_JWT_SECRET
# You can find it in Supabase Dashboard -> Settings -> API -> JWT Secret
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> dict:
    """
    Extract and validate JWT token from Authorization header.
    Returns the user information from the token payload.
    
    Raises HTTPException if token is missing or invalid.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    
    try:
        # For Supabase JWT, we can decode without secret to get claims
        # But for production, you should verify the signature using the JWT secret
        if SUPABASE_JWT_SECRET:
            # Verify signature
            decoded = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated"
            )
        else:
            # Decode without verification (less secure, but works for development)
            # You should set SUPABASE_JWT_SECRET in production!
            decoded = jwt.decode(
                token,
                options={"verify_signature": False}
            )
        
        # Check expiration
        exp = decoded.get("exp")
        if exp and exp < time.time():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired"
            )
        
        user_id = decoded.get("sub")
        email = decoded.get("email")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user ID"
            )
        
        # Return user information
        return {
            "id": user_id,
            "email": email,
            "role": decoded.get("role", "authenticated")
        }
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication error: {str(e)}"
        )

def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Optional[dict]:
    """
    Get current user if token is provided, otherwise return None.
    Useful for endpoints that work with or without authentication.
    """
    if not credentials:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None

