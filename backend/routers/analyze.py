from fastapi import APIRouter, Depends, HTTPException
from database import get_supabase
from deps import get_current_user
from supabase import Client
import os
import requests
import json

router = APIRouter(prefix="/analyze", tags=["analyze"])

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

@router.post("/")
def analyze_word(word: str, current_user = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    # 1. Check Usage Quota
    user_id = current_user.id
    
    # Query user profile for quota check
    res = supabase.table("profiles").select("query_usage_current_month, is_premium, premium_expiry").eq("id", user_id).single().execute()
    
    if not res.data:
        # Create profile if not exists (fallback)
        pass # Implementation TBD
        
    usage = res.data.get("query_usage_current_month", 0)
    is_premium = res.data.get("is_premium", False)
    
    MAX_FREE_USAGE = 50
    if not is_premium and usage >= MAX_FREE_USAGE:
        raise HTTPException(status_code=403, detail="Monthly free quota exceeded. Upgrade to Premium.")
        
    # 2. Call Gemini API (Logic from background.js adapted to Python)
    try:
        data = fetch_etymology(word)
        
        # 3. Update Usage
        supabase.table("profiles").update({"query_usage_current_month": usage + 1}).eq("id", user_id).execute()
        
        # 4. Optional: Log to history
        supabase.table("search_history").insert({"user_id": user_id, "word": word}).execute()
        
        return {"success": True, "data": data}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def fetch_etymology(word: str):
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not configured")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    prompt = f"""
        你是一个专业的词源学家。请分析英语单词 "{word}"。
        请务必只返回纯 JSON 格式数据，不要包含 Markdown 格式。
        JSON 结构如下：
        {{
            "root": "词根及含义 (英文)",
            "prefix": "前缀及含义 (英文)，无则填 None",
            "suffix": "后缀及含义 (英文)，无则填 None",
            "translation": "单词的简短中文释义 (10字以内)",
            "desc": "根据前缀、后缀和词根，总结一下单词的意思 (简体中文，30字以内)"
        }}
    """
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    
    headers = {'Content-Type': 'application/json'}
    
    response = requests.post(url, json=payload, headers=headers)
    
    if response.status_code != 200:
         raise Exception(f"API Error: {response.text}")
         
    result = response.json()
    
    try:
        raw_text = result['candidates'][0]['content']['parts'][0]['text']
        clean_text = raw_text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_text)
    except (KeyError, json.JSONDecodeError) as e:
        raise Exception(f"Failed to parse AI response: {e}")
