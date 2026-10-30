-- Phase 4: MCQ practice (plan sections 2.4, 3, 8, 10).
-- A student starts a session from a set. The question list is frozen into attempt rows at the start.
-- The answer key (mcq_option.is_correct and explanations) never leaves the database until the student has
-- answered that question or the session is over. MCQ answering never calls the AI.
-- Students cannot write these tables from the browser. They call the functions below, which check auth.uid().

create table public.session_run (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profile (id) on delete cascade,
  exam_id uuid not null references public.exam (id) on delete cascade,
  set_id uuid references public.question_set (id) on delete set null,
  sections text[] not null default '{mcq}',
  chapter_ids uuid[] not null default '{}',
  retry_of uuid references public.session_run (id) on delete set null,
  started_at timestamptz not null default now(),
  mcq_deadline_at timestamptz,
  finished_at timestamptz,
  timed_out boolean not null default false,
  score integer check (score >= 0),
  max_score integer check (max_score >= 0)
);
create index session_run_user_exam_idx on public.session_run (user_id, exam_id, started_at desc);
create index session_run_exam_idx on public.session_run (exam_id);
create index session_run_set_idx on public.session_run (set_id);
create index session_run_retry_idx on public.session_run (retry_of);

create table public.attempt (
  id uuid primary key default gen_random_uuid(),
  session_run_id uuid not null references public.session_run (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  question_id uuid not null references public.question (id) on delete cascade,
  position integer not null check (position >= 0),
  selected_option_id uuid references public.mcq_option (id) on delete set null,
  is_correct boolean,
  score integer not null default 0 check (score >= 0),
  seconds_spent integer check (seconds_spent >= 0),
  answered_at timestamptz,
  unique (session_run_id, question_id)
);
create index attempt_user_idx on public.attempt (user_id);
create index attempt_question_idx on public.attempt (question_id);
create index attempt_option_idx on public.attempt (selected_option_id);

-- "Report question" button: a student flags a question, the admin reads the flags.
create table public.question_report (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (question_id, user_id)
);
create index question_report_user_idx on public.question_report (user_id);

revoke all on table public.session_run, public.attempt, public.question_report from anon, authenticated;
grant select on table public.session_run, public.attempt to authenticated;
grant select, insert, delete on table public.question_report to authenticated;

alter table public.session_run enable row level security;
alter table public.attempt enable row level security;
alter table public.question_report enable row level security;

-- Your own sessions and attempts only. The admin does not read them either (plan section 5a: answers are private).
create policy "session_run: read own" on public.session_run
  for select to authenticated using (user_id = (select auth.uid()));
create policy "attempt: read own" on public.attempt
  for select to authenticated using (user_id = (select auth.uid()));

create policy "question_report: read own or admin" on public.question_report
  for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "question_report: report as yourself" on public.question_report
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active())
    and exists (select 1 from public.question q where q.id = question_id)
  );
create policy "question_report: admin delete" on public.question_report
  for delete to authenticated using ((select private.is_admin()));

