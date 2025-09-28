-- Create profiles table expected by the app's auth callback
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  provider text,
  provider_id text,
  gmail_access_token text,
  gmail_refresh_token text,
  microsoft_access_token text,
  microsoft_refresh_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'User profiles linked to auth.users';

-- trigger to update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Enable RLS
alter table public.profiles enable row level security;

-- Policies: a user can view and modify only their own profile
drop policy if exists "Profiles select own" on public.profiles;
create policy "Profiles select own" on public.profiles
for select using ( auth.uid() = id );

drop policy if exists "Profiles insert own" on public.profiles;
create policy "Profiles insert own" on public.profiles
for insert
with check ( auth.uid() = id );

drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles update own" on public.profiles
for update
using ( auth.uid() = id );


