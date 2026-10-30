-- Phase 5 tests: CQ sessions, submitting answers, the daily cap, grading results, privacy, job priority.
-- Run in the Supabase SQL editor (or the MCP execute_sql). Everything rolls back, no data remains.
-- It builds its own course, chapter, exam, questions and set, so real data in the project does not change the counts.
-- Success: the last statement returns "ALL PHASE 5 TESTS PASSED". A failure raises an exception naming the check.

begin;

do $$
declare
  admin_id uuid := '00000000-0000-0000-0000-0000000000a5';
  s1 uuid := '00000000-0000-0000-0000-0000000000b7';
  s2 uuid := '00000000-0000-0000-0000-0000000000b8';
  c_id uuid; ch1 uuid; ch2 uuid; ex uuid; set_id uuid; set_mcq uuid;
  q1 uuid; q2 uuid; q3 uuid; q_draft uuid; q_mcq uuid; q_ch2 uuid;
  sess uuid; sess2 uuid; sess3 uuid;
  n integer; denied boolean;
  res jsonb; pay jsonb; qj jsonb;
  job1 uuid; job2 uuid; att1 uuid;
  opts jsonb := '[{"label":"A","text":"One","is_correct":true,"explanation":"Because one"},
                  {"label":"B","text":"Two","is_correct":false,"explanation":"x"},
                  {"label":"C","text":"Three","is_correct":false,"explanation":"x"},
                  {"label":"D","text":"Four","is_correct":false,"explanation":"x"}]';
