-- Phase 6 tests: photo answers, reading jobs, the daily cap, privacy.
-- Run in the Supabase SQL editor (or the MCP execute_sql). Everything rolls back, no data remains.
-- Success: the last statement returns "ALL PHASE 6 TESTS PASSED". A failure raises an exception naming the check.

begin;

do $$
declare
  s1 uuid := '00000000-0000-0000-0000-0000000000c1';
  s2 uuid := '00000000-0000-0000-0000-0000000000c2';
  admin_id uuid := '00000000-0000-0000-0000-0000000000c0';
  c_id uuid; ch1 uuid; ex uuid; set_id uuid;
  q1 uuid; q2 uuid; q3 uuid;
  sess uuid; sess_other uuid;
  att1 uuid; att2 uuid; att3 uuid;
  n integer; denied boolean;
  res jsonb; pay jsonb; qj jsonb;
  tjob uuid; tjob2 uuid;
  paths text[]; removed text; ok boolean;
  f1 text := '11111111-1111-4111-8111-111111111111.jpg';
  f2 text := '22222222-2222-4222-8222-222222222222.jpg';
  f3 text := '33333333-3333-4333-8333-333333333333.jpg';
  f4 text := '44444444-4444-4444-8444-444444444444.jpg';
  f5 text := '55555555-5555-4555-8555-555555555555.jpg';
