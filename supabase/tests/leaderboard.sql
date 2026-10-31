-- Leaderboard tests: the admin switch, opt-in, which sessions count, and who can call what.
-- Run against the project (SQL editor, psql, or the Supabase MCP execute_sql). Everything rolls back.
-- Success: the last statement returns "ALL LEADERBOARD TESTS PASSED". Any failure raises an exception naming the check.

begin;

do $$
declare
  admin_id   uuid := '00000000-0000-0000-0000-0000000000a1';
  stud_a     uuid := '00000000-0000-0000-0000-0000000000b1';
  stud_b     uuid := '00000000-0000-0000-0000-0000000000b2';
  stud_c     uuid := '00000000-0000-0000-0000-0000000000b3';
  pending_id uuid := '00000000-0000-0000-0000-0000000000c1';
  exam_id    uuid;
  set_id     uuid;
  n integer;
  pct integer;
  me boolean;
  denied boolean;
begin
  -- Fixtures (as the table owner, which bypasses RLS).
  insert into auth.users (id, email) values
    (admin_id, 'admin@test.local'), (stud_a, 'a@test.local'), (stud_b, 'b@test.local'),
    (stud_c, 'c@test.local'), (pending_id, 'pending@test.local');
  insert into public.profile (id, name, email, role, status) values
    (admin_id, 'Admin', 'admin@test.local', 'admin', 'active'),
    (stud_a, 'Student A', 'a@test.local', 'student', 'active'),
    (stud_b, 'Student B', 'b@test.local', 'student', 'active'),
    (stud_c, 'Student C', 'c@test.local', 'student', 'active'),
    (pending_id, 'Pending', 'pending@test.local', 'student', 'pending');
  select id into exam_id from public.exam order by sort_order limit 1;
  insert into public.question_set (exam_id, name, origin) values (exam_id, 'zz Leaderboard test set', 'curated') returning id into set_id;
  update public.app_setting set leaderboard_on = false where id = 1;

  -- The setting row exists and is the only one.
  select count(*) into n from public.app_setting;
  assert n = 1, 'app_setting has one row';

  -- anon: no table access, no functions.
  set local role anon;
  denied := false;
  begin perform 1 from public.app_setting limit 1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon must not read app_setting';
  denied := false;
  begin perform public.exam_leaderboard(exam_id); exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon must not call exam_leaderboard';
  denied := false;
  begin perform public.set_leaderboard_opt_in(true); exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon must not call set_leaderboard_opt_in';
  reset role;

  -- Student A joins. A and B have sessions. C never joins.
  perform set_config('request.jwt.claims', json_build_object('sub', stud_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_leaderboard_opt_in(true);
  -- A student reads the switch but cannot change it.
  select count(*) into n from public.app_setting;
  assert n = 1, 'student reads app_setting';
  update public.app_setting set leaderboard_on = true where id = 1;
  get diagnostics n = row_count;
  assert n = 0, 'student must not change app_setting';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', stud_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_leaderboard_opt_in(true);
  reset role;

  -- Sessions (owner inserts). A: 80% and 60% after joining, 0% before. B: 90% after joining. C: 100%, never joined.
  insert into public.session_run (user_id, exam_id, set_id, sections, started_at, finished_at, score, max_score) values
    (stud_a, exam_id, set_id, '{mcq}', now() + interval '1 minute', now() + interval '20 minutes', 8, 10),
    (stud_a, exam_id, set_id, '{mcq}', now() + interval '1 hour', now() + interval '2 hours', 6, 10),
    (stud_a, exam_id, set_id, '{mcq}', now() - interval '1 day', now() - interval '23 hours', 0, 10),
    (stud_b, exam_id, set_id, '{mcq}', now() + interval '1 minute', now() + interval '20 minutes', 9, 10),
    (stud_c, exam_id, set_id, '{mcq}', now() + interval '1 minute', now() + interval '20 minutes', 10, 10);
  -- Ignored kinds: an unfinished session, a CQ session and a retry.
  insert into public.session_run (user_id, exam_id, set_id, sections, started_at, finished_at, score, max_score, retry_of) values
    (stud_b, exam_id, set_id, '{mcq}', now() + interval '1 minute', null, null, null, null),
    (stud_b, exam_id, set_id, '{cq}', now() + interval '1 minute', now() + interval '1 hour', 0, 10, null),
    (stud_b, exam_id, set_id, '{mcq}', now() + interval '1 minute', now() + interval '1 hour', 0, 10,
      (select r.id from public.session_run r where r.user_id = stud_b and r.score = 9));

  -- While switched off: nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', stud_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.exam_leaderboard(exam_id);
  assert n = 0, 'leaderboard is empty while switched off';
  reset role;

  -- The admin switches it on.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.app_setting set leaderboard_on = true where id = 1;
  get diagnostics n = row_count;
  assert n = 1, 'admin can switch the leaderboard on';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', stud_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.exam_leaderboard(exam_id) l where l.name in ('Student A', 'Student B', 'Student C');
  assert n = 2, format('only joined students are listed, saw %s', n);
  select l.avg_percent, l.is_me into pct, me from public.exam_leaderboard(exam_id) l where l.name = 'Student A';
  assert pct = 70, format('A averages 80 and 60, the session before joining is left out, got %s', pct);
  assert me, 'A sees their own row marked';
  select l.avg_percent, l.sessions into pct, n from public.exam_leaderboard(exam_id) l where l.name = 'Student B';
  assert pct = 90 and n = 1, format('B has one counted session at 90, got %s%% over %s', pct, n);
  select count(*) into n from public.exam_leaderboard(exam_id) l where l.name = 'Student B' and l.rank < (select l2.rank from public.exam_leaderboard(exam_id) l2 where l2.name = 'Student A');
  assert n = 1, 'B ranks above A';

  -- A leaves: their row is gone.
  perform public.set_leaderboard_opt_in(false);
  select count(*) into n from public.exam_leaderboard(exam_id) l where l.name = 'Student A';
  assert n = 0, 'a student who left is not listed';
  reset role;

  -- A pending user cannot see or join it.
  perform set_config('request.jwt.claims', json_build_object('sub', pending_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.exam_leaderboard(exam_id); exception when insufficient_privilege then denied := true; end;
  assert denied, 'pending user must not see the leaderboard';
  denied := false;
  begin perform public.set_leaderboard_opt_in(true); exception when insufficient_privilege then denied := true; end;
  assert denied, 'pending user must not join the leaderboard';
  reset role;
end $$;

select 'ALL LEADERBOARD TESTS PASSED' as result;

rollback;
