alter table public.question_sets
  add column if not exists description text not null default '',
  add column if not exists status text not null default 'draft',
  add column if not exists default_duration_ms integer not null default 20000,
  add column if not exists default_marks integer not null default 500,
  add column if not exists updated_at timestamptz not null default now();

alter table public.question_sets
  add constraint question_sets_status_check check (status in ('draft', 'published')),
  add constraint question_sets_default_duration_check check (default_duration_ms between 5000 and 120000),
  add constraint question_sets_default_marks_check check (default_marks between 0 and 10000);

alter table public.questions alter column question_set_id drop not null;
alter table public.questions alter column duration_ms drop not null;
alter table public.questions alter column correct_option_id drop not null;
alter table public.questions add column if not exists marks integer check (marks between 0 and 10000);
alter table public.questions add column if not exists explanation text not null default '';

alter table public.rooms add column if not exists quiz_snapshot jsonb;
create index if not exists question_sets_owner_status_updated_idx
  on public.question_sets(owner_id, status, updated_at desc);

-- Existing authored placement sets were complete at creation and remain hostable.
update public.question_sets q
set status = 'published', updated_at = now()
where q.owner_id is not null
  and exists (select 1 from public.questions x where x.question_set_id = q.id);

-- Replacing a quiz keeps old question rows (and their answer FK targets) detached.
-- Live rooms use their own JSON snapshot, so edits cannot change an existing session.
create or replace function public.replace_question_set_content(
  p_question_set_id uuid,
  p_title text,
  p_description text,
  p_default_duration_ms integer,
  p_default_marks integer,
  p_questions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from jsonb_to_recordset(p_questions) as incoming(id uuid)
    join public.questions existing on existing.id = incoming.id
    where existing.question_set_id is not null and existing.question_set_id <> p_question_set_id
  ) then
    raise exception 'Question ID belongs to another quiz';
  end if;

  update public.question_sets
  set title = p_title,
      description = p_description,
      default_duration_ms = p_default_duration_ms,
      default_marks = p_default_marks,
      status = 'draft',
      updated_at = now()
  where id = p_question_set_id;
  if not found then raise exception 'Question set not found'; end if;

  update public.questions set question_set_id = null where question_set_id = p_question_set_id;

  insert into public.questions(id, question_set_id, prompt, topic, difficulty, duration_ms, marks, explanation, options, correct_option_id, position)
  select incoming.id, p_question_set_id, incoming.prompt, incoming.topic, incoming.difficulty,
         incoming.duration_ms, incoming.marks, incoming.explanation, incoming.options,
         incoming.correct_option_id, incoming.position
  from jsonb_to_recordset(p_questions) as incoming(
    id uuid, prompt text, topic text, difficulty text, duration_ms integer, marks integer,
    explanation text, options jsonb, correct_option_id uuid, position integer
  )
  on conflict (id) do update set
    question_set_id = excluded.question_set_id,
    prompt = excluded.prompt,
    topic = excluded.topic,
    difficulty = excluded.difficulty,
    duration_ms = excluded.duration_ms,
    marks = excluded.marks,
    explanation = excluded.explanation,
    options = excluded.options,
    correct_option_id = excluded.correct_option_id,
    position = excluded.position;
end;
$$;

revoke all on function public.replace_question_set_content(uuid, text, text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.replace_question_set_content(uuid, text, text, integer, integer, jsonb) to service_role;
