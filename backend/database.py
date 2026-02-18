import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    # Fail gracefully if env vars are missing during import time, 
    # but actual calls will fail.
    print("Warning: SUPABASE_URL or SUPABASE_KEY not found in environment.")
    supabase = None
else:
    supabase: Client = create_client(url, key)

def get_supabase() -> Client:
    if not supabase:
        raise Exception("Supabase client not initialized. Check environment variables.")
    return supabase
