-- Notification tests: the triggers that write them, who can read them, and that a student can only mark their own read.
-- Run against the project (SQL editor, psql, or the Supabase MCP execute_sql). Everything rolls back.
-- Success: the last statement returns "ALL NOTIFICATION TESTS PASSED". Any failure raises an exception naming the check.

begin;

do $$
declare
  stud_a  uuid := '00000000-0000-0000-0000-0000000000b1';
  stud_b  uuid := '00000000-0000-0000-0000-0000000000b2';
  exam_id uuid;
  q_id    uuid;
  run_a   uuid;
  att_a   uuid;
  job_a   uuid;
  n integer;
  denied boolean;
begin
  -- Fixtures (as the table owner, which bypasses RLS).
  insert into auth.users (id, email) values (stud_a, 'a@test.local'), (stud_b, 'b@test.local');
  insert into public.profile (id, name, email, role, status) values
    (stud_a, 'Student A', 'a@test.local', 'student', 'active'),
    (stud_b, 'Student B', 'b@test.local', 'student', 'active');
  select id into exam_id from public.exam order by sort_order limit 1;
  select id into q_id from public.question where kind = 'cq' limit 1;
  insert into public.session_run (user_id, exam_id, sections, finished_at) values (stud_a, exam_id, '{cq}', now()) returning id into run_a;
  insert into public.job (user_id, kind, status, payload) values (stud_a, 'grade', 'running', '{}'::jsonb) returning id into job_a;
  insert into public.attempt (session_run_id, user_id, question_id, position, answered_at, job_id)
    values (run_a, stud_a, q_id, 0, now(), job_a) returning id into att_a;

  -- Nothing until something happens.
  select count(*) into n from public.notification where session_run_id = run_a;
  assert n = 0, 'no notification before marking';

  -- A failed marking notifies.
  update public.job set status = 'failed' where id = job_a;
  select count(*) into n from public.notification where session_run_id = run_a and kind = 'grade_failed' and read_at is null and user_id = stud_a;
  assert n = 1, 'a failed grading job notifies the student';

  -- Retried and marked: a "graded" note, and the failed note is settled.
  update public.job set status = 'done' where id = job_a;
  update public.attempt set graded_at = now(), score = 5 where id = att_a;
  select count(*) into n from public.notification where session_run_id = run_a and kind = 'graded' and read_at is null;
  assert n = 1, 'marking an answer notifies the student';
  select count(*) into n from public.notification where session_run_id = run_a and kind = 'grade_failed' and read_at is not null;
  assert n = 1, 'the failed note is settled once nothing in the session is failed';

  -- anon: no access.
  set local role anon;
  denied := false;
  begin perform 1 from public.notification limit 1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon must not read notifications';
  reset role;

  -- B sees none of A's notifications and cannot mark them read.
  perform set_config('request.jwt.claims', json_build_object('sub', stud_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.notification where session_run_id = run_a;
  assert n = 0, 'another student cannot read the notification';
  update public.notification set read_at = now() where session_run_id = run_a;
  get diagnostics n = row_count;
  assert n = 0, 'another student cannot mark it read';
  denied := false;
  begin perform private.notify(stud_b, run_a, 'graded'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'students cannot call private.notify';
  reset role;

  -- A reads and marks their own, but cannot change anything else or add rows.
  perform set_config('request.jwt.claims', json_build_object('sub', stud_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.notification where session_run_id = run_a and read_at is null;
  assert n = 1, 'the student reads their own unread note';
  update public.notification set read_at = now() where session_run_id = run_a and read_at is null;
  get diagnostics n = row_count;
  assert n = 1, 'the student marks their own note read';
  denied := false;
  begin update public.notification set kind = 'graded' where session_run_id = run_a; exception when insufficient_privilege then denied := true; end;
  assert denied, 'only read_at can be changed';
  denied := false;
  begin insert into public.notification (user_id, session_run_id, kind) values (stud_a, run_a, 'graded'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'students cannot insert notifications';
  reset role;

  -- A later mark in the same session makes the note unread again.
  update public.attempt set graded_at = now() + interval '1 second', score = 6 where id = att_a;
  select count(*) into n from public.notification where session_run_id = run_a and kind = 'graded' and read_at is null;
  assert n = 1, 'a new mark makes the note unread again';
end $$;

select 'ALL NOTIFICATION TESTS PASSED' as result;

rollback;
