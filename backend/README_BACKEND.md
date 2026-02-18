# Backend Setup Guide

## 1. Environment Setup

The dependencies have been installed in a virtual environment (`venv`).
To activate it manually:
```bash
.\venv\Scripts\activate
```

## 2. Configuration (`.env`)

Rename `.env.example` to `.env` and fill in the following:

```ini
SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
SUPABASE_KEY=YOUR_SUPABASE_ANON_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

## 3. Database Setup

1. Go to your Supabase Project Dashboard -> SQL Editor.
2. Open `schema.sql` from this folder.
3. Run the SQL script to create the necessary tables and policies.

## 4. Running the Server

Run the following command in the `backend` directory:

```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`.
API Documentation: `http://localhost:8000/docs`.