begin
  insert into auth.users (id, email) values (admin_id, 'p5admin@test.local'), (s1, 'p5s1@test.local'), (s2, 'p5s2@test.local');
  insert into public.profile (id, name, email, role, status, daily_cap) values
    (admin_id, 'Admin', 'p5admin@test.local', 'admin', 'active', 10),
    (s1, 'S1', 'p5s1@test.local', 'student', 'active', 3),
    (s2, 'S2', 'p5s2@test.local', 'student', 'active', 3);

  insert into public.course (name) values ('P5 Test Course') returning id into c_id;
  insert into public.chapter (course_id, number, title) values (c_id, 1, 'One') returning id into ch1;
  insert into public.chapter (course_id, number, title) values (c_id, 2, 'Two') returning id into ch2;
  insert into public.exam (course_id, name) values (c_id, 'P5 Exam') returning id into ex;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  q1 := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'Explain sourcing.', 'marks', 5, 'status', 'approved', 'answer_notes', 'SECRET KEY POINTS'), '[]');
  q2 := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'Discuss procurement.', 'marks', 5, 'status', 'approved'), '[]');
  q3 := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'Compare buying methods.', 'marks', 3, 'status', 'approved'), '[]');
  q_ch2 := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch2, 'kind', 'cq', 'text', 'Chapter two question.', 'marks', 4, 'status', 'approved'), '[]');
  q_draft := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'A draft CQ', 'marks', 5, 'status', 'draft'), '[]');
  q_mcq := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'mcq', 'text', 'An MCQ in the set', 'marks', 1, 'status', 'approved'), opts);
  reset role;

  insert into public.question_set (exam_id, name, origin) values (ex, 'Set 1', 'curated') returning id into set_id;
  insert into public.question_set_item (set_id, question_id, position) values
    (set_id, q1, 0), (set_id, q2, 1), (set_id, q3, 2), (set_id, q_ch2, 3), (set_id, q_draft, 4), (set_id, q_mcq, 5);
  insert into public.question_set (exam_id, name, origin) values (ex, 'Set 2', 'curated') returning id into set_mcq;
  insert into public.question_set_item (set_id, question_id, position) values (set_mcq, q_mcq, 0);

  -- Starting a CQ session: approved CQs only, in set order, no countdown.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  sess := public.start_cq_session(set_id);
  select count(*) into n from public.attempt where session_run_id = sess;
  assert n = 4, format('CQ session has the 4 approved CQs (no draft, no MCQ), saw %s', n);
  select count(*) into n from public.session_run where id = sess and mcq_deadline_at is null and sections = '{cq}';
  assert n = 1, 'a CQ session has no countdown and is marked cq';
  sess2 := public.start_cq_session(set_id, array[ch2]);
  select count(*) into n from public.attempt where session_run_id = sess2;
  assert n = 1, 'narrowing to chapter 2 gives 1 question';
  denied := false;
  begin perform public.start_cq_session(set_mcq); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a set with no CQs cannot start a CQ session';
  select count(*) into n from public.session_run where user_id = s1;
  assert n = 2, 'a failed start leaves no empty session behind';
  denied := false;
  begin perform public.get_cq_session(gen_random_uuid()); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'unknown session';

  -- The CQ screen never gets the key points, and an MCQ session is not a CQ session.
  pay := public.get_cq_session(sess);
  assert jsonb_array_length(pay -> 'questions') = 4, 'get_cq_session lists 4 questions';
  assert pay::text not like '%SECRET KEY POINTS%', 'key points never reach the student';
  assert (pay -> 'cap' ->> 'limit')::integer = 3 and (pay -> 'cap' ->> 'used')::integer = 0, 'the cap starts unused';
  assert (pay -> 'questions' -> 0 ->> 'text') = 'Explain sourcing.', 'questions keep the set order';
  assert (pay -> 'questions' -> 0 ->> 'answered')::boolean = false, 'nothing answered yet';
  select a.id into att1 from public.attempt a where a.session_run_id = sess and a.question_id = q1;
  reset role;

  -- Submitting: validated, queued with priority, final.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.submit_cq_answer(sess, q1, '  ', 10); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a blank answer is rejected';
  denied := false;
  begin perform public.submit_cq_answer(sess, q1, repeat('x', 8001), 10); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a huge answer is rejected';
  denied := false;
  begin perform public.submit_cq_answer(sess, q_mcq, 'An answer to a question outside the session', 10); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a question outside the session is rejected';
  select count(*) into n from public.job where user_id = s1;
  assert n = 0, 'rejected answers queue nothing';

  res := public.submit_cq_answer(sess, q1, 'Sourcing is choosing suppliers.', 95);
  assert res ->> 'status' = 'ok' and (res ->> 'answered')::integer = 1 and (res ->> 'total')::integer = 4, 'first submit works';
  job1 := (res ->> 'job_id')::uuid;
  select count(*) into n from public.job j where j.id = job1 and j.kind = 'grade' and j.status = 'queued' and j.priority = 10 and j.user_id = s1 and j.payload ->> 'attempt_id' = att1::text;
  assert n = 1, 'a grade job is queued for this attempt at student priority';
  select count(*) into n from public.attempt where id = att1 and answer_text = 'Sourcing is choosing suppliers.' and job_id = job1 and seconds_spent = 95 and answered_at is not null and graded_at is null;
  assert n = 1, 'the answer, job and stopwatch are saved, not graded yet';
  denied := false;
  begin perform public.submit_cq_answer(sess, q1, 'Changing my answer later.', 10); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'an answer cannot be submitted twice';

  pay := public.get_cq_session(sess);
  qj := pay -> 'questions' -> 0;
  assert (qj ->> 'answered')::boolean and qj ->> 'job_status' = 'queued' and not (qj ->> 'graded')::boolean, 'submitted but not graded';
  assert qj -> 'feedback' = 'null'::jsonb and qj -> 'score' = 'null'::jsonb, 'no feedback before grading';
  assert (pay -> 'cap' ->> 'used')::integer = 1, 'the cap counts the job';

  -- A student cannot write jobs, attempts or grades directly.
  denied := false;
  begin insert into public.job (user_id, kind) values (s1, 'grade'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'a student cannot insert jobs';
  denied := false;
  begin update public.attempt set score = 5, feedback = '{}' where id = att1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'a student cannot write a score';
  denied := false;
  begin perform public.record_cq_grade(att1, 5, '{}'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'a student cannot call record_cq_grade';
  reset role;

  -- The daily cap is 3. Failed jobs do not count.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.submit_cq_answer(sess, q2, 'Procurement is buying.', 20);
  job2 := (res ->> 'job_id')::uuid;
  res := public.submit_cq_answer(sess, q3, 'Buying can be direct or by tender.', 20);
  assert (res ->> 'cap_used')::integer = 3, 'third submit uses the last grading of the day';
  denied := false;
  begin perform public.submit_cq_answer(sess2, q_ch2, 'One too many gradings today.', 20); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'the daily cap stops the fourth submit';
  select count(*) into n from public.attempt a where a.session_run_id = sess2 and a.answered_at is not null;
  assert n = 0, 'a refused submit saves nothing';
  reset role;

  update public.job set status = 'failed', error = 'test' where id = job2;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.submit_cq_answer(sess2, q_ch2, 'Now there is room again.', 20);
  assert res ->> 'status' = 'ok', 'a failed job frees one grading';
  reset role;

  -- Grading is recorded by the server. A finished session picks up late grades.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.finish_mcq_session(sess);
  select count(*) into n from public.session_run where id = sess and finished_at is not null and score = 0;
  assert n = 1, 'finishing with nothing graded yet gives 0';
  reset role;

  set local role service_role;
  perform public.record_cq_grade(att1, 4, '{"score":4,"out_of":5,"covered_points":["a"]}'::jsonb);
  denied := false;
  begin perform public.record_cq_grade(att1, 6, '{}'::jsonb); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a score above the marks is rejected';
  reset role;
  select count(*) into n from public.session_run where id = sess and score = 4 and max_score = 17;
  assert n = 1, 'a late grade updates the finished session score (4 of 5+5+3+4)';

  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  pay := public.get_cq_session(sess);
  qj := pay -> 'questions' -> 0;
  assert (qj ->> 'graded')::boolean and (qj ->> 'score')::integer = 4 and qj -> 'feedback' ->> 'out_of' = '5', 'graded feedback is returned';
  assert pay::text not like '%SECRET KEY POINTS%', 'key points still hidden after grading';
  reset role;

  -- Privacy between students, and for the admin.
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.get_cq_session(sess); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'another student cannot open this session';
  denied := false;
  begin perform public.submit_cq_answer(sess, q2, 'Sneaky answer for someone else.', 1); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'another student cannot submit into this session';
  select count(*) into n from public.attempt where answer_text is not null;
  assert n = 0, 'another student sees none of the answers';
  select count(*) into n from public.job where kind = 'grade';
  assert n = 0, 'another student sees none of the grading jobs';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.attempt where answer_text is not null;
  assert n = 0, 'the admin does not read answers either';
  reset role;

  -- Priority: a student's grade job is claimed before background generation, whatever the age.
  update public.job set status = 'done' where kind = 'grade' and user_id = s1;
  insert into public.api_slot (key_name, tier, model, priority, pace_seconds) values ('A', 'primary', 'test-model', 1, 0)
    on conflict (key_name, tier) do update set next_allowed_at = now(), cooldown_until = null, enabled = true, pace_seconds = 0;
  update public.job set status = 'done' where status in ('queued', 'running');
  insert into public.job (user_id, kind, priority, payload, created_at) values (admin_id, 'generate', 100, '{}', now() - interval '1 hour');
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.submit_cq_answer(public.start_cq_session(set_id, array[ch2]), q_ch2, 'A fresh student answer.', 5);
  reset role;
  set local role service_role;
  res := public.claim_next_job();
  reset role;
  assert res -> 'job' ->> 'kind' = 'grade', 'a waiting student is served before background generation';
end;
$$;

select 'ALL PHASE 5 TESTS PASSED' as result;

rollback;