begin
  insert into auth.users (id, email) values (admin_id, 'p6admin@test.local'), (s1, 'p6s1@test.local'), (s2, 'p6s2@test.local');
  insert into public.profile (id, name, email, role, status, daily_cap) values
    (admin_id, 'Admin', 'p6admin@test.local', 'admin', 'active', 10),
    (s1, 'S1', 'p6s1@test.local', 'student', 'active', 2),
    (s2, 'S2', 'p6s2@test.local', 'student', 'active', 5);

  insert into public.course (name) values ('P6 Test Course') returning id into c_id;
  insert into public.chapter (course_id, number, title) values (c_id, 1, 'One') returning id into ch1;
  insert into public.exam (course_id, name) values (c_id, 'P6 Exam') returning id into ex;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  q1 := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'Explain sourcing.', 'marks', 5, 'status', 'approved'), '[]');
  q2 := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'Discuss procurement.', 'marks', 5, 'status', 'approved'), '[]');
  q3 := public.save_question(jsonb_build_object('course_id', c_id, 'chapter_id', ch1, 'kind', 'cq', 'text', 'Compare buying methods.', 'marks', 3, 'status', 'approved'), '[]');
  reset role;
  insert into public.question_set (exam_id, name, origin) values (ex, 'Set 1', 'curated') returning id into set_id;
  insert into public.question_set_item (set_id, question_id, position) values (set_id, q1, 0), (set_id, q2, 1), (set_id, q3, 2);

  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  sess := public.start_cq_session(set_id);
  select a.id into att1 from public.attempt a where a.session_run_id = sess and a.question_id = q1;
  select a.id into att2 from public.attempt a where a.session_run_id = sess and a.question_id = q2;
  select a.id into att3 from public.attempt a where a.session_run_id = sess and a.question_id = q3;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  sess_other := public.start_cq_session(set_id);
  reset role;

  -- The photos exist in storage first (the server uploads, then registers).
  insert into storage.objects (bucket_id, name, owner_id)
  select 'answer-photos', s1 || '/' || att1 || '/' || f, s1::text
  from unnest(array[f1, f2, f3, f4, f5]) as f;

  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Starting a reading with no photos is refused.
  denied := false;
  begin perform public.start_cq_transcription(sess, q1); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'no photos, no reading';

  -- Registering photos: right folder, right shape, real object, at most 4.
  denied := false;
  begin perform public.add_cq_photo(sess, q1, s2 || '/' || att1 || '/' || f1); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a path in someone else''s folder is refused';
  denied := false;
  begin perform public.add_cq_photo(sess, q1, s1 || '/' || att2 || '/' || f1); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a path for another attempt is refused';
  denied := false;
  begin perform public.add_cq_photo(sess, q1, s1 || '/' || att1 || '/../' || f1); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a path with dots is refused';
  denied := false;
  begin perform public.add_cq_photo(sess, q1, s1 || '/' || att1 || '/66666666-6666-4666-8666-666666666666.jpg'); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a photo that is not in storage is refused';

  res := public.add_cq_photo(sess, q1, s1 || '/' || att1 || '/' || f1);
  assert (res ->> 'count')::integer = 1, 'first photo registered';
  perform public.add_cq_photo(sess, q1, s1 || '/' || att1 || '/' || f2);
  perform public.add_cq_photo(sess, q1, s1 || '/' || att1 || '/' || f3);
  perform public.add_cq_photo(sess, q1, s1 || '/' || att1 || '/' || f4);
  denied := false;
  begin perform public.add_cq_photo(sess, q1, s1 || '/' || att1 || '/' || f5); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a fifth photo is refused';

  pay := public.get_cq_session(sess);
  qj := pay -> 'questions' -> 0;
  assert jsonb_array_length(qj -> 'photos') = 4 and qj -> 'photos' ->> 0 = f1, 'the session lists the photo file names in order';
  assert pay::text not like '%' || s1::text || '/%', 'storage paths never reach the browser';

  -- Remove one, add it back.
  removed := public.remove_cq_photo(sess, q1, f4);
  assert removed = s1 || '/' || att1 || '/' || f4, 'remove returns the path to delete';
  denied := false;
  begin perform public.remove_cq_photo(sess, q1, f4); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'removing a photo twice is refused';

  -- Reading: queued at student priority, counted once against the cap.
  res := public.start_cq_transcription(sess, q1);
  tjob := (res ->> 'job_id')::uuid;
  assert (res ->> 'cap_used')::integer = 1, 'a reading uses one grading';
  reset role;
  select count(*) into n from public.job j where j.id = tjob and j.kind = 'transcribe' and j.status = 'queued' and j.priority = 10 and j.user_id = s1 and j.payload ->> 'attempt_id' = att1::text;
  assert n = 1, 'a transcribe job is queued for this attempt';

  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.start_cq_transcription(sess, q1); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a second reading cannot start while one is in place';
  denied := false;
  begin perform public.add_cq_photo(sess, q1, s1 || '/' || att1 || '/' || f4); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'photos are locked once the reading started';
  denied := false;
  begin perform public.submit_cq_answer(sess, q1, 'Typed over a reading still in progress.', 5); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'an answer cannot be submitted while the reading is still running';

  -- A student cannot write the reading.
  denied := false;
  begin perform public.record_cq_transcription(att1, tjob, 'forged', '[]'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'a student cannot call record_cq_transcription';
  denied := false;
  begin update public.attempt set transcription = 'forged' where id = att1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'a student cannot write the transcription';
  reset role;

  -- The server saves the reading. A stale job is ignored.
  set local role service_role;
  ok := public.record_cq_transcription(att1, gen_random_uuid(), 'old text', '[]');
  assert not ok, 'a reading from another job is ignored';
  ok := public.record_cq_transcription(att1, tjob, 'Sourcing is picking suppliers and the cost.', '[{"text":"picking","reason":"smudged"}]');
  assert ok, 'the reading is saved';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  pay := public.get_cq_session(sess);
  qj := pay -> 'questions' -> 0;
  assert qj ->> 'transcription' = 'Sourcing is picking suppliers and the cost.' and qj -> 'unsure' -> 0 ->> 'text' = 'picking', 'the reading comes back with its unsure parts';

  -- Submitting the corrected text: marked as a photo answer, no second grading used.
  res := public.submit_cq_answer(sess, q1, 'Sourcing is choosing suppliers and the cost.', 120);
  assert (res ->> 'cap_used')::integer = 1, 'marking a read answer uses no extra grading';
  reset role;
  select count(*) into n from public.attempt where id = att1 and answer_source = 'photo' and answer_text like 'Sourcing is choosing%';
  assert n = 1, 'the answer is stored as a photo answer with the corrected text';

  -- Cap of 2: one typed answer fits, then the cap blocks both a typed answer and a new reading.
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.submit_cq_answer(sess, q2, 'Procurement is buying things.', 20);
  assert (res ->> 'cap_used')::integer = 2, 'a typed answer uses the second grading';
  reset role;

  insert into storage.objects (bucket_id, name, owner_id) values ('answer-photos', s1 || '/' || att3 || '/' || f1, s1::text);
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.add_cq_photo(sess, q3, s1 || '/' || att3 || '/' || f1);
  denied := false;
  begin perform public.start_cq_transcription(sess, q3); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'the daily cap stops a new reading';
  reset role;

  -- Raise the cap: a reading works, start over resets it, readings per answer are limited to 3.
  update public.profile set daily_cap = 10 where id = s1;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.start_cq_transcription(sess, q3);
  tjob2 := (res ->> 'job_id')::uuid;
  paths := public.reset_cq_photos(sess, q3);
  assert cardinality(paths) = 1 and paths[1] = s1 || '/' || att3 || '/' || f1, 'start over returns the photo paths';
  select count(*) into n from public.attempt where id = att3 and cardinality(photo_paths) = 0 and transcribe_job_id is null and transcription is null;
  assert n = 1, 'start over clears the photos and the reading';
  reset role;

  set local role service_role;
  ok := public.record_cq_transcription(att3, tjob2, 'late text', '[]');
  assert not ok, 'a reading that finishes after starting over is ignored';
  reset role;

  for n in 1..2 loop
    insert into storage.objects (bucket_id, name, owner_id) values ('answer-photos', s1 || '/' || att3 || '/' || f2, s1::text) on conflict do nothing;
    perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.add_cq_photo(sess, q3, s1 || '/' || att3 || '/' || f2);
    perform public.start_cq_transcription(sess, q3);
    perform public.reset_cq_photos(sess, q3);
    reset role;
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.add_cq_photo(sess, q3, s1 || '/' || att3 || '/' || f2);
  denied := false;
  begin perform public.start_cq_transcription(sess, q3); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'a fourth reading for one answer is refused';
  reset role;

  -- Privacy: another student cannot touch these photos or readings.
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  denied := false;
  begin perform public.add_cq_photo(sess, q1, s1 || '/' || att1 || '/' || f1); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'another student cannot add photos to this session';
  denied := false;
  begin perform public.start_cq_transcription(sess, q3); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'another student cannot start a reading here';
  select count(*) into n from public.attempt where cardinality(photo_paths) > 0;
  assert n = 0, 'another student sees none of the photo rows';
  select count(*) into n from storage.objects where bucket_id = 'answer-photos';
  assert n = 0, 'another student sees none of the photo files';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'answer-photos';
  assert n >= 5, 'the owner sees their own photo files';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'answer-photos';
  assert n = 0, 'the admin does not see answer photos';
  reset role;
end;
$$;

select 'ALL PHASE 6 TESTS PASSED' as result;

rollback;
