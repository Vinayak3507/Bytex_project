create extension if not exists pgcrypto;

create table if not exists public.question_sets (
  id uuid primary key,
  title text not null check (char_length(title) between 1 and 120),
  owner_token_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key,
  question_set_id uuid not null references public.question_sets(id) on delete cascade,
  prompt text not null,
  topic text not null,
  difficulty text not null,
  duration_ms integer not null check (duration_ms between 5000 and 120000),
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  correct_option_id uuid not null,
  position integer not null check (position >= 0),
  unique(question_set_id, position)
);

create table if not exists public.rooms (
  id uuid primary key,
  question_set_id uuid not null references public.question_sets(id),
  college_name text not null,
  season_name text not null default 'Hackathon Demo',
  join_code char(8) not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'in_progress', 'round_closed', 'completed')),
  current_question_index integer not null default -1,
  round_started_at timestamptz,
  round_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  display_name text not null,
  reconnect_token_hash text not null,
  score integer not null default 0,
  current_streak integer not null default 0,
  joined_at timestamptz not null default now(),
  unique(room_id, reconnect_token_hash)
);

create unique index if not exists room_players_unique_display_name
  on public.room_players(room_id, lower(display_name));

create table if not exists public.answers (
  id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.room_players(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  option_id uuid not null,
  received_at timestamptz not null,
  response_ms integer not null check (response_ms >= 0),
  is_correct boolean,
  points integer not null default 0,
  unique(room_id, player_id, question_id)
);

create table if not exists public.league_points (
  season_name text not null,
  college_name text not null,
  points integer not null default 0,
  rooms_played integer not null default 0,
  primary key(season_name, college_name)
);

create table if not exists public.completed_league_rooms (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  completed_at timestamptz not null default now()
);

create or replace function public.apply_room_to_league(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.rooms%rowtype;
  room_points integer;
begin
  select * into target_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if exists (select 1 from public.completed_league_rooms where room_id = p_room_id) then
    return jsonb_build_object('alreadyApplied', true);
  end if;
  select coalesce(sum(score), 0) into room_points from public.room_players where room_id = p_room_id;
  insert into public.league_points (season_name, college_name, points, rooms_played)
  values (target_room.season_name, target_room.college_name, room_points, 1)
  on conflict (season_name, college_name) do update
  set points = public.league_points.points + excluded.points,
      rooms_played = public.league_points.rooms_played + 1;
  insert into public.completed_league_rooms(room_id) values (p_room_id);
  return jsonb_build_object('alreadyApplied', false, 'points', room_points);
end;
$$;

alter table public.question_sets enable row level security;
alter table public.questions enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.answers enable row level security;
alter table public.league_points enable row level security;
alter table public.completed_league_rooms enable row level security;

-- The browser never accesses these tables directly. The Express server uses the
-- Supabase service-role key, which bypasses RLS; anonymous access remains denied.
revoke all on all tables in schema public from anon, authenticated;