-- finalize_session(): close a session once, add up the score. Internal, called by the functions below.
create function private.finalize_session(p_session uuid, p_timed_out boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.session_run r
  set finished_at = case when p_timed_out and r.mcq_deadline_at is not null then least(now(), r.mcq_deadline_at) else now() end,
      timed_out = p_timed_out,
      score = (select coalesce(sum(a.score), 0) from public.attempt a where a.session_run_id = r.id),
      max_score = (select coalesce(sum(q.marks), 0) from public.attempt a join public.question q on q.id = a.question_id where a.session_run_id = r.id)
  where r.id = p_session and r.finished_at is null;
end;
$$;
revoke execute on function private.finalize_session(uuid, boolean) from public, anon, authenticated;

-- start_mcq_session(): a session from a set. Only approved MCQs of the set, optionally narrowed to some chapters.
-- p_retry_of keeps only the questions missed (wrong or unanswered) in one of your finished sessions.
-- The MCQ countdown is the exam's mcq_seconds for the whole part (0 means no timer).
create function public.start_mcq_session(p_set_id uuid, p_chapter_ids uuid[] default null, p_retry_of uuid default null) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  st public.question_set;
  ex public.exam;
  sid uuid;
  n integer;
begin
  if not (select private.is_active()) then
    raise exception 'Only active members can practice' using errcode = '42501';
  end if;

  select * into st from public.question_set where id = p_set_id;
  if not found then
    raise exception 'unknown_set' using errcode = 'P0001';
  end if;
  select * into ex from public.exam where id = st.exam_id;

  if p_retry_of is not null and not exists (
    select 1 from public.session_run where id = p_retry_of and user_id = uid and finished_at is not null
  ) then
    raise exception 'unknown_session' using errcode = 'P0001';
  end if;

  insert into public.session_run (user_id, exam_id, set_id, retry_of, mcq_deadline_at)
  values (uid, ex.id, st.id, p_retry_of, case when ex.mcq_seconds > 0 then now() + make_interval(secs => ex.mcq_seconds) end)
  returning id into sid;

  insert into public.attempt (session_run_id, user_id, question_id, position)
  select sid, uid, q.id, (row_number() over (order by i.position))::integer - 1
  from public.question_set_item i
  join public.question q on q.id = i.question_id
  where i.set_id = st.id
    and q.kind = 'mcq' and q.status = 'approved'
    and (p_chapter_ids is null or cardinality(p_chapter_ids) = 0 or q.chapter_id = any (p_chapter_ids))
    and (p_retry_of is null or q.id in (
      select a.question_id from public.attempt a where a.session_run_id = p_retry_of and a.is_correct is distinct from true
    ));
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'no_questions' using errcode = 'P0001';
  end if;

  update public.session_run r
  set chapter_ids = (
    select coalesce(array_agg(distinct q.chapter_id), '{}')
    from public.attempt a join public.question q on q.id = a.question_id where a.session_run_id = r.id
  )
  where r.id = sid;
  return sid;
end;
$$;
revoke execute on function public.start_mcq_session(uuid, uuid[], uuid) from public, anon;
grant execute on function public.start_mcq_session(uuid, uuid[], uuid) to authenticated;

-- get_session(): everything the practice and result screens need, without the answer key for open questions.
-- A question's correct option and explanations appear only once you answered it, or when the session is over.
-- Also closes the session when the countdown ran out (3 seconds of grace for network delay).
create function public.get_session(p_session uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.session_run;
  payload jsonb;
begin
  if not (select private.is_active()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.session_run where id = p_session and user_id = uid for update;
  if not found then
    raise exception 'unknown_session' using errcode = 'P0001';
  end if;

  if r.finished_at is null and r.mcq_deadline_at is not null and now() > r.mcq_deadline_at + interval '3 seconds' then
    perform private.finalize_session(r.id, true);
    select * into r from public.session_run where id = p_session;
  end if;

  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', r.id,
      'exam_id', e.id,
      'exam_name', e.name,
      'course_name', c.name,
      'course_short', c.short_name,
      'set_id', r.set_id,
      'set_name', s.name,
      'retry_of', r.retry_of,
      'finished', r.finished_at is not null,
      'timed_out', r.timed_out,
      'started_at', r.started_at,
      'finished_at', r.finished_at,
      'score', r.score,
      'max_score', r.max_score,
      'timed', r.mcq_deadline_at is not null,
      'total_seconds', e.mcq_seconds,
      'seconds_left', case when r.finished_at is not null or r.mcq_deadline_at is null then null
                           else greatest(0, extract(epoch from r.mcq_deadline_at - now())) end
    ),
    'questions', coalesce((
      select jsonb_agg(x.j order by x.pos)
      from (
        select a.position as pos,
          jsonb_build_object(
            'id', q.id,
            'position', a.position,
            'text', q.text,
            'marks', q.marks,
            'chapter_id', q.chapter_id,
            'chapter_number', ch.number,
            'figure', (
              select jsonb_build_object('id', f.id, 'label', f.label, 'caption', f.caption, 'page', f.page, 'filename', sp.filename)
              from public.figure f join public.source_pdf sp on sp.id = f.pdf_id
              where f.id = q.figure_id
            ),
            'options', (
              select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'text', o.text) order by o.label)
              from public.mcq_option o where o.question_id = q.id
            ),
            'answered', a.answered_at is not null,
            'selected_option_id', a.selected_option_id,
            'is_correct', a.is_correct,
            'seconds_spent', a.seconds_spent,
            'revealed', v.rev,
            'source_page', case when v.rev then q.source_page end,
            'correct_option_id', case when v.rev then (select o.id from public.mcq_option o where o.question_id = q.id and o.is_correct) end,
            'explanation_correct', case when v.rev then (select o.explanation from public.mcq_option o where o.question_id = q.id and o.is_correct) end,
            'explanation_selected', case when v.rev and a.selected_option_id is not null
                                         then (select o.explanation from public.mcq_option o where o.id = a.selected_option_id) end
          ) as j
        from public.attempt a
        join public.question q on q.id = a.question_id
        join public.chapter ch on ch.id = q.chapter_id
        cross join lateral (select (a.answered_at is not null or r.finished_at is not null) as rev) v
        where a.session_run_id = r.id
      ) x
    ), '[]'::jsonb)
  )
  into payload
  from public.exam e
  join public.course c on c.id = e.course_id
  left join public.question_set s on s.id = r.set_id
  where e.id = r.exam_id;

  return payload;
