-- Phase 3 tests: question bank RLS, save_question, create_auto_set, the router's claim_next_job, sets, jobs, slots.
-- Run in the Supabase SQL editor (or the MCP execute_sql). Everything rolls back, no data remains.
-- It builds its own course, chapters and exam, so real questions in the project do not change the counts.
-- Success: the last statement returns "ALL PHASE 3 TESTS PASSED". A failure raises an exception naming the check.

begin;

do $$
declare
  admin_id uuid := '00000000-0000-0000-0000-0000000000a2';
  s1 uuid := '00000000-0000-0000-0000-0000000000b3';
  s2 uuid := '00000000-0000-0000-0000-0000000000b4';
  p1 uuid := '00000000-0000-0000-0000-0000000000c2';
  c_id uuid; c2_id uuid; ch1 uuid; ch2 uuid; ch_other uuid; ch_empty uuid;
  ex uuid; ex_empty uuid; ex_short uuid;
  qid uuid; sid uuid; sid2 uuid;
  n integer; denied boolean;
  claim jsonb; j1 uuid; j2 uuid; j3 uuid; slot_a uuid; slot_b uuid;
  opts jsonb := '[{"label":"A","text":"One","is_correct":true,"explanation":"Right"},
                  {"label":"B","text":"Two","is_correct":false,"explanation":"No"},
                  {"label":"C","text":"Three","is_correct":false,"explanation":"No"},
                  {"label":"D","text":"Four","is_correct":false,"explanation":"No"}]';
  st text;
