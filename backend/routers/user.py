from fastapi import APIRouter, Depends, HTTPException
from database import get_supabase
from deps import get_current_user
from supabase import Client

router = APIRouter(prefix="/user", tags=["user"])

@router.get("/me")
def get_my_profile(current_user = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    user_id = current_user.id
    
    # 1. Get Profile from Supabase
    res = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    
    if not res.data:
        # Create default profile if missing
        new_profile = {
            "id": user_id,
            "email": current_user.email,
            "is_premium": False,
            "query_usage_current_month": 0
        }
        create_res = supabase.table("profiles").insert(new_profile).execute()
        return {"data": create_res.data[0]}
        
    return {"data": res.data}
