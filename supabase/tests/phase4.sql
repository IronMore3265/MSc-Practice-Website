-- Phase 4 tests: MCQ practice sessions, the hidden answer key, timers, privacy between students, retry, reports.
-- Run in the Supabase SQL editor (or the MCP execute_sql). Everything rolls back, no data remains.
-- It builds its own course, chapters, exams, questions and set, so real data in the project does not change the counts.
-- Success: the last statement returns "ALL PHASE 4 TESTS PASSED". A failure raises an exception naming the check.

begin;

do $$
declare
  admin_id uuid := '00000000-0000-0000-0000-0000000000a4';
  s1 uuid := '00000000-0000-0000-0000-0000000000b5';
  s2 uuid := '00000000-0000-0000-0000-0000000000b6';
  p1 uuid := '00000000-0000-0000-0000-0000000000c4';
  c_id uuid; ch1 uuid; ch2 uuid; ex uuid; ex_untimed uuid; ex_cq uuid;
  set_id uuid; set_untimed uuid; set_cq uuid;
  qid uuid; q_draft uuid; q_cq uuid;
  sess uuid; sess2 uuid; sess3 uuid; retry uuid;
  n integer; denied boolean; st text;
  payload jsonb; res jsonb; qj jsonb;
  correct_id uuid; wrong_id uuid; other_opt uuid; first_key uuid; key_ids uuid[];
  opts jsonb := '[{"label":"A","text":"One","is_correct":true,"explanation":"Because one"},
                  {"label":"B","text":"Two","is_correct":false,"explanation":"Two is wrong"},
                  {"label":"C","text":"Three","is_correct":false,"explanation":"Three is wrong"},
                  {"label":"D","text":"Four","is_correct":false,"explanation":"Four is wrong"}]';
  qs uuid[] := '{}';