begin
  insert into auth.users (id, email) values
    (admin_id, 'p3admin@test.local'), (s1, 'p3s1@test.local'), (s2, 'p3s2@test.local'), (p1, 'p3p@test.local');
  insert into public.profile (id, name, email, role, status) values
    (admin_id, 'Admin', 'p3admin@test.local', 'admin', 'active'),
    (s1, 'S1', 'p3s1@test.local', 'student', 'active'),
    (s2, 'S2', 'p3s2@test.local', 'student', 'active'),
    (p1, 'Pending', 'p3p@test.local', 'student', 'pending');

  insert into public.course (name) values ('P3 Test Course') returning id into c_id;
  insert into public.course (name) values ('P3 Other Course') returning id into c2_id;
  insert into public.chapter (course_id, number, title) values (c_id, 1, 'One') returning id into ch1;
  insert into public.chapter (course_id, number, title) values (c_id, 2, 'Two') returning id into ch2;
  insert into public.chapter (course_id, number, title) values (c_id, 3, 'Empty') returning id into ch_empty;
  insert into public.chapter (course_id, number, title) values (c2_id, 1, 'Other') returning id into ch_other;
  insert into public.exam (course_id, name) values (c_id, 'P3 Exam') returning id into ex;
  insert into public.exam (course_id, name) values (c_id, 'P3 Empty Exam') returning id into ex_empty;
  insert into public.exam (course_id, name) values (c_id, 'P3 Short Exam') returning id into ex_short;
  update public.exam_set_settings set mcq_count = 4, cq_count = 2 where exam_id = ex;
  update public.exam_set_settings set mcq_count = 5, cq_count = 0 where exam_id = ex_short;
  insert into public.exam_chapter (exam_id, chapter_id) values (ex, ch1), (ex, ch2), (ex_empty, ch_empty), (ex_short, ch_empty);

  -- Admin writes questions through save_question.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1..6 loop
    perform public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'mcq', 'text', 'MCQ one ' || i, 'marks', 1, 'status', 'approved'), opts);
    perform public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch2, 'kind', 'mcq', 'text', 'MCQ two ' || i, 'marks', 1, 'status', 'approved'), opts);
  end loop;
  for i in 1..2 loop
    perform public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'CQ one ' || i, 'marks', 5, 'status', 'approved', 'answer_notes', 'a point'), '[]');
    perform public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch2, 'kind', 'cq', 'text', 'CQ two ' || i, 'marks', 5, 'status', 'approved'), '[]');
  end loop;
  qid := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'mcq', 'text', 'A draft question', 'marks', 1, 'status', 'draft'), opts);
  select count(*) into n from public.question where course_id = c_id and status = 'approved';
  assert n = 16, format('admin saved 16 approved questions, saw %s', n);
  select count(*) into n from public.mcq_option o join public.question q on q.id = o.question_id where q.id = qid;
  assert n = 4, 'options saved with the question';

  -- Approving needs four options and exactly one correct.
  denied := false;
  begin
    perform public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'mcq', 'text', 'Broken MCQ', 'marks', 1, 'status', 'approved'),
      '[{"label":"A","text":"x","is_correct":true},{"label":"B","text":"y","is_correct":false},{"label":"C","text":"z","is_correct":false}]');
  exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'MCQ with three options cannot be approved';
  denied := false;
  begin
    perform public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'mcq', 'text', 'Two correct', 'marks', 1, 'status', 'draft'),
      '[{"label":"A","text":"x","is_correct":true},{"label":"B","text":"y","is_correct":true},{"label":"C","text":"z"},{"label":"D","text":"w"}]');
  exception when unique_violation then denied := true; end;
  assert denied, 'two correct options are rejected';
  -- Editing replaces the options and keeps the question approved when still valid.
  perform public.save_question(jsonb_build_object('id', qid, 'course_id', c_id, 'chapter_id', ch1, 'kind', 'mcq', 'text', 'A draft question, edited', 'marks', 2, 'status', 'approved'), opts);
  select status::text into st from public.question where id = qid;
  assert st = 'approved', 'edit with approve moves the draft to approved';
  perform public.save_question(jsonb_build_object('id', qid, 'course_id', c_id, 'chapter_id', ch1, 'kind', 'mcq', 'text', 'A draft question, edited', 'marks', 2, 'status', 'draft'), opts);
  select count(*) into n from public.mcq_option where question_id = qid;
  assert n = 4, 'options replaced, not duplicated';
  select count(*) into n from public.question where course_id = c_id;
  assert n = 17, format('admin sees all 17 questions, saw %s', n);
  select count(*) into n from public.mcq_option o join public.question q on q.id = o.question_id where q.course_id = c_id;
  assert n = 52, format('admin reads all 13 MCQs x 4 options, saw %s', n);
  reset role;

  -- A question cannot point at a chapter of another course.
  denied := false;
  begin
    insert into public.question (course_id, chapter_id, kind, text) values (c_id, ch_other, 'cq', 'Wrong course');
  exception when foreign_key_violation then denied := true; end;
  assert denied, 'question chapter must belong to its course';

  -- Student: approved questions only, no option keys, no writes.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.question where course_id = c_id;
  assert n = 16, format('student sees the 16 approved questions only, saw %s', n);
  select count(*) into n from public.mcq_option;
  assert n = 0, 'student must not read mcq_option (answer key)';
  denied := false;
  begin insert into public.question (course_id, chapter_id, kind, text) values (c_id, ch1, 'cq', 'Student question'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'student must not insert questions';
  denied := false;
  begin perform public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'Student via function', 'marks', 1), '[]'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'student must not save questions through save_question';
  update public.question set status = 'draft' where course_id = c_id;
  get diagnostics n = row_count;
  assert n = 0, 'student must not update questions';
  delete from public.question where course_id = c_id;
  get diagnostics n = row_count;
  assert n = 0, 'student must not delete questions';
  denied := false;
  begin perform public.create_auto_set(ex, s1); exception when insufficient_privilege then denied := true; end;
  assert denied, 'create_auto_set is not callable from the browser';
  denied := false;
  begin perform public.claim_next_job(); exception when insufficient_privilege then denied := true; end;
  assert denied, 'claim_next_job is not callable from the browser';
  reset role;

  -- Pending user and anon see nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.question;
  assert n = 0, 'pending user must not read questions';
  reset role;
  set local role anon;
  denied := false;
  begin perform 1 from public.question limit 1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon must not read questions';
  reset role;

  -- Random sets (service role): spread over chapters, approved only, MCQs first, numbered Set 1, Set 2.
  set local role service_role;
  sid := public.create_auto_set(ex, admin_id);
  sid2 := public.create_auto_set(ex, s1);
  reset role;
  select name into st from public.question_set where id = sid;
  assert st = 'Set 1', 'first auto set is Set 1';
  select name into st from public.question_set where id = sid2;
  assert st = 'Set 2', 'second auto set is Set 2';
  select count(*) into n from public.question_set_item where set_id = sid;
  assert n = 6, format('set has 4 MCQ + 2 CQ, saw %s items', n);
  select count(*) into n from public.question_set_item i join public.question q on q.id = i.question_id where i.set_id = sid and q.kind = 'mcq' and q.chapter_id = ch1;
  assert n = 2, 'two MCQs from chapter 1 (round robin)';
  select count(*) into n from public.question_set_item i join public.question q on q.id = i.question_id where i.set_id = sid and q.kind = 'mcq' and q.chapter_id = ch2;
  assert n = 2, 'two MCQs from chapter 2 (round robin)';
  select count(*) into n from public.question_set_item i join public.question q on q.id = i.question_id where i.set_id = sid and q.kind = 'cq' and q.chapter_id = ch1;
  assert n = 1, 'one CQ from chapter 1';
  select count(*) into n from public.question_set_item i join public.question q on q.id = i.question_id where i.set_id = sid and q.status <> 'approved';
  assert n = 0, 'drafts never enter a set';
  select count(distinct position) into n from public.question_set_item where set_id = sid;
  assert n = 6 and (select max(position) from public.question_set_item where set_id = sid) = 5 and (select min(position) from public.question_set_item where set_id = sid) = 0, 'positions are 0 to 5';
  select count(*) into n from public.question_set_item i join public.question q on q.id = i.question_id where i.set_id = sid and q.kind = 'cq' and i.position < 4;
  assert n = 0, 'CQs come after the MCQs';
  select count(*) into n from public.question_set where id in (sid, sid2) and created_by in (admin_id, s1);
  assert n = 2, 'created_by is recorded';

  set local role service_role;
  denied := false;
  begin perform public.create_auto_set(ex_empty, admin_id); exception when sqlstate 'P0001' then denied := true; end;
  reset role;
  assert denied, 'an exam with no approved questions cannot get a set';
  select count(*) into n from public.question_set where exam_id = ex_empty;
  assert n = 0, 'no empty set is left behind';
  -- Fewer questions than the target: the set is simply smaller.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch_empty, 'kind', 'mcq', 'text', 'Only MCQ A', 'marks', 1, 'status', 'approved'), opts);
  perform public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch_empty, 'kind', 'mcq', 'text', 'Only MCQ B', 'marks', 1, 'status', 'approved'), opts);
  reset role;
  set local role service_role;
  sid := public.create_auto_set(ex_short, admin_id);
  reset role;
  select count(*) into n from public.question_set_item where set_id = sid;
  assert n = 2, 'short pool gives a smaller set';

  -- Chapter sets: questions from that chapter only, named and numbered per chapter, whole-exam numbering untouched.
  set local role service_role;
  sid := public.create_auto_set(ex, admin_id, ch1);
  sid2 := public.create_auto_set(ex, admin_id, ch1);
  reset role;
  select count(*) into n from public.question_set_item i join public.question q on q.id = i.question_id where i.set_id = sid and q.chapter_id <> ch1;
  assert n = 0, 'a chapter set holds only that chapter';
  select count(*) into n from public.question_set_item where set_id = sid;
  assert n > 0, 'a chapter set is not empty';
  select count(*) into n from public.question_set where id = sid and chapter_id = ch1 and name ~ '^Ch [0-9]+ Set 1$';
  assert n = 1, 'first chapter set is Ch N Set 1';
  select count(*) into n from public.question_set where id = sid2 and name ~ '^Ch [0-9]+ Set 2$';
  assert n = 1, 'second chapter set is Ch N Set 2';
  set local role service_role;
  sid := public.create_auto_set(ex, admin_id);
  denied := false;
  begin perform public.create_auto_set(ex, admin_id, ch_other); exception when sqlstate 'P0001' then denied := true; end;
  reset role;
  assert denied, 'a chapter outside the exam cannot get a set';
  select name into st from public.question_set where id = sid;
  assert st = 'Set 3', 'whole-exam numbering ignores chapter sets';
  delete from public.question_set where exam_id = ex and name <> 'Set 1' and name <> 'Set 2';

  -- Sets: members read, only the admin writes.
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.question_set where exam_id = ex;
  assert n = 2, 'active student reads sets';
  select count(*) into n from public.question_set_item;
  assert n >= 6, 'active student reads set items';
  denied := false;
  begin insert into public.question_set (exam_id, name, origin) values (ex, 'Mine', 'curated'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'student must not create sets';
  delete from public.question_set;
  get diagnostics n = row_count;
  assert n = 0, 'student must not delete sets';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.question_set (exam_id, name, origin, created_by) values (ex, 'Hand set', 'curated', admin_id) returning id into sid;
  select id into qid from public.question where chapter_id = ch1 and status = 'approved' limit 1;
  insert into public.question_set_item (set_id, question_id, position) values (sid, qid, 0);
  update public.question_set set name = 'Hand set 2' where id = sid;
  get diagnostics n = row_count;
  assert n = 1, 'admin renames a set';
  delete from public.question where id = qid;
  select count(*) into n from public.question_set_item where set_id = sid;
  assert n = 0, 'deleting a question removes it from sets';
  reset role;

  -- Slots and jobs. Start from an empty router (rolled back at the end).
  delete from public.job;
  delete from public.api_slot;
  insert into public.api_slot (key_name, tier, model, priority, enabled, pace_seconds) values ('A', 'primary', 'm1', 1, true, 12) returning id into slot_a;
  insert into public.api_slot (key_name, tier, model, priority, enabled, pace_seconds) values ('A', 'backup', 'm2', 2, true, 12) returning id into slot_b;
  insert into public.api_slot (key_name, tier, model, priority, enabled, pace_seconds) values ('B', 'primary', 'm1', 3, false, 12);
  insert into public.job (user_id, kind, priority, created_at) values (s1, 'generate', 100, now() - interval '2 minutes') returning id into j1;
  insert into public.job (user_id, kind, priority, created_at) values (s2, 'grade', 10, now() - interval '1 minute') returning id into j2;
  insert into public.job (user_id, kind, priority, created_at) values (s1, 'generate', 100, now()) returning id into j3;

  set local role service_role;
  claim := public.claim_next_job();
  assert (claim -> 'job' ->> 'id')::uuid = j2, 'the high priority job (grade) goes first';
  assert (claim -> 'slot' ->> 'model') = 'm1', 'best slot first';
  claim := public.claim_next_job();
  assert (claim -> 'job' ->> 'id')::uuid = j1, 'then the oldest background job';
  assert (claim -> 'slot' ->> 'model') = 'm2', 'the paced slot is skipped, the backup takes over';
  claim := public.claim_next_job();
  assert claim is null, 'no ready slot (key B is off): the job waits';
  reset role;
  select status into st from public.job where id = j3;
  assert st = 'queued', 'waiting job stays queued';
  select count(*) into n from public.job where status = 'running' and slot_id is not null;
  assert n = 2, 'claimed jobs are running on their slots';

  -- A resting slot is not used until the cooldown ends.
  update public.api_slot set next_allowed_at = now() - interval '1 second', cooldown_until = now() + interval '60 seconds' where id = slot_a;
  update public.api_slot set enabled = false where id = slot_b;
  set local role service_role;
  claim := public.claim_next_job();
  assert claim is null, 'slot in cooldown is not used';
  reset role;
  update public.api_slot set cooldown_until = now() - interval '1 second' where id = slot_a;
  set local role service_role;
  claim := public.claim_next_job();
  reset role;
  assert (claim -> 'job' ->> 'id')::uuid = j3, 'after the cooldown the slot works again';

  -- Stuck jobs: given back first, failed after three tries.
  update public.job set status = 'running', started_at = now() - interval '7 minutes', attempts = 0 where id = j1;
  update public.job set status = 'running', started_at = now() - interval '7 minutes', attempts = 2 where id = j2;
  update public.api_slot set enabled = false;
  set local role service_role;
  claim := public.claim_next_job();
  reset role;
  select status into st from public.job where id = j1;
  assert st = 'queued', 'stuck job is given back';
  select attempts into n from public.job where id = j1;
  assert n = 1, 'the stuck run counts as an attempt';
  select status into st from public.job where id = j2;
  assert st = 'failed', 'a job stuck for the third time fails';
  select error into st from public.job where id = j2;
  assert st = 'Timed out while running', 'with a reason';

  -- Slots and jobs visibility.
  update public.api_slot set enabled = true;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.api_slot;
  assert n = 0, 'student must not read slots';
  select count(*) into n from public.job;
  assert n = 2, format('student sees only own jobs (2), saw %s', n);
  denied := false;
  begin insert into public.job (user_id, kind) values (s1, 'generate'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'student must not create jobs directly';
  update public.api_slot set enabled = false;
  get diagnostics n = row_count;
  assert n = 0, 'student must not edit slots';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.api_slot;
  assert n = 3, 'admin reads slots';
  select count(*) into n from public.job;
  assert n = 3, 'admin reads all jobs';
  update public.api_slot set enabled = false, pace_seconds = 20 where id = slot_a;
  get diagnostics n = row_count;
  assert n = 1, 'admin switches a slot off and sets its pace';
  denied := false;
  begin update public.api_slot set model = 'hacked' where id = slot_a; exception when insufficient_privilege then denied := true; end;
  assert denied, 'model names come from configuration, not from the browser';
  reset role;
end;
$$;

select 'ALL PHASE 3 TESTS PASSED' as result;

rollback;
