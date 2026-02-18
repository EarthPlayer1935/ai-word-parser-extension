from fastapi import APIRouter, Depends, HTTPException, Body
from database import get_supabase
from deps import get_current_user
from supabase import Client
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter(prefix="/wordbook", tags=["wordbook"])

class WordItem(BaseModel):
    word: str
    context_sentence: Optional[str] = None
    parsed_data: Optional[dict] = None

@router.get("/")
async def get_wordbook(current_user = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    user_id = current_user.id
    res = supabase.table("wordbook").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return {"data": res.data}

@router.post("/")
async def add_word(item: WordItem, current_user = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    user_id = current_user.id
    
    # Check if exists
    existing = supabase.table("wordbook").select("id").eq("user_id", user_id).eq("word", item.word).execute()
    if existing.data:
        return {"success": False, "message": "Word already in wordbook"}
        
    payload = {
        "user_id": user_id,
        "word": item.word,
        "context_sentence": item.context_sentence,
        "parsed_data": item.parsed_data
    }
    
    res = supabase.table("wordbook").insert(payload).execute()
    return {"success": True, "data": res.data}

@router.delete("/{word_id}")
async def delete_word(word_id: str, current_user = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    user_id = current_user.id
    res = supabase.table("wordbook").delete().eq("id", word_id).eq("user_id", user_id).execute()
    return {"success": True}
