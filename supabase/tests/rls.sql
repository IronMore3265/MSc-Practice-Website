-- RLS tests: two students, one admin, one pending user, plus anon.
-- Run against the project (SQL editor, psql, or the Supabase MCP execute_sql). Everything rolls back.
-- Success: the last statement returns "ALL RLS TESTS PASSED". Any failure raises an exception naming the check.

begin;

do $$
declare
  admin_id   uuid := '00000000-0000-0000-0000-0000000000a1';
  stud_a     uuid := '00000000-0000-0000-0000-0000000000b1';
  stud_b     uuid := '00000000-0000-0000-0000-0000000000b2';
  pending_id uuid := '00000000-0000-0000-0000-0000000000c1';
  new_id     uuid := '00000000-0000-0000-0000-0000000000d1';
  n integer;
  course_a uuid;
  inv public.invite;
  denied boolean;
begin
  -- Fixtures (as the table owner, which bypasses RLS).
  insert into auth.users (id, email) values
    (admin_id, 'admin@test.local'), (stud_a, 'a@test.local'),
    (stud_b, 'b@test.local'), (pending_id, 'pending@test.local'), (new_id, 'new@test.local');
  insert into public.profile (id, name, email, role, status) values
    (admin_id, 'Admin', 'admin@test.local', 'admin', 'active'),
    (stud_a, 'Student A', 'a@test.local', 'student', 'active'),
    (stud_b, 'Student B', 'b@test.local', 'student', 'active'),
    (pending_id, 'Pending', 'pending@test.local', 'student', 'pending');
  select id into course_a from public.course order by sort_order limit 1;

  -- anon: no access to anything.
  set local role anon;
  denied := false;
  begin perform 1 from public.course limit 1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon must not read course';
  denied := false;
  begin perform 1 from public.profile limit 1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon must not read profile';
  denied := false;
  begin perform public.create_invite(); exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon must not call create_invite';
  reset role;

  -- Student A: sees only their own profile, can read course content.
  perform set_config('request.jwt.claims', json_build_object('sub', stud_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profile;
  assert n = 1, format('student A should see 1 profile, saw %s', n);
  select count(*) into n from public.profile where id = stud_b;
  assert n = 0, 'student A must not see student B profile';
  select count(*) into n from public.course;
  assert n >= 2, 'active student reads courses';
  select count(*) into n from public.exam;
  assert n >= 7, 'active student reads exams';
  select count(*) into n from public.exam_set_settings;
  assert n >= 7, 'active student reads exam_set_settings';

  -- Student A cannot write course content or profiles.
  denied := false;
  begin insert into public.course (name) values ('Hacked'); exception when insufficient_privilege or check_violation then denied := true; end;
  assert denied, 'student must not insert course';
  update public.course set name = 'Hacked' where id = course_a;
  get diagnostics n = row_count;
  assert n = 0, 'student must not update course';
  delete from public.exam;
  get diagnostics n = row_count;
  assert n = 0, 'student must not delete exams';
  denied := false;
  begin update public.profile set role = 'admin' where id = stud_a; exception when insufficient_privilege then denied := true; end;
  assert denied, 'student must not edit own profile (no self promotion)';
  denied := false;
  begin update public.profile set status = 'active' where id = pending_id; exception when insufficient_privilege then denied := true; end;
  assert denied, 'student must not approve anyone';

  -- Invites: A makes 3, the 4th is refused, B cannot see them, direct insert is blocked.
  perform public.create_invite();
  perform public.create_invite();
  inv := public.create_invite();
  assert inv.code ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$', 'invite code format';
  assert inv.expires_at > now() + interval '6 days 23 hours', 'invite expires in 7 days';
  denied := false;
  begin perform public.create_invite(); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, '4th unused invite must be refused';
  select count(*) into n from public.invite;
  assert n = 3, 'student A sees own 3 invites';
  denied := false;
  begin insert into public.invite (code, created_by) values ('FORGED', stud_a); exception when insufficient_privilege then denied := true; end;
  assert denied, 'student must not insert invites directly';
  denied := false;
  begin perform public.redeem_invite('X', new_id, 'X', 'x@test.local'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'student must not call redeem_invite';
  reset role;

  -- Student B: sees none of A's invites or profile.
  perform set_config('request.jwt.claims', json_build_object('sub', stud_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.invite;
  assert n = 0, 'student B must not see A invites';
  select count(*) into n from public.profile where id = stud_a;
  assert n = 0, 'student B must not see A profile';
  delete from public.invite;
  get diagnostics n = row_count;
  assert n = 0, 'student B must not delete invites';
  reset role;

  -- Pending user: no content, no invites.
  perform set_config('request.jwt.claims', json_build_object('sub', pending_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.course;
  assert n = 0, 'pending user must not read courses';
  select count(*) into n from public.exam;
  assert n = 0, 'pending user must not read exams';
  denied := false;
  begin perform public.create_invite(); exception when insufficient_privilege then denied := true; end;
  assert denied, 'pending user must not create invites';
  select count(*) into n from public.profile;
  assert n = 1, 'pending user sees only own profile';
  reset role;

  -- Admin: sees all profiles and invites, edits course content, no invite limit.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profile;
  assert n = 4, format('admin sees all profiles, saw %s', n);
  select count(*) into n from public.invite;
  assert n = 3, 'admin sees all invites';
  update public.course set short_name = 'Renamed' where id = course_a;
  get diagnostics n = row_count;
  assert n = 1, 'admin updates course';
  insert into public.exam (course_id, name, weight, format) values (course_a, 'Quiz', 5, 'mcq');
  select count(*) into n from public.exam_set_settings s join public.exam e on e.id = s.exam_id where e.name = 'Quiz';
  assert n = 1, 'new exam gets default set settings';
  update public.exam_set_settings set mcq_count = 12 where exam_id = (select id from public.exam where name = 'Quiz');
  get diagnostics n = row_count;
  assert n = 1, 'admin updates set settings';
  delete from public.exam where name = 'Quiz';
  get diagnostics n = row_count;
  assert n = 1, 'admin deletes exam';
  for i in 1..5 loop perform public.create_invite(); end loop;
  select count(*) into n from public.invite where created_by = admin_id;
  assert n = 5, 'admin has no invite limit';
  denied := false;
  begin update public.profile set status = 'active' where id = pending_id; exception when insufficient_privilege then denied := true; end;
  assert denied, 'even admin edits profiles only through the service role';
  reset role;

  -- Sign-up path (service role): redeem a code, code becomes single use, expired and unknown codes fail.
  select * into inv from public.invite where created_by = stud_a limit 1;
  set local role service_role;
  perform public.redeem_invite(lower(inv.code), new_id, 'Newcomer', 'new@test.local');
  reset role;
  select count(*) into n from public.profile where id = new_id and status = 'pending' and invited_by = stud_a and role = 'student';
  assert n = 1, 'redeemed account is pending and invited by A';
  select count(*) into n from public.invite where id = inv.id and used_at is not null and used_by = new_id;
  assert n = 1, 'invite marked used';

  set local role service_role;
  denied := false;
  begin perform public.redeem_invite(inv.code, new_id, 'Again', 'again@test.local'); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'used code cannot be redeemed twice';
  denied := false;
  begin perform public.redeem_invite('NOPE-NOPE-NOPE', new_id, 'X', 'x@test.local'); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'unknown code rejected';
  reset role;
  update public.invite set expires_at = now() - interval '1 minute' where created_by = stud_a and used_at is null;
  select * into inv from public.invite where created_by = stud_a and used_at is null limit 1;
  set local role service_role;
  denied := false;
  begin perform public.redeem_invite(inv.code, stud_b, 'X', 'x2@test.local'); exception when sqlstate 'P0001' then denied := true; end;
  assert denied, 'expired code rejected';
  reset role;

  -- Expired codes stop counting toward A's limit.
  perform set_config('request.jwt.claims', json_build_object('sub', stud_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_invite();
  reset role;

  -- Storage: private buckets, answer photos only in your own folder.
  select count(*) into n from storage.buckets where id in ('figures', 'answer-photos') and public = false;
  assert n = 2, 'both buckets exist and are private';
  insert into storage.objects (bucket_id, name, owner) values
    ('answer-photos', stud_a::text || '/a1.jpg', stud_a),
    ('answer-photos', stud_b::text || '/b1.jpg', stud_b),
    ('figures', 'ch1/fig1.png', null);
  perform set_config('request.jwt.claims', json_build_object('sub', stud_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'answer-photos';
  assert n = 1, format('student A sees only own answer photos, saw %s', n);
  select count(*) into n from storage.objects where bucket_id = 'figures';
  assert n = 1, 'active student reads figures';
  denied := false;
  begin insert into storage.objects (bucket_id, name, owner) values ('figures', 'ch1/evil.png', stud_a); exception when insufficient_privilege or check_violation then denied := true; end;
  assert denied, 'student must not upload figures';
  denied := false;
  begin insert into storage.objects (bucket_id, name, owner) values ('answer-photos', stud_b::text || '/evil.jpg', stud_a); exception when insufficient_privilege or check_violation then denied := true; end;
  assert denied, 'student must not upload into another folder';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', pending_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects;
  assert n = 0, 'pending user sees no storage objects';
  reset role;
end;
$$;

select 'ALL RLS TESTS PASSED' as result;

rollback;
