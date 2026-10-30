-- Phase 7 tests: numerical problems practised next to CQs, math answers, problem feedback.
-- Run in the Supabase SQL editor (or the MCP execute_sql). Everything rolls back, no data remains.
-- Success: the last statement returns "ALL PHASE 7 TESTS PASSED". A failure raises an exception naming the check.

begin;

do $t$
declare
  s1 uuid := '00000000-0000-0000-0000-0000000000d1';
  s2 uuid := '00000000-0000-0000-0000-0000000000d2';
  admin_id uuid := '00000000-0000-0000-0000-0000000000d0';
  c_id uuid; ch1 uuid; ch2 uuid; ex uuid; set_id uuid;
  qp uuid; qc uuid; qm uuid; qp2 uuid;
  sess uuid; sess2 uuid;
  attp uuid;
  n integer; denied boolean;
  res jsonb; pay jsonb; qj jsonb;
  math_answer text := E'Since X is normal, $z=\\frac{14-10}{2}=2$.\n$$P(X>14)=1-\\Phi(2)$$\n$$=0.0228$$';
  fb jsonb := jsonb_build_object(
    'kind', 'problem', 'score', 4, 'out_of', 5,
    'steps', jsonb_build_array(jsonb_build_object('row', 2, 'status', 'wrong', 'comment', 'Wrong tail')),
    'first_wrong_row', 2,
    'final_answer', jsonb_build_object('expected', '$0.0228$', 'student', '$0.0228$', 'correct', true, 'units_ok', null, 'note', null),
    'covered_points', jsonb_build_array('Standardises'), 'missing_points', '[]'::jsonb, 'incorrect_claims', '[]'::jsonb,
    'worked_solution', E'$z=2$\n$$P=0.0228$$'
  );
begin
  insert into auth.users (id, email) values (admin_id, 'p7admin@test.local'), (s1, 'p7s1@test.local'), (s2, 'p7s2@test.local');
  insert into public.profile (id, name, email, role, status, daily_cap) values
    (admin_id, 'Admin', 'p7admin@test.local', 'admin', 'active', 10),
    (s1, 'S1', 'p7s1@test.local', 'student', 'active', 5),
    (s2, 'S2', 'p7s2@test.local', 'student', 'active', 5);

  insert into public.course (name) values ('P7 Test Course') returning id into c_id;
  insert into public.chapter (course_id, number, title) values (c_id, 1, 'One') returning id into ch1;
  insert into public.chapter (course_id, number, title) values (c_id, 2, 'Two') returning id into ch2;
  insert into public.exam (course_id, name) values (c_id, 'P7 Exam') returning id into ex;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  qp := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'problem', 'text', 'Find P(X>14) when X is normal with mean 10 and standard deviation 2.', 'marks', 5, 'status', 'approved', 'answer_notes', 'z = 2. Final answer: 0.0228'), '[]');
  qp2 := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch2, 'kind', 'problem', 'text', 'A second problem in chapter two.', 'marks', 4, 'status', 'approved'), '[]');
  qc := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'Explain the normal distribution.', 'marks', 5, 'status', 'approved'), '[]');
  qm := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'mcq', 'text', 'Which one is the mean?', 'marks', 1, 'status', 'draft'),
    '[{"label":"A","text":"a","is_correct":true,"explanation":"x"},{"label":"B","text":"b","is_correct":false,"explanation":"x"},{"label":"C","text":"c","is_correct":false,"explanation":"x"},{"label":"D","text":"d","is_correct":false,"explanation":"x"}]');
  reset role;
  assert (select kind from public.question where id = qp) = 'problem', 'a problem question is saved';

  insert into public.question_set (exam_id, name, origin) values (ex, 'Set 1', 'curated') returning id into set_id;
  insert into public.question_set_item (set_id, question_id, position) values (set_id, qc, 0), (set_id, qp, 1), (set_id, qp2, 2), (set_id, qm, 3);

  -- A CQ session takes CQs and problems, never MCQs.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  sess := public.start_cq_session(set_id);
  select count(*) into n from public.attempt where session_run_id = sess;
  assert n = 3, 'cq and problem questions are in the session, the mcq is not';
  select a.id into attp from public.attempt a where a.session_run_id = sess and a.question_id = qp;

  -- A chapter filter works for problems too.
  sess2 := public.start_cq_session(set_id, array[ch2]);
  select count(*) into n from public.attempt where session_run_id = sess2;
  assert n = 1, 'the chapter filter keeps only the problem of chapter 2';

  -- The screen is told which kind each question is, and never gets the marking scheme.
  pay := public.get_cq_session(sess);
  select x into qj from jsonb_array_elements(pay -> 'questions') x where x ->> 'id' = qp::text;
  assert qj ->> 'kind' = 'problem', 'the payload names the problem kind';
  select x into qj from jsonb_array_elements(pay -> 'questions') x where x ->> 'id' = qc::text;
  assert qj ->> 'kind' = 'cq', 'the payload names the cq kind';
  assert position('answer_notes' in pay::text) = 0 and position('Final answer: 0.0228' in pay::text) = 0, 'the marking scheme never leaves the database';

  -- A math answer is stored exactly as typed (dollar signs and all) and queues one grading job.
  res := public.submit_cq_answer(sess, qp, math_answer, 120);
  assert res ->> 'status' = 'ok' and res ->> 'job_id' is not null, 'a math answer is accepted';
  assert (select answer_text from public.attempt where id = attp) = btrim(math_answer), 'the dollar sign text is stored as it was typed';
  assert (select answer_source from public.attempt where id = attp) = 'typed', 'a typed math answer is a typed answer';
  assert (res ->> 'cap_used')::integer = 1, 'a problem uses one grading, like a cq';
  denied := false;
  begin perform public.submit_cq_answer(sess, qp, math_answer, 1); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'the same problem cannot be answered twice';
  denied := false;
  begin perform public.submit_cq_answer(sess, qc, repeat('$x$ ', 3000), 1); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'an answer over 8000 characters is refused';
  reset role;

  -- The grade job saves problem feedback. A score above the marks is refused.
  denied := false;
  begin perform public.record_cq_grade(attp, 6, fb); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a score above the marks is refused';
  perform public.record_cq_grade(attp, 4, fb);

  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  pay := public.get_cq_session(sess);
  select x into qj from jsonb_array_elements(pay -> 'questions') x where x ->> 'id' = qp::text;
  assert (qj ->> 'graded')::boolean and (qj ->> 'score')::integer = 4, 'the score comes back';
  assert qj -> 'feedback' ->> 'kind' = 'problem' and qj -> 'feedback' ->> 'first_wrong_row' = '2', 'the problem feedback comes back whole';
  reset role;

  -- Privacy: another student sees nothing of this session.
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.get_cq_session(sess); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'another student cannot open this session';
  denied := false;
  begin perform public.submit_cq_answer(sess, qp2, 'My answer here', 1); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'another student cannot answer in this session';
  select count(*) into n from public.attempt;
  assert n = 0, 'another student sees none of the attempts';
  reset role;
end;
$t$;

select 'ALL PHASE 7 TESTS PASSED' as result;

rollback;
