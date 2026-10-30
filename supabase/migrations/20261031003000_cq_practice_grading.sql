-- Phase 5: CQ practice with typed answers and AI grading (plan sections 5b, 5c, 7, 8, 10).
-- A CQ session freezes the set's CQs into attempt rows. Submitting an answer saves it and queues a 'grade' job.
-- The job handler (server, service role) calls Gemini through the router and records the result with record_cq_grade().
-- Students never write attempt rows directly. They call the functions below, which check auth.uid().

alter table public.attempt
  add column answer_text text check (char_length(answer_text) <= 8000),
  add column job_id uuid references public.job (id) on delete set null,
  add column feedback jsonb,
  add column graded_at timestamptz;
create index attempt_job_idx on public.attempt (job_id);

-- Gradings a member has asked for today (Bangladesh time). Failed jobs do not count: the AI failed, not the student.
create function private.grades_used_today(p_user uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.job j
  where j.user_id = p_user
    and j.kind = 'grade'
    and j.status <> 'failed'
    and j.created_at >= (date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka');
$$;
revoke execute on function private.grades_used_today(uuid) from public, anon, authenticated;

-- start_cq_session(): a CQ session from a set. Approved CQs of the set, optionally narrowed to some chapters.
-- No countdown. The student's stopwatch is for their own information.
create function public.start_cq_session(p_set_id uuid, p_chapter_ids uuid[] default null) returns uuid
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

  insert into public.session_run (user_id, exam_id, set_id, sections)
  values (uid, ex.id, st.id, '{cq}')
  returning id into sid;

  insert into public.attempt (session_run_id, user_id, question_id, position)
  select sid, uid, q.id, (row_number() over (order by i.position))::integer - 1
  from public.question_set_item i
  join public.question q on q.id = i.question_id
  where i.set_id = st.id
    and q.kind = 'cq' and q.status = 'approved'
    and (p_chapter_ids is null or cardinality(p_chapter_ids) = 0 or q.chapter_id = any (p_chapter_ids));
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
revoke execute on function public.start_cq_session(uuid, uuid[]) from public, anon;
grant execute on function public.start_cq_session(uuid, uuid[]) to authenticated;

-- get_cq_session(): what the CQ practice and result screens need. The key points (answer_notes) never leave the
-- database. Feedback appears only after grading. Job errors stay private, the student sees only that it failed.
create function public.get_cq_session(p_session uuid) returns jsonb
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
  select * into r from public.session_run where id = p_session and user_id = uid;
  if not found or not ('cq' = any (r.sections)) then
    raise exception 'unknown_session' using errcode = 'P0001';
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
      'finished', r.finished_at is not null,
      'started_at', r.started_at,
      'finished_at', r.finished_at,
      'score', r.score,
      'max_score', r.max_score
    ),
    'cap', jsonb_build_object(
      'used', private.grades_used_today(uid),
      'limit', (select p.daily_cap from public.profile p where p.id = uid)
    ),
    'questions', coalesce((
      select jsonb_agg(x.j order by x.pos)
      from (
        select a.position as pos,
          jsonb_build_object(
            'id', q.id,
            'attempt_id', a.id,
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
            'answered', a.answered_at is not null,
            'answer_text', a.answer_text,
            'seconds_spent', a.seconds_spent,
            'job_id', a.job_id,
            'job_status', j.status,
            'graded', a.graded_at is not null,
            'score', case when a.graded_at is not null then a.score end,
            'feedback', case when a.graded_at is not null then a.feedback end
          ) as j
        from public.attempt a
        join public.question q on q.id = a.question_id
        join public.chapter ch on ch.id = q.chapter_id
        left join public.job j on j.id = a.job_id
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
revoke execute on function public.get_cq_session(uuid) from public, anon;
grant execute on function public.get_cq_session(uuid) to authenticated;

-- submit_cq_answer(): save the typed answer and queue the grading job, in one transaction.
-- The first submission is final (a failed job is retried with the same answer, see the retry route).
-- The daily cap is checked here, under a per-user lock, so two quick submits cannot slip past it.
create function public.submit_cq_answer(p_session uuid, p_question uuid, p_answer text, p_seconds integer default null) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.session_run;
  a public.attempt;
  ans text := btrim(coalesce(p_answer, ''));
  cap integer;
  used integer;
  jid uuid;
  answered integer;
  total integer;
begin
  if not (select private.is_active()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into r from public.session_run where id = p_session and user_id = uid for update;
  if not found or not ('cq' = any (r.sections)) then
    raise exception 'unknown_session' using errcode = 'P0001';
  end if;
  if r.finished_at is not null then
    raise exception 'session_finished' using errcode = 'P0001';
  end if;

  select * into a from public.attempt where session_run_id = r.id and question_id = p_question for update;
  if not found then
    raise exception 'unknown_question' using errcode = 'P0001';
  end if;
  if a.answered_at is not null then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;
  if char_length(ans) < 3 then
    raise exception 'answer_too_short' using errcode = 'P0001';
  end if;
  if char_length(ans) > 8000 then
    raise exception 'answer_too_long' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 5));
  select daily_cap into cap from public.profile where id = uid;
  used := private.grades_used_today(uid);
  if used >= cap then
    raise exception 'daily_cap_reached' using errcode = 'P0001';
  end if;

  -- Students wait on grading jobs, so they go before background work such as question generation (priority 100).
  insert into public.job (user_id, kind, priority, payload)
  values (uid, 'grade', 10, jsonb_build_object('attempt_id', a.id))
  returning id into jid;

  update public.attempt
  set answer_text = ans,
      answered_at = now(),
      job_id = jid,
      seconds_spent = case when p_seconds is null then null else least(greatest(p_seconds, 0), 86400) end
  where id = a.id;

  select count(*) filter (where x.answered_at is not null), count(*) into answered, total
  from public.attempt x where x.session_run_id = r.id;

  return jsonb_build_object('status', 'ok', 'job_id', jid, 'answered', answered, 'total', total, 'cap_used', used + 1, 'cap_limit', cap);
end;
$$;
revoke execute on function public.submit_cq_answer(uuid, uuid, text, integer) from public, anon;
grant execute on function public.submit_cq_answer(uuid, uuid, text, integer) to authenticated;

-- record_cq_grade(): the grading job saves its verdict. Server only (service role).
-- When the session is already finished, its score is brought up to date, so late grades still count.
create function public.record_cq_grade(p_attempt uuid, p_score integer, p_feedback jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.attempt;
  m integer;
begin
  select * into a from public.attempt where id = p_attempt for update;
  if not found then
    raise exception 'unknown_attempt' using errcode = 'P0001';
  end if;
  select q.marks into m from public.question q where q.id = a.question_id;
  if p_score < 0 or p_score > m then
    raise exception 'score_out_of_range' using errcode = 'P0001';
  end if;

  update public.attempt set score = p_score, feedback = p_feedback, graded_at = now() where id = a.id;

  update public.session_run r
  set score = (select coalesce(sum(x.score), 0) from public.attempt x where x.session_run_id = r.id),
      max_score = (select coalesce(sum(q.marks), 0) from public.attempt x join public.question q on q.id = x.question_id where x.session_run_id = r.id)
  where r.id = a.session_run_id and r.finished_at is not null;
end;
$$;
revoke execute on function public.record_cq_grade(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.record_cq_grade(uuid, integer, jsonb) to service_role;
