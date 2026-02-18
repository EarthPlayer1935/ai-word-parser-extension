-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table (extends Supabase auth.users or standalone)
-- Note: If using Supabase Auth, you might want to link to auth.users
-- But for simplicity here, we'll create a standalone users table or assume manual management for now.
-- In a real Supabase app, you'd trigger on auth.users equivalent.
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  is_premium boolean default false,
  premium_expiry timestamp with time zone,
  query_usage_current_month int default 0,
  created_at timestamp with time zone default now()
);

-- Wordbook table
create table if not exists public.wordbook (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  word text not null,
  parsed_data jsonb,
  context_sentence text,
  created_at timestamp with time zone default now()
);

-- Search History table
create table if not exists public.search_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  word text not null,
  created_at timestamp with time zone default now()
);

-- User PDFs table
create table if not exists public.user_pdfs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  filename text not null,
  storage_path text not null,
  last_page int default 1,
  annotations jsonb,
  uploaded_at timestamp with time zone default now()
);

-- RLS Policies (Row Level Security) - Basic Setup to ensure users only see their own data
alter table public.profiles enable row level security;
alter table public.wordbook enable row level security;
alter table public.search_history enable row level security;
alter table public.user_pdfs enable row level security;

create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

create policy "Users can view own wordbook" on public.wordbook for select using (auth.uid() = user_id);
create policy "Users can insert own wordbook" on public.wordbook for insert with check (auth.uid() = user_id);
create policy "Users can delete own wordbook" on public.wordbook for delete using (auth.uid() = user_id);

create policy "Users can view own history" on public.search_history for select using (auth.uid() = user_id);
create policy "Users can insert own history" on public.search_history for insert with check (auth.uid() = user_id);

create policy "Users can view own pdfs" on public.user_pdfs for select using (auth.uid() = user_id);
create policy "Users can insert own pdfs" on public.user_pdfs for insert with check (auth.uid() = user_id);
create policy "Users can update own pdfs" on public.user_pdfs for update using (auth.uid() = user_id);
create policy "Users can delete own pdfs" on public.user_pdfs for delete using (auth.uid() = user_id);
