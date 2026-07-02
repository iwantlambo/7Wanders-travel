-- ═══════════════════════════════════════════════════════
-- WANDR DATABASE SCHEMA
-- Run this in Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════

-- Enable RLS
alter table auth.users enable row level security;

-- ── PROFILES ──────────────────────────────────────────
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  is_premium boolean default false,
  premium_until timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_plan text, -- 'monthly' | 'yearly'
  ai_messages_today integer default 0,
  ai_messages_reset_date date default current_date,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Service role can do anything"
  on public.profiles using (true) with check (true);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── TRIPS ─────────────────────────────────────────────
create table public.trips (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  title text not null default 'My Trip',
  city text not null default 'Lisbon',
  country text not null default 'Portugal',
  start_date date,
  end_date date,
  days jsonb not null default '[]', -- array of day arrays of stops
  is_group boolean default false,
  group_code text unique, -- 6-char code for joining
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.trips enable row level security;

create policy "Owners can do anything with their trips"
  on public.trips using (auth.uid() = owner_id);
create policy "Group members can view group trips"
  on public.trips for select using (
    is_group = true and exists (
      select 1 from public.group_members
      where trip_id = trips.id and user_id = auth.uid()
    )
  );

-- ── GROUP MEMBERS ─────────────────────────────────────
create table public.group_members (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text default 'member', -- 'owner' | 'member'
  joined_at timestamptz default now(),
  unique(trip_id, user_id)
);

alter table public.group_members enable row level security;

create policy "Members can view group membership"
  on public.group_members for select using (
    user_id = auth.uid() or exists (
      select 1 from public.trips where id = trip_id and owner_id = auth.uid()
    )
  );

-- ── PERSONAL STOPS (group trip additions) ─────────────
-- These are per-user additions on top of a group trip
-- They don't affect the group's shared route
create table public.personal_stops (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  day_index integer not null,
  stop jsonb not null, -- stop data: {name, lat, lng, time, desc, ...}
  created_at timestamptz default now()
);

alter table public.personal_stops enable row level security;

create policy "Users can manage own personal stops"
  on public.personal_stops using (auth.uid() = user_id);

-- ── HIDDEN GEMS ───────────────────────────────────────
create table public.hidden_gems (
  id uuid default gen_random_uuid() primary key,
  submitted_by uuid references public.profiles(id),
  name text not null,
  city text not null,
  country text not null,
  description text,
  photo_url text,
  tags text[] default '{}',
  lat numeric,
  lng numeric,
  is_indoor boolean default false,
  status text default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz default now()
);

alter table public.hidden_gems enable row level security;

create policy "Anyone can view approved gems"
  on public.hidden_gems for select using (status = 'approved');
create policy "Users can submit gems"
  on public.hidden_gems for insert with check (auth.uid() = submitted_by);

-- ── GEM UNLOCKS ───────────────────────────────────────
create table public.gem_unlocks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  gem_id uuid references public.hidden_gems(id) on delete cascade,
  unlocked_at timestamptz default now(),
  unique(user_id, gem_id)
);

alter table public.gem_unlocks enable row level security;

create policy "Users can view and create own unlocks"
  on public.gem_unlocks using (auth.uid() = user_id);

-- ── WEATHER CACHE ─────────────────────────────────────
create table public.weather_cache (
  id uuid default gen_random_uuid() primary key,
  city text not null,
  date date not null,
  data jsonb not null,
  fetched_at timestamptz default now(),
  unique(city, date)
);

-- ── STRIPE EVENTS (for webhook idempotency) ───────────
create table public.stripe_events (
  id text primary key, -- Stripe event ID
  processed_at timestamptz default now()
);
