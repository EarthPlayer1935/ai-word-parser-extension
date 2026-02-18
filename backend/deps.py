from fastapi import Header, HTTPException, Depends
from supabase import Client
from .database import get_supabase

async def get_current_user(authorization: str = Header(None), supabase: Client = Depends(get_supabase)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization Header")
    
    token = authorization.replace("Bearer ", "")
    try:
        # Verify the token with Supabase Auth
        user = supabase.auth.get_user(token)
        if not user:
             raise HTTPException(status_code=401, detail="Invalid Token or Session Expired")
        return user.user
    except Exception as e:
        print(f"Auth Error: {e}")
        raise HTTPException(status_code=401, detail="Authentication Failed")
