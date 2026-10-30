-- Phase 6: photo answers for CQs (plan sections 5, 5c, 7, 7b, 8).
-- A student photographs the handwritten answer (compressed on the phone, up to 4 photos). The photos go to the private
-- answer-photos bucket under {user id}/{attempt id}/. A 'transcribe' job reads the handwriting through the router,
-- the student fixes the text, and the corrected text is submitted for marking exactly like a typed answer.
-- The photos are deleted after marking (by the grade job, and by a cleanup for anything left behind).
-- Students never write attempt rows directly. They call the functions below, which check auth.uid().

alter table public.attempt
  add column photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 4),
  add column photos_added_at timestamptz,
  add column transcribe_job_id uuid references public.job (id) on delete set null,
  add column transcription text check (char_length(transcription) <= 8000),
  add column transcription_unsure jsonb,
  add column answer_source text not null default 'typed' check (answer_source in ('typed', 'photo'));
create index attempt_transcribe_job_idx on public.attempt (transcribe_job_id);
create index attempt_photos_idx on public.attempt (photos_added_at) where cardinality(photo_paths) > 0;

-- The daily cap counts answers sent to the AI, not calls. A photo answer is read and then marked, and both calls
-- belong to the same attempt, so it uses one of the day's gradings, like a typed answer. Failed jobs do not count.
create or replace function private.grades_used_today(p_user uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct coalesce(j.payload ->> 'attempt_id', j.id::text))::integer
  from public.job j
  where j.user_id = p_user
    and j.kind in ('grade', 'transcribe')
    and j.status <> 'failed'
    and j.created_at >= (date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka');
$$;

-- Has this attempt already used one of today's gradings? Then more AI jobs for it cost nothing extra today.
create function private.attempt_counted_today(p_attempt uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.job j
    where j.kind in ('grade', 'transcribe')
      and j.status <> 'failed'
      and j.payload ->> 'attempt_id' = p_attempt::text
      and j.created_at >= (date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka')
  );
$$;
revoke execute on function private.attempt_counted_today(uuid) from public, anon, authenticated;

-- add_cq_photo(): register a photo the server just stored. The path must be this student's own folder for this attempt.
create function public.add_cq_photo(p_session uuid, p_question uuid, p_path text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.session_run;
  a public.attempt;
begin
  if not (select private.is_active()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.session_run where id = p_session and user_id = uid;
  if not found or not ('cq' = any (r.sections)) then
    raise exception 'unknown_session' using errcode = 'P0001';
  end if;
  if r.finished_at is not null then
    raise exception 'session_finished' using errcode = 'P0001';
  end if;
  select * into a from public.attempt where session_run_id = r.id and question_id = p_question and user_id = uid for update;
  if not found then
    raise exception 'unknown_question' using errcode = 'P0001';
  end if;
  if a.answered_at is not null then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;
  if a.transcribe_job_id is not null then
    raise exception 'photos_locked' using errcode = 'P0001';
  end if;
  if p_path is null or p_path !~ ('^' || uid::text || '/' || a.id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') then
    raise exception 'bad_photo_path' using errcode = 'P0001';
  end if;
  if cardinality(a.photo_paths) >= 4 then
    raise exception 'too_many_photos' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'answer-photos' and o.name = p_path) then
    raise exception 'photo_missing' using errcode = 'P0001';
  end if;

  update public.attempt
  set photo_paths = array_append(photo_paths, p_path), photos_added_at = now()
  where id = a.id;
  return jsonb_build_object('status', 'ok', 'attempt_id', a.id, 'count', cardinality(a.photo_paths) + 1);
end;
$$;
revoke execute on function public.add_cq_photo(uuid, uuid, text) from public, anon;
grant execute on function public.add_cq_photo(uuid, uuid, text) to authenticated;

-- remove_cq_photo(): take one photo off the attempt (before reading). Returns the storage path so the server can delete the file.
create function public.remove_cq_photo(p_session uuid, p_question uuid, p_file text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.session_run;
  a public.attempt;
  path text;
begin
  if not (select private.is_active()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.session_run where id = p_session and user_id = uid;
  if not found or not ('cq' = any (r.sections)) then
    raise exception 'unknown_session' using errcode = 'P0001';
  end if;
  if r.finished_at is not null then
    raise exception 'session_finished' using errcode = 'P0001';
  end if;
  select * into a from public.attempt where session_run_id = r.id and question_id = p_question and user_id = uid for update;
  if not found then
    raise exception 'unknown_question' using errcode = 'P0001';
  end if;
  if a.answered_at is not null then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;
  if a.transcribe_job_id is not null then
    raise exception 'photos_locked' using errcode = 'P0001';
  end if;
  path := uid::text || '/' || a.id::text || '/' || p_file;
  if not (path = any (a.photo_paths)) then
    raise exception 'unknown_photo' using errcode = 'P0001';
  end if;
  update public.attempt set photo_paths = array_remove(photo_paths, path) where id = a.id;
  return path;
end;
$$;
revoke execute on function public.remove_cq_photo(uuid, uuid, text) from public, anon;
grant execute on function public.remove_cq_photo(uuid, uuid, text) to authenticated;

-- reset_cq_photos(): "start over with new photos". Forgets the photos and the reading, returns the paths to delete.
-- The old jobs stay, so they still count toward the limit of 3 readings per answer.
create function public.reset_cq_photos(p_session uuid, p_question uuid) returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.session_run;
  a public.attempt;
begin
  if not (select private.is_active()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.session_run where id = p_session and user_id = uid;
  if not found or not ('cq' = any (r.sections)) then
    raise exception 'unknown_session' using errcode = 'P0001';
  end if;
  if r.finished_at is not null then
    raise exception 'session_finished' using errcode = 'P0001';
  end if;
  select * into a from public.attempt where session_run_id = r.id and question_id = p_question and user_id = uid for update;
  if not found then
    raise exception 'unknown_question' using errcode = 'P0001';
  end if;
  if a.answered_at is not null then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;

  update public.attempt
  set photo_paths = '{}', photos_added_at = null, transcribe_job_id = null, transcription = null, transcription_unsure = null
  where id = a.id;
  return a.photo_paths;
end;
$$;
revoke execute on function public.reset_cq_photos(uuid, uuid) from public, anon;
grant execute on function public.reset_cq_photos(uuid, uuid) to authenticated;

-- start_cq_transcription(): queue the job that reads the handwriting. Uses one of today's gradings (the marking that
-- follows is then free). A student may have the photos read at most 3 times per answer.
create function public.start_cq_transcription(p_session uuid, p_question uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.session_run;
  a public.attempt;
  cap integer;
  used integer;
  jid uuid;
  tries integer;
begin
  if not (select private.is_active()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.session_run where id = p_session and user_id = uid;
  if not found or not ('cq' = any (r.sections)) then
    raise exception 'unknown_session' using errcode = 'P0001';
  end if;
  if r.finished_at is not null then
    raise exception 'session_finished' using errcode = 'P0001';
  end if;
  select * into a from public.attempt where session_run_id = r.id and question_id = p_question and user_id = uid for update;
  if not found then
    raise exception 'unknown_question' using errcode = 'P0001';
  end if;
  if a.answered_at is not null then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;
  if cardinality(a.photo_paths) < 1 then
    raise exception 'no_photos' using errcode = 'P0001';
  end if;
  if a.transcribe_job_id is not null then
    raise exception 'photos_locked' using errcode = 'P0001';
  end if;

  select count(*) into tries from public.job j where j.kind = 'transcribe' and j.payload ->> 'attempt_id' = a.id::text;
  if tries >= 3 then
    raise exception 'too_many_readings' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 5));
  select daily_cap into cap from public.profile where id = uid;
  used := private.grades_used_today(uid);
  if not private.attempt_counted_today(a.id) and used >= cap then
    raise exception 'daily_cap_reached' using errcode = 'P0001';
  end if;

  insert into public.job (user_id, kind, priority, payload)
  values (uid, 'transcribe', 10, jsonb_build_object('attempt_id', a.id))
  returning id into jid;

  update public.attempt
  set transcribe_job_id = jid, transcription = null, transcription_unsure = null
  where id = a.id;

  return jsonb_build_object(
    'status', 'ok', 'job_id', jid,
    'cap_used', private.grades_used_today(uid), 'cap_limit', cap
  );
end;
$$;
revoke execute on function public.start_cq_transcription(uuid, uuid) from public, anon;
grant execute on function public.start_cq_transcription(uuid, uuid) to authenticated;

-- record_cq_transcription(): the reading job saves what it read. Server only (service role).
-- Ignored when the student has started over in the meantime (the attempt points at another job) or already answered.
create function public.record_cq_transcription(p_attempt uuid, p_job uuid, p_text text, p_unsure jsonb) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.attempt
  set transcription = left(p_text, 8000), transcription_unsure = p_unsure
  where id = p_attempt and transcribe_job_id = p_job and answered_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke execute on function public.record_cq_transcription(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_cq_transcription(uuid, uuid, text, jsonb) to service_role;

-- submit_cq_answer(): now also accepts the corrected text of a photo answer. If the attempt's photos were read,
-- the answer is a 'photo' answer and its grading is already paid for (the reading used the day's grading).
create or replace function public.submit_cq_answer(p_session uuid, p_question uuid, p_answer text, p_seconds integer default null) returns jsonb
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
  from_photo boolean;
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

  -- A photo answer is one whose reading finished (a reading still running cannot be submitted).
  from_photo := a.transcribe_job_id is not null;
  if from_photo and a.transcription is null then
    raise exception 'still_reading' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 5));
  select daily_cap into cap from public.profile where id = uid;
  used := private.grades_used_today(uid);
  if not private.attempt_counted_today(a.id) and used >= cap then
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
      answer_source = case when from_photo then 'photo' else 'typed' end,
      seconds_spent = case when p_seconds is null then null else least(greatest(p_seconds, 0), 86400) end
  where id = a.id;

  select count(*) filter (where x.answered_at is not null), count(*) into answered, total
  from public.attempt x where x.session_run_id = r.id;

  return jsonb_build_object('status', 'ok', 'job_id', jid, 'answered', answered, 'total', total, 'cap_used', private.grades_used_today(uid), 'cap_limit', cap);
end;
$$;

-- get_cq_session(): adds the photo and reading state of each question. Photos are named by file only,
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
