from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import msal

from app.core.database import get_db
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])


def get_msal_app():
    return msal.ConfidentialClientApplication(
        client_id=settings.AZURE_AD_CLIENT_ID,
        client_credential=settings.AZURE_AD_CLIENT_SECRET,
        authority=settings.azure_ad_authority,
    )


@router.get("/login")
async def login():
    """Redirect to Azure AD login page."""
    msal_app = get_msal_app()
    auth_url = msal_app.get_authorization_request_url(
        scopes=["User.Read"],
        redirect_uri=settings.AZURE_AD_REDIRECT_URI,
    )
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def auth_callback(
    code: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Handle Azure AD callback after login."""
    if error:
        raise HTTPException(status_code=400, detail=f"{error}: {error_description}")
    
    if not code:
        raise HTTPException(status_code=400, detail="No authorization code received")
    
    msal_app = get_msal_app()
    result = msal_app.acquire_token_by_authorization_code(
        code=code,
        scopes=["User.Read"],
        redirect_uri=settings.AZURE_AD_REDIRECT_URI,
    )
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result.get("error_description", "Authentication failed"))
    
    id_token_claims = result.get("id_token_claims", {})
    azure_id = id_token_claims.get("oid")
    email = id_token_claims.get("preferred_username") or id_token_claims.get("email")
    display_name = id_token_claims.get("name")
    first_name = id_token_claims.get("given_name")
    last_name = id_token_claims.get("family_name")
    
    if not email:
        raise HTTPException(status_code=400, detail="Could not get email from Azure AD")
    
    query = select(User).where(User.email == email)
    result_db = await db.execute(query)
    user = result_db.scalar_one_or_none()
    
    if not user:
        user = User(
            azure_id=azure_id,
            email=email,
            display_name=display_name,
            first_name=first_name,
            last_name=last_name,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
    else:
        if not user.azure_id:
            user.azure_id = azure_id
        user.display_name = display_name or user.display_name
        user.first_name = first_name or user.first_name
        user.last_name = last_name or user.last_name
        await db.flush()
    
    # role is now a string, not an enum
    user_role = user.role if user.role else "user"
    
    access_token = create_access_token(
        subject=str(user.id),
        additional_claims={"email": user.email, "role": user_role}
    )
    refresh_token = create_refresh_token(subject=str(user.id))
    
    frontend_url = settings.cors_origins_list[0] if settings.cors_origins_list else "https://crm.noscite.it"
    return RedirectResponse(url=f"{frontend_url}/auth/callback?access_token={access_token}&refresh_token={refresh_token}")


@router.get("/me")
async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    """Get current authenticated user."""
    from app.core.security import decode_token
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = auth_header.split(" ")[1]
    payload = decode_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    query = select(User).where(User.id == user_id)
    result = await db.execute(query)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
    
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role if user.role else "user",
        "is_active": user.is_active,
    }


@router.post("/refresh")
async def refresh_token(request: Request, db: AsyncSession = Depends(get_db)):
    """Refresh access token using refresh token."""
    from app.core.security import verify_token
    
    body = await request.json()
    refresh_tok = body.get("refresh_token")
    
    if not refresh_tok:
        raise HTTPException(status_code=400, detail="Refresh token required")
    
    user_id = verify_token(refresh_tok, token_type="refresh")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    query = select(User).where(User.id == user_id)
    result = await db.execute(query)
    user = result.scalar_one_or_none()
    
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    
    new_access_token = create_access_token(
        subject=str(user.id),
        additional_claims={"email": user.email, "role": user.role if user.role else "user"}
    )
    
    return {"access_token": new_access_token, "token_type": "bearer"}


@router.post("/logout")
async def logout():
    """Logout user (client should discard tokens)."""
    return {"message": "Logged out successfully"}
