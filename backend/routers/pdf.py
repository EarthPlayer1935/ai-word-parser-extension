from fastapi import APIRouter, Depends, HTTPException, Body
from database import get_supabase
from deps import get_current_user
from supabase import Client
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/pdf", tags=["pdf"])

class PDFMetadata(BaseModel):
    filename: str
    storage_path: str # S3 key or URL
    last_page: int = 1
    annotations: Optional[dict] = None

class PDFUpdate(BaseModel):
    last_page: Optional[int]
    annotations: Optional[dict]

@router.get("/")
def list_pdfs(current_user = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    user_id = current_user.id
    res = supabase.table("user_pdfs").select("*").eq("user_id", user_id).order("uploaded_at", desc=True).execute()
    return {"data": res.data}

@router.post("/")
def register_pdf(pdf: PDFMetadata, current_user = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    user_id = current_user.id
    
    # Check if Premium?
    profile_res = supabase.table("profiles").select("is_premium").eq("id", user_id).single().execute()
    if not profile_res.data or not profile_res.data.get("is_premium"):
        # For now, maybe allow free users limited PDFs? Or restrict strictly.
        # User requirement said "Premium user gets PDF management".
        raise HTTPException(status_code=403, detail="PDF management is a Premium feature.")

    payload = {
        "user_id": user_id,
        "filename": pdf.filename,
        "storage_path": pdf.storage_path,
        "last_page": pdf.last_page,
        "annotations": pdf.annotations
    }
    
    res = supabase.table("user_pdfs").insert(payload).execute()
    return {"success": True, "data": res.data}

@router.patch("/{pdf_id}")
def update_pdf_progress(pdf_id: str, update: PDFUpdate, current_user = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    user_id = current_user.id
    
    payload = {}
    if update.last_page is not None:
        payload["last_page"] = update.last_page
    if update.annotations is not None:
        payload["annotations"] = update.annotations
        
    if not payload:
        return {"success": False, "message": "No data to update"}

    res = supabase.table("user_pdfs").update(payload).eq("id", pdf_id).eq("user_id", user_id).execute()
    return {"success": True}
