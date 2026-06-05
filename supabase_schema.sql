-- Void Empires multiplayer schema
-- Run this once in Supabase SQL Editor before deploying.

create table if not exists public.games (
  id text primary key,
  state jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  status text default 'lobby' check (status in ('lobby', 'active', 'finished'))
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id text references public.games(id) on delete cascade,
  display_name text not null,
  player_number int check (player_number between 1 and 4),
  joined_at timestamptz default now(),
  is_ready boolean default false
);

alter table public.games enable row level security;
alter table public.players enable row level security;

do $$ begin
  create policy "allow all games" on public.games for all using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "allow all players" on public.players for all using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- Realtime publication. If the table was already added, ignore duplicate_object.
do $$ begin
  alter publication supabase_realtime add table public.games;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.players;
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_games_updated_at on public.games;
create trigger set_games_updated_at
before update on public.games
for each row execute function public.set_updated_at();
