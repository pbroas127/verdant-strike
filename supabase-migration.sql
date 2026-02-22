-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hozpsvcceeyszunafqsr/sql/new

-- ── Profiles table ──────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  created_at  timestamptz default now()
);

-- Enforce username constraints
alter table public.profiles
  add constraint username_length check (char_length(username) between 3 and 20),
  add constraint username_chars  check (username ~ '^[a-zA-Z0-9_]+$');

-- Row-level security
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- ── Match stats table ────────────────────────────────────────────────────────
create table if not exists public.match_stats (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kills        int not null default 0,
  damage_dealt int not null default 0,
  damage_taken int not null default 0,
  shots_fired  int not null default 0,
  shots_hit    int not null default 0,
  placement    int not null default 0,
  played_at    timestamptz default now()
);

alter table public.match_stats enable row level security;

create policy "Users can insert their own stats"
  on public.match_stats for insert with check (auth.uid() = user_id);

create policy "Users can view their own stats"
  on public.match_stats for select using (auth.uid() = user_id);