begin
  insert into auth.users (id, email) values
    (admin_id, 'p4admin@test.local'), (s1, 'p4s1@test.local'), (s2, 'p4s2@test.local'), (p1, 'p4p@test.local');
  insert into public.profile (id, name, email, role, status) values
    (admin_id, 'Admin', 'p4admin@test.local', 'admin', 'active'),
    (s1, 'S1', 'p4s1@test.local', 'student', 'active'),
    (s2, 'S2', 'p4s2@test.local', 'student', 'active'),
    (p1, 'Pending', 'p4p@test.local', 'student', 'pending');

  insert into public.course (name) values ('P4 Test Course') returning id into c_id;
  insert into public.chapter (course_id, number, title) values (c_id, 1, 'One') returning id into ch1;
  insert into public.chapter (course_id, number, title) values (c_id, 2, 'Two') returning id into ch2;
  insert into public.exam (course_id, name, mcq_seconds) values (c_id, 'P4 Exam', 600) returning id into ex;
  insert into public.exam (course_id, name, mcq_seconds) values (c_id, 'P4 Untimed', 0) returning id into ex_untimed;
  insert into public.exam (course_id, name, mcq_seconds) values (c_id, 'P4 CQ Only', 600) returning id into ex_cq;

  -- Questions: 5 MCQs in chapter 1 (one with a source page), 3 in chapter 2, one CQ and one draft MCQ.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1..5 loop
    qid := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'mcq', 'text', 'MCQ one ' || i, 'marks', 1, 'status', 'approved', 'source_page', 12), opts);
    qs := qs || qid;
  end loop;
  for i in 1..3 loop
    qid := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch2, 'kind', 'mcq', 'text', 'MCQ two ' || i, 'marks', 2, 'status', 'approved'), opts);
    qs := qs || qid;
  end loop;
  q_cq := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'A CQ', 'marks', 5, 'status', 'approved'), '[]');
  q_draft := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'mcq', 'text', 'A draft MCQ', 'marks', 1, 'status', 'draft'), opts);
  reset role;

  insert into public.question_set (exam_id, name, origin) values (ex, 'Set 1', 'curated') returning id into set_id;
  insert into public.question_set_item (set_id, question_id, position)
    select set_id, qs[i], i - 1 from generate_subscripts(qs, 1) as i;
  insert into public.question_set_item (set_id, question_id, position) values (set_id, q_cq, 8), (set_id, q_draft, 9);
  insert into public.question_set (exam_id, name, origin) values (ex_untimed, 'Set 1', 'curated') returning id into set_untimed;
  insert into public.question_set_item (set_id, question_id, position) values (set_untimed, qs[1], 0);
  insert into public.question_set (exam_id, name, origin) values (ex_cq, 'Set 1', 'curated') returning id into set_cq;
  insert into public.question_set_item (set_id, question_id, position) values (set_cq, q_cq, 0);

  -- Starting a session: approved MCQs only, in set order, the exam's countdown.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  sess := public.start_mcq_session(set_id);
  select count(*) into n from public.attempt where session_run_id = sess;
  assert n = 8, format('session has the 8 approved MCQs (no CQ, no draft), saw %s', n);
  select count(*) into n from public.attempt a where a.session_run_id = sess and a.question_id in (q_cq, q_draft);
  assert n = 0, 'CQs and drafts never enter an MCQ session';
  select count(*) into n from public.session_run where id = sess and mcq_deadline_at between now() + interval '590 seconds' and now() + interval '610 seconds';
  assert n = 1, 'the countdown is the exam''s 600 seconds';
  select array_length(chapter_ids, 1) into n from public.session_run where id = sess;
  assert n = 2, 'the session records both chapters';

  sess2 := public.start_mcq_session(set_id, array[ch2]);
  select count(*) into n from public.attempt where session_run_id = sess2;
  assert n = 3, format('narrowing to chapter 2 gives 3 questions, saw %s', n);
  sess3 := public.start_mcq_session(set_untimed);
  select count(*) into n from public.session_run where id = sess3 and mcq_deadline_at is null;
  assert n = 1, 'mcq_seconds = 0 means no timer';
  res := public.get_session(sess3);
  assert (res -> 'session' -> 'seconds_left') = 'null'::jsonb and (res -> 'session' ->> 'timed')::boolean = false, 'untimed session reports no seconds left';

  denied := false;
  begin perform public.start_mcq_session(set_cq); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a set with no MCQs cannot start an MCQ session';
  denied := false;
  begin perform public.start_mcq_session(gen_random_uuid()); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'unknown set';
  select count(*) into n from public.session_run where user_id = s1;
  assert n = 3, 'a failed start leaves no empty session behind';
  reset role;

  -- The answer key stays hidden while a question is open.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  payload := public.get_session(sess);
  assert jsonb_array_length(payload -> 'questions') = 8, 'get_session lists 8 questions';
  assert (payload -> 'session' ->> 'finished')::boolean = false, 'session is open';
  assert (payload -> 'session' ->> 'seconds_left')::numeric between 580 and 600, 'seconds left is about 600';
  for qj in select * from jsonb_array_elements(payload -> 'questions') loop
    assert qj -> 'correct_option_id' = 'null'::jsonb, 'open question must not reveal the correct option';
    assert qj -> 'explanation_correct' = 'null'::jsonb, 'open question must not reveal explanations';
    assert qj -> 'source_page' = 'null'::jsonb, 'open question must not reveal the source page';
    assert jsonb_array_length(qj -> 'options') = 4, 'four options';
    assert (qj -> 'options' -> 0 -> 'is_correct') is null, 'options carry no is_correct flag';
  end loop;
  assert (payload -> 'questions' -> 0 ->> 'text') = 'MCQ one 1', 'questions keep the set order';
  select count(*) into n from public.mcq_option;
  assert n = 0, 'a student still cannot read mcq_option directly';
  reset role;

  -- Answering: correct, wrong, final, validated.
  select o.id into correct_id from public.mcq_option o where o.question_id = qs[1] and o.is_correct;
  select o.id into wrong_id from public.mcq_option o where o.question_id = qs[2] and o.label = 'B';
  select o.id into other_opt from public.mcq_option o where o.question_id = qs[3] and o.label = 'A';
  first_key := correct_id;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.answer_mcq(sess, qs[1], correct_id);
  assert res ->> 'status' = 'ok' and (res ->> 'is_correct')::boolean, 'correct pick is marked correct';
  assert (res ->> 'correct_option_id')::uuid = correct_id and res ->> 'explanation_correct' = 'Because one', 'verdict reveals the correct option and its explanation';
  assert (res ->> 'source_page')::integer = 12, 'verdict reveals the source page';
  assert (res ->> 'answered')::integer = 1 and (res ->> 'total')::integer = 8 and not (res ->> 'finished')::boolean, 'progress counts';
  res := public.answer_mcq(sess, qs[2], wrong_id);
  assert not (res ->> 'is_correct')::boolean, 'wrong pick is marked wrong';
  assert res ->> 'explanation_selected' = 'Two is wrong' and res ->> 'explanation_correct' = 'Because one', 'a wrong pick returns both explanations';
  assert (res ->> 'correct_option_id')::uuid <> wrong_id, 'the correct option differs from the wrong pick';

  denied := false;
  begin perform public.answer_mcq(sess, qs[1], correct_id); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a question cannot be answered twice';
  denied := false;
  begin perform public.answer_mcq(sess, qs[4], other_opt); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'an option of another question is rejected';
  denied := false;
  begin perform public.answer_mcq(sess, q_cq, correct_id); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a question outside the session is rejected';
  select a.score into n from public.attempt a where a.session_run_id = sess and a.question_id = qs[2];
  assert n = 0, 'wrong answer scores 0';
  select a.score into n from public.attempt a where a.session_run_id = sess and a.question_id = qs[1];
  assert n = 1, 'right answer scores its marks';
  select count(*) into n from public.attempt a where a.session_run_id = sess and a.seconds_spent is not null and a.answered_at is not null;
  assert n = 2, 'seconds spent are measured by the server';

  payload := public.get_session(sess);
  select q into qj from jsonb_array_elements(payload -> 'questions') q where q ->> 'id' = qs[1]::text;
  assert qj ->> 'correct_option_id' = correct_id::text and (qj ->> 'revealed')::boolean, 'an answered question is revealed';
  select q into qj from jsonb_array_elements(payload -> 'questions') q where q ->> 'id' = qs[3]::text;
  assert qj -> 'correct_option_id' = 'null'::jsonb, 'an unanswered question stays hidden';
  reset role;

  -- Other people cannot see or touch this session.
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.session_run;
  assert n = 0, 'another student sees no sessions';
  select count(*) into n from public.attempt;
  assert n = 0, 'another student sees no attempts';
  denied := false;
  begin perform public.get_session(sess); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'another student cannot load my session';
  denied := false;
  begin perform public.answer_mcq(sess, qs[3], other_opt); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'another student cannot answer in my session';
  denied := false;
  begin perform public.finish_mcq_session(sess); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'another student cannot finish my session';
  denied := false;
  begin insert into public.session_run (user_id, exam_id) values (s2, ex); exception when insufficient_privilege then denied := true; end;
  assert denied, 'students cannot insert sessions directly';
  denied := false;
  begin update public.attempt set score = 99; exception when insufficient_privilege then denied := true; end;
  assert denied, 'students cannot edit attempts directly';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.session_run;
  assert n = 0, 'even the admin does not read student sessions';
  select count(*) into n from public.attempt;
  assert n = 0, 'even the admin does not read student attempts';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.start_mcq_session(set_id); exception when insufficient_privilege then denied := true; end;
  assert denied, 'a pending account cannot start a session';
  reset role;
  set local role anon;
  denied := false;
  begin perform public.start_mcq_session(set_id); exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon cannot start a session';
  denied := false;
  begin perform public.get_session(sess); exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon cannot load a session';
  reset role;

  -- Finishing early: unanswered count as missed, everything is revealed, the score is added up.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.finish_mcq_session(sess);
  assert res ->> 'status' = 'ok', 'finish works';
  res := public.finish_mcq_session(sess);
  assert res ->> 'status' = 'ok', 'finish is safe to repeat';
  select score into n from public.session_run where id = sess;
  assert n = 1, format('score is 1 (one right answer), saw %s', n);
  select max_score into n from public.session_run where id = sess;
  assert n = 11, format('max score is 5 x 1 + 3 x 2 = 11, saw %s', n);
  select timed_out::text into st from public.session_run where id = sess;
  assert st = 'false', 'a manual finish is not a timeout';
  payload := public.get_session(sess);
  assert (payload -> 'session' ->> 'finished')::boolean, 'session reports finished';
  for qj in select * from jsonb_array_elements(payload -> 'questions') loop
    assert qj -> 'correct_option_id' <> 'null'::jsonb, 'a finished session reveals every answer';
  end loop;
  res := public.answer_mcq(sess, qs[3], other_opt);
  assert res ->> 'status' = 'finished', 'no answers after the session ended';
  select count(*) into n from public.attempt where session_run_id = sess and answered_at is null;
  assert n = 6, 'the six unanswered stay unanswered (missed)';
  reset role;

  -- Retry the missed ones only: 1 wrong (qs[2]) + 6 unanswered = 7.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  retry := public.start_mcq_session(set_id, null, sess);
  select count(*) into n from public.attempt where session_run_id = retry;
  assert n = 7, format('retry keeps the 7 missed questions, saw %s', n);
  select count(*) into n from public.attempt where session_run_id = retry and question_id = qs[1];
  assert n = 0, 'a question answered right is not retried';
  denied := false;
  begin perform public.start_mcq_session(set_id, null, sess2); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'cannot retry a session that is still open';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.start_mcq_session(set_id, null, sess); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'cannot retry another student''s session';
  reset role;

  -- Answering everything closes the session by itself.
  select array_agg(o.id order by q.position) into key_ids
    from public.mcq_option o join public.attempt q on q.question_id = o.question_id and q.session_run_id = sess2
    where o.is_correct;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1..3 loop
    res := public.answer_mcq(sess2, qs[5 + i], key_ids[i]);
  end loop;
  assert (res ->> 'finished')::boolean, 'the last answer closes the session';
  select score into n from public.session_run where id = sess2;
  assert n = 6, format('three correct chapter 2 answers of 2 marks = 6, saw %s', n);
  reset role;

  -- Timer: past the deadline the session closes, late answers are refused, unanswered count as missed.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  sess := public.start_mcq_session(set_id);
  sess3 := public.start_mcq_session(set_id);
  reset role;
  update public.session_run set mcq_deadline_at = now() - interval '10 seconds' where id in (sess, sess3);
  set local role authenticated;
  payload := public.get_session(sess);
  assert (payload -> 'session' ->> 'finished')::boolean and (payload -> 'session' ->> 'timed_out')::boolean, 'an expired session closes as timed out';
  select count(*) into n from public.session_run where id = sess and score = 0 and max_score = 11 and finished_at is not null;
  assert n = 1, 'timed out with nothing answered scores 0 of 11';
  res := public.answer_mcq(sess3, qs[1], first_key);
  assert res ->> 'status' = 'time_up', 'a late answer is refused';
  select count(*) into n from public.session_run where id = sess3 and finished_at is not null and timed_out;
  assert n = 1, 'the late answer closed the session as timed out';
  select count(*) into n from public.attempt where session_run_id = sess3 and answered_at is not null;
  assert n = 0, 'the late answer was not stored';
  reset role;
  -- Inside the 3 second grace an answer still counts.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  sess := public.start_mcq_session(set_id);
  reset role;
  update public.session_run set mcq_deadline_at = now() - interval '1 second' where id = sess;
  set local role authenticated;
  res := public.answer_mcq(sess, qs[1], first_key);
  assert res ->> 'status' = 'ok', 'an answer within the grace period counts';
  reset role;

  -- Reports: a student flags a visible question, once, as themself. The admin reads all, students only their own.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.question_report (question_id, user_id, note) values (qs[1], s1, 'Answer looks wrong');
  denied := false;
  begin insert into public.question_report (question_id, user_id) values (qs[1], s1); exception when unique_violation then denied := true; end;
  assert denied, 'one report per student per question';
  denied := false;
  begin insert into public.question_report (question_id, user_id) values (qs[2], s2); exception when insufficient_privilege then denied := true; end;
  assert denied, 'a student cannot report in someone else''s name';
  denied := false;
  begin insert into public.question_report (question_id, user_id) values (q_draft, s1); exception when insufficient_privilege then denied := true; end;
  assert denied, 'a student cannot report a draft question they cannot see';
  denied := false;
  begin insert into public.question_report (question_id, user_id, note) values (qs[3], s1, repeat('x', 501)); exception when check_violation then denied := true; end;
  assert denied, 'a report note is at most 500 characters';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.question_report;
  assert n = 0, 'another student does not see the report';
  delete from public.question_report;
  get diagnostics n = row_count;
  assert n = 0, 'a student cannot delete reports';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.question_report where question_id = qs[1];
  assert n = 1, 'the admin reads the report';
  delete from public.question_report where question_id = qs[1];
  get diagnostics n = row_count;
  assert n = 1, 'the admin clears a report';
  reset role;
  set local role anon;
  denied := false;
  begin perform 1 from public.session_run limit 1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon must not read sessions';
  reset role;

  -- Deleting a question removes it from attempts without breaking the session.
  delete from public.question where id = qs[8];
  select count(*) into n from public.attempt where question_id = qs[8];
  assert n = 0, 'deleting a question removes its attempts';
end;
$$;

select 'ALL PHASE 4 TESTS PASSED' as result;

rollback;
