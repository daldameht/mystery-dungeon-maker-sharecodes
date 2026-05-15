create extension if not exists pgcrypto;

create table if not exists public.hosted_dungeons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  goal_text text not null default '',
  floors integer not null default 1,
  difficulty text not null default 'Normal',
  share_code text not null,
  includes_custom_assets boolean not null default false,
  package_text text,
  package_file_name text,
  admin_key_hash text,
  created_at timestamptz not null default now()
);

alter table public.hosted_dungeons enable row level security;

drop policy if exists "Hosted dungeons are public readable" on public.hosted_dungeons;
create policy "Hosted dungeons are public readable"
on public.hosted_dungeons
for select
using (true);

drop policy if exists "Anyone can publish hosted dungeons" on public.hosted_dungeons;
create policy "Anyone can publish hosted dungeons"
on public.hosted_dungeons
for insert
with check (true);

drop policy if exists "Anyone can delete hosted dungeons" on public.hosted_dungeons;
create policy "Anyone can delete hosted dungeons"
on public.hosted_dungeons
for delete
using (true);
