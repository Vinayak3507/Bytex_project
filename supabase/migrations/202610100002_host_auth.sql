create table if not exists public.hosts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) <= 254),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.host_sessions (
  token_hash text primary key,
  host_id uuid not null references public.hosts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists host_sessions_host_id_idx on public.host_sessions(host_id);
create index if not exists host_sessions_expiry_idx on public.host_sessions(expires_at);

alter table public.question_sets alter column owner_token_hash drop not null;
alter table public.question_sets add column if not exists owner_id uuid references public.hosts(id);
alter table public.rooms add column if not exists owner_id uuid references public.hosts(id);
update public.rooms r set owner_id = q.owner_id
from public.question_sets q where r.question_set_id = q.id and r.owner_id is null and q.owner_id is not null;
create index if not exists question_sets_owner_created_idx on public.question_sets(owner_id, created_at desc);
create index if not exists rooms_owner_created_idx on public.rooms(owner_id, created_at desc);

alter table public.hosts enable row level security;
alter table public.host_sessions enable row level security;
revoke all on public.hosts, public.host_sessions from anon, authenticated;
