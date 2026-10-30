-- Phase 7: numerical problems (question kind 'problem') are practised in the CQ section, next to CQs.
-- A problem answer is the same plain text with math between dollar signs (plan 7b), so no new column is needed.
-- Two functions change: start_cq_session picks problems as well as CQs, and get_cq_session tells the screen
-- which kind each question is, so the player can show the math editor. Everything else (daily cap, photo
-- answers, the grade job, record_cq_grade) already works for both kinds.

create or replace function public.start_cq_session(p_set_id uuid, p_chapter_ids uuid[] default null) returns uuid
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
    and q.kind in ('cq', 'problem') and q.status = 'approved'
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

-- get_cq_session(): now also returns the kind of each question (cq or problem). Photos are named by file only,
-- the picture itself comes from /api/attempts/{attempt}/photos/{file}, which checks the owner.
create or replace function public.get_cq_session(p_session uuid) returns jsonb
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
            'kind', q.kind,
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
            'answer_source', a.answer_source,
            'seconds_spent', a.seconds_spent,
            'job_id', a.job_id,
            'job_status', j.status,
            'photos', coalesce((select jsonb_agg(split_part(ph, '/', 3) order by ord) from unnest(a.photo_paths) with ordinality as t(ph, ord)), '[]'::jsonb),
            'transcribe_job_id', a.transcribe_job_id,
            'transcribe_status', tj.status,
            'transcription', a.transcription,
            'unsure', coalesce(a.transcription_unsure, '[]'::jsonb),
            'graded', a.graded_at is not null,
            'score', case when a.graded_at is not null then a.score end,
            'feedback', case when a.graded_at is not null then a.feedback end
          ) as j
        from public.attempt a
        join public.question q on q.id = a.question_id
        join public.chapter ch on ch.id = q.chapter_id
        left join public.job j on j.id = a.job_id
        left join public.job tj on tj.id = a.transcribe_job_id
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
