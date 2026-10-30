-- Phase 3: question bank, question sets, and the minimal request router and job queue (plan sections 2.3, 5b, 8).
-- Questions and sets are written by the admin from the browser (RLS). Jobs and slots are driven by the server (service role).

create type public.question_kind as enum ('mcq', 'cq', 'problem');
create type public.question_origin as enum ('manual', 'ai');
create type public.question_status as enum ('draft', 'approved');

-- A chapter must be addressable together with its course, so a question cannot point at a chapter of another course.
alter table public.chapter add constraint chapter_id_course_key unique (id, course_id);

-- Router slots: one row per (Google project key, model tier). Pace and cooldown live here, not in code.
create table public.api_slot (
  id uuid primary key default gen_random_uuid(),
  key_name text not null check (key_name in ('A', 'B')),
  tier text not null check (tier in ('primary', 'backup')),
  model text not null,
  priority integer not null,
  enabled boolean not null default true,
  pace_seconds integer not null default 12 check (pace_seconds >= 0),
  next_allowed_at timestamptz not null default now(),
  cooldown_until timestamptz,
  last_used_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  unique (key_name, tier)
);

-- Job queue. Phase 3 uses kind 'generate'. Phase 5 and 6 add 'grade' and 'transcribe'.
create table public.job (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profile (id) on delete cascade,
  kind text not null check (kind in ('transcribe', 'grade', 'generate')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  priority integer not null default 100,
  attempts integer not null default 0 check (attempts >= 0),
  slot_id uuid references public.api_slot (id) on delete set null,
  error text,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index job_queue_idx on public.job (priority, created_at) where status = 'queued';
create index job_user_idx on public.job (user_id, created_at desc);
create index job_slot_idx on public.job (slot_id);

create table public.question (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  chapter_id uuid not null,
  kind public.question_kind not null,
  text text not null check (char_length(text) between 1 and 4000),
  marks integer not null default 1 check (marks > 0 and marks <= 100),
  origin public.question_origin not null default 'manual',
  status public.question_status not null default 'draft',
  figure_id uuid references public.figure (id) on delete set null,
  source_page integer check (source_page > 0),
  answer_notes text check (char_length(answer_notes) <= 4000),
  job_id uuid references public.job (id) on delete set null,
  created_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (chapter_id, course_id) references public.chapter (id, course_id) on delete cascade
);
create index question_course_idx on public.question (course_id);
create index question_chapter_idx on public.question (chapter_id, status, kind);
create index question_figure_idx on public.question (figure_id);
create index question_job_idx on public.question (job_id);
create index question_created_by_idx on public.question (created_by);

create table public.mcq_option (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question (id) on delete cascade,
  label text not null check (label in ('A', 'B', 'C', 'D')),
  text text not null check (char_length(text) between 1 and 1000),
  is_correct boolean not null default false,
  explanation text check (char_length(explanation) <= 2000),
  unique (question_id, label)
);
create unique index mcq_option_one_correct on public.mcq_option (question_id) where is_correct;

-- An approved MCQ must have four options and exactly one correct answer.
create function public.check_question_ready() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n integer;
  c integer;
begin
  if new.status = 'approved' and new.kind = 'mcq' then
    select count(*), count(*) filter (where is_correct) into n, c from public.mcq_option where question_id = new.id;
    if n <> 4 or c <> 1 then
      raise exception 'An approved MCQ needs four options and exactly one correct answer' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger question_ready
before insert or update of status, kind on public.question
for each row execute function public.check_question_ready();

create table public.question_set (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exam (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  origin text not null check (origin in ('auto', 'curated')),
  created_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (exam_id, name)
);
create index question_set_created_by_idx on public.question_set (created_by);

create table public.question_set_item (
  set_id uuid not null references public.question_set (id) on delete cascade,
  question_id uuid not null references public.question (id) on delete cascade,
  position integer not null check (position >= 0),
  primary key (set_id, question_id)
);
create index question_set_item_question_idx on public.question_set_item (question_id);

-- Table privileges. Policies below decide who gets which rows.
revoke all on table
  public.api_slot, public.job, public.question, public.mcq_option, public.question_set, public.question_set_item
from anon, authenticated;

grant select on table public.api_slot, public.job, public.question, public.mcq_option, public.question_set, public.question_set_item to authenticated;
grant update (enabled, pace_seconds) on table public.api_slot to authenticated;
grant insert, update, delete on table public.question, public.mcq_option, public.question_set, public.question_set_item to authenticated;

alter table public.api_slot enable row level security;
alter table public.job enable row level security;
alter table public.question enable row level security;
alter table public.mcq_option enable row level security;
alter table public.question_set enable row level security;
alter table public.question_set_item enable row level security;

create policy "api_slot: admin read" on public.api_slot
  for select to authenticated using ((select private.is_admin()));
create policy "api_slot: admin update" on public.api_slot
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Jobs: your own, or all for the admin. Created and changed only by the server.
create policy "job: read own or admin" on public.job
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Questions: the admin sees and edits everything. Active students see approved questions only.
create policy "question: read" on public.question
  for select to authenticated using ((select private.is_admin()) or ((select private.is_active()) and status = 'approved'));
create policy "question: admin insert" on public.question
  for insert to authenticated with check ((select private.is_admin()));
create policy "question: admin update" on public.question
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "question: admin delete" on public.question
  for delete to authenticated using ((select private.is_admin()));

-- MCQ options include the answer key, so students never read this table directly.
-- Phase 4 serves options without is_correct and reveals the answer after the student picks.
create policy "mcq_option: admin read" on public.mcq_option
  for select to authenticated using ((select private.is_admin()));
create policy "mcq_option: admin insert" on public.mcq_option
  for insert to authenticated with check ((select private.is_admin()));
create policy "mcq_option: admin update" on public.mcq_option
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "mcq_option: admin delete" on public.mcq_option
  for delete to authenticated using ((select private.is_admin()));

create policy "question_set: active read" on public.question_set
  for select to authenticated using ((select private.is_active()));
create policy "question_set: admin insert" on public.question_set
  for insert to authenticated with check ((select private.is_admin()));
create policy "question_set: admin update" on public.question_set
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "question_set: admin delete" on public.question_set
  for delete to authenticated using ((select private.is_admin()));

create policy "question_set_item: active read" on public.question_set_item
  for select to authenticated using ((select private.is_active()));
create policy "question_set_item: admin insert" on public.question_set_item
  for insert to authenticated with check ((select private.is_admin()));
create policy "question_set_item: admin update" on public.question_set_item
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "question_set_item: admin delete" on public.question_set_item
  for delete to authenticated using ((select private.is_admin()));

-- save_question(): create or update a question and its MCQ options in one transaction.
-- Runs as the caller, so row level security still means admin only. The question is saved as a draft first,
-- then moved to the wanted status, so the readiness trigger sees the final options.
create function public.save_question(p_question jsonb, p_options jsonb) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  qid uuid := nullif(p_question ->> 'id', '')::uuid;
  want public.question_status := coalesce(nullif(p_question ->> 'status', ''), 'draft')::public.question_status;
  q_kind public.question_kind;
begin
  if qid is null then
    insert into public.question (course_id, chapter_id, kind, text, marks, origin, status, figure_id, source_page, answer_notes, created_by)
    values (
      (p_question ->> 'course_id')::uuid, (p_question ->> 'chapter_id')::uuid, (p_question ->> 'kind')::public.question_kind,
      p_question ->> 'text', (p_question ->> 'marks')::integer, 'manual', 'draft',
      nullif(p_question ->> 'figure_id', '')::uuid, nullif(p_question ->> 'source_page', '')::integer,
      nullif(p_question ->> 'answer_notes', ''), (select auth.uid())
    )
    returning id, kind into qid, q_kind;
  else
    update public.question
    set text = p_question ->> 'text',
        marks = (p_question ->> 'marks')::integer,
        figure_id = nullif(p_question ->> 'figure_id', '')::uuid,
        source_page = nullif(p_question ->> 'source_page', '')::integer,
        answer_notes = nullif(p_question ->> 'answer_notes', ''),
        status = 'draft',
        updated_at = now()
    where id = qid
    returning kind into q_kind;
    if not found then
      raise exception 'Question not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.mcq_option where question_id = qid;
  if q_kind = 'mcq' then
    insert into public.mcq_option (question_id, label, text, is_correct, explanation)
    select qid, o.label, o.text, coalesce(o.is_correct, false), nullif(o.explanation, '')
    from jsonb_to_recordset(p_options) as o (label text, text text, is_correct boolean, explanation text);
  end if;

  update public.question set status = want where id = qid;
  return qid;
end;
$$;
revoke execute on function public.save_question(jsonb, jsonb) from public, anon;
grant execute on function public.save_question(jsonb, jsonb) to authenticated;

-- create_auto_set(): a new "Set N" for an exam, built from approved questions of the exam's chapters.
-- Round-robin over chapters so the chapter mix matches the exam, random inside each chapter.
-- Problems count with CQs. Called by the server only (service role) after it checked who is asking.
create function public.create_auto_set(p_exam_id uuid, p_user uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.exam_set_settings;
  sid uuid;
  next_n integer;
  total integer;
  added integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_exam_id::text, 0));

  select * into s from public.exam_set_settings where exam_id = p_exam_id;
  if not found then
    raise exception 'unknown_exam' using errcode = 'P0001';
  end if;

  select count(*), coalesce(max((regexp_match(name, '^Set ([0-9]+)$'))[1]::integer), 0) + 1
  into total, next_n
  from public.question_set where exam_id = p_exam_id;
  if total >= 50 then
    raise exception 'too_many_sets' using errcode = 'P0001';
  end if;

  insert into public.question_set (exam_id, name, origin, created_by)
  values (p_exam_id, 'Set ' || next_n, 'auto', p_user)
  returning id into sid;

  with pool as (
    select q.id, q.kind,
      row_number() over (partition by q.chapter_id, (q.kind = 'mcq') order by random()) as rn,
      random() as r
    from public.question q
    join public.exam_chapter ec on ec.chapter_id = q.chapter_id and ec.exam_id = p_exam_id
    where q.status = 'approved'
  ),
  picked as (
    (select id, 0 as grp, rn, r from pool where kind = 'mcq' order by rn, r limit s.mcq_count)
    union all
    (select id, 1 as grp, rn, r from pool where kind <> 'mcq' order by rn, r limit s.cq_count)
  )
  insert into public.question_set_item (set_id, question_id, position)
  select sid, id, (row_number() over (order by grp, rn, r))::integer - 1 from picked;

  get diagnostics added = row_count;
  if added = 0 then
    raise exception 'no_questions' using errcode = 'P0001';
  end if;
  return sid;
end;
$$;
revoke execute on function public.create_auto_set(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_auto_set(uuid, uuid) to service_role;

-- claim_next_job(): the heart of the router. In one transaction it picks a ready slot (enabled, past its pace
-- and cooldown, best priority first), picks the oldest queued job (lowest priority number first), marks the job
-- running on that slot and pushes the slot's next_allowed_at forward by its pace. SKIP LOCKED keeps two ticks
-- from taking the same slot or job. Jobs stuck running for over 6 minutes are given back, or failed after 3 tries.
-- Returns null when no slot is ready or no job is waiting.
create function public.claim_next_job() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.api_slot;
  j public.job;
begin
  update public.job
  set status = case when attempts + 1 >= 3 then 'failed' else 'queued' end,
      attempts = attempts + 1,
      error = case when attempts + 1 >= 3 then 'Timed out while running' else error end,
      finished_at = case when attempts + 1 >= 3 then now() else null end,
      slot_id = null
  where status = 'running' and started_at < now() - interval '6 minutes';

  select * into s from public.api_slot a
  where a.enabled and a.next_allowed_at <= now() and (a.cooldown_until is null or a.cooldown_until <= now())
  order by a.priority
  for update skip locked
  limit 1;
  if not found then
    return null;
  end if;

  select * into j from public.job b
  where b.status = 'queued'
  order by b.priority, b.created_at
  for update skip locked
  limit 1;
  if not found then
    return null;
  end if;

  update public.job set status = 'running', slot_id = s.id, started_at = now(), error = null where id = j.id;
  update public.api_slot set next_allowed_at = now() + make_interval(secs => s.pace_seconds), last_used_at = now() where id = s.id;

  return jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'user_id', j.user_id, 'kind', j.kind, 'payload', j.payload, 'attempts', j.attempts),
    'slot', jsonb_build_object('id', s.id, 'key_name', s.key_name, 'tier', s.tier, 'model', s.model)
  );
end;
$$;
revoke execute on function public.claim_next_job() from public, anon, authenticated;
grant execute on function public.claim_next_job() to service_role;