end;
$$;
revoke execute on function public.get_session(uuid) from public, anon;
grant execute on function public.get_session(uuid) to authenticated;

-- answer_mcq(): record the pick, return the verdict and the explanations. The first answer is final.
-- The seconds spent are measured here, from the previous answer (or the start), so the browser cannot change them.
-- Returns status 'time_up' (and closes the session) when the countdown already ran out.
-- The last answer closes the session and adds up the score.
create function public.answer_mcq(p_session uuid, p_question uuid, p_option uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.session_run;
  a public.attempt;
  o public.mcq_option;
  m integer;
  prev timestamptz;
  left_over integer;
  total integer;
  fin boolean := false;
  correct_id uuid;
  expl_correct text;
  expl_selected text;
  page integer;
begin
  if not (select private.is_active()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into r from public.session_run where id = p_session and user_id = uid for update;
  if not found then
    raise exception 'unknown_session' using errcode = 'P0001';
  end if;
  if r.finished_at is not null then
    return jsonb_build_object('status', 'finished');
  end if;
  if r.mcq_deadline_at is not null and now() > r.mcq_deadline_at + interval '3 seconds' then
    perform private.finalize_session(r.id, true);
    return jsonb_build_object('status', 'time_up');
  end if;

  select * into a from public.attempt where session_run_id = r.id and question_id = p_question for update;
  if not found then
    raise exception 'unknown_question' using errcode = 'P0001';
  end if;
  if a.answered_at is not null then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;
  select * into o from public.mcq_option where id = p_option and question_id = p_question;
  if not found then
    raise exception 'unknown_option' using errcode = 'P0001';
  end if;

  select q.marks, q.source_page into m, page from public.question q where q.id = p_question;
  select coalesce(max(x.answered_at), r.started_at) into prev from public.attempt x where x.session_run_id = r.id;

  update public.attempt
  set selected_option_id = o.id,
      is_correct = o.is_correct,
      score = case when o.is_correct then m else 0 end,
      answered_at = now(),
      seconds_spent = greatest(0, round(extract(epoch from now() - prev)))::integer
  where id = a.id;

  select count(*) filter (where x.answered_at is null), count(*) into left_over, total
  from public.attempt x where x.session_run_id = r.id;
  if left_over = 0 then
    perform private.finalize_session(r.id, false);
    fin := true;
  end if;

  select c.id, c.explanation into correct_id, expl_correct from public.mcq_option c where c.question_id = p_question and c.is_correct;
  expl_selected := o.explanation;

  return jsonb_build_object(
    'status', 'ok',
    'is_correct', o.is_correct,
    'correct_option_id', correct_id,
    'explanation_correct', expl_correct,
    'explanation_selected', expl_selected,
    'source_page', page,
    'answered', total - left_over,
    'total', total,
    'finished', fin
  );
end;
$$;
revoke execute on function public.answer_mcq(uuid, uuid, uuid) from public, anon;
grant execute on function public.answer_mcq(uuid, uuid, uuid) to authenticated;

-- finish_mcq_session(): the student ends the session early. Unanswered questions count as missed.
create function public.finish_mcq_session(p_session uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.session_run;
begin
  if not (select private.is_active()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.session_run where id = p_session and user_id = uid for update;
  if not found then
    raise exception 'unknown_session' using errcode = 'P0001';
  end if;
  if r.finished_at is null then
    perform private.finalize_session(r.id, r.mcq_deadline_at is not null and now() > r.mcq_deadline_at);
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;
revoke execute on function public.finish_mcq_session(uuid) from public, anon;
grant execute on function public.finish_mcq_session(uuid) to authenticated;
