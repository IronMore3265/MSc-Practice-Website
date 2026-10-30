-- Semester tests: who can read and change semesters, and that every course has one.
-- Run against the project (SQL editor, psql, or the Supabase MCP execute_sql). Everything rolls back.
-- Success: the last statement returns "ALL SEMESTER TESTS PASSED". Any failure raises an exception naming the check.

begin;

do $$
declare
  admin_id   uuid := '00000000-0000-0000-0000-0000000000a1';
  stud_a     uuid := '00000000-0000-0000-0000-0000000000b1';
  pending_id uuid := '00000000-0000-0000-0000-0000000000c1';
  hidden_id  uuid;
  n integer;
  denied boolean;
begin
  -- Fixtures (as the table owner, which bypasses RLS).
  insert into auth.users (id, email) values
    (admin_id, 'admin@test.local'), (stud_a, 'a@test.local'), (pending_id, 'pending@test.local');
  insert into public.profile (id, name, email, role, status) values
    (admin_id, 'Admin', 'admin@test.local', 'admin', 'active'),
    (stud_a, 'Student A', 'a@test.local', 'student', 'active'),
    (pending_id, 'Pending', 'pending@test.local', 'student', 'pending');
  insert into public.semester (name, sort_order, is_open) values ('zz Hidden test semester', 999, false) returning id into hidden_id;

  -- Every course belongs to a semester.
  select count(*) into n from public.course where semester_id is null;
  assert n = 0, 'every course has a semester';

  -- anon: no access.
  set local role anon;
  denied := false;
  begin perform 1 from public.semester limit 1; exception when insufficient_privilege then denied := true; end;
  assert denied, 'anon must not read semester';
  reset role;

  -- Active student: reads open semesters, not hidden ones, and cannot write.
  perform set_config('request.jwt.claims', json_build_object('sub', stud_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.semester where name = 'Semester 1';
  assert n = 1, 'student reads an open semester';
  select count(*) into n from public.semester where id = hidden_id;
  assert n = 0, 'student must not read a hidden semester';
  select count(*) into n from public.course;
  assert n >= 2, 'student still reads courses';

  denied := false;
  begin insert into public.semester (name) values ('zz Student semester'); exception when insufficient_privilege then denied := true; end;
  assert denied, 'student must not add a semester';
  update public.semester set is_open = false where name = 'Semester 1';
  get diagnostics n = row_count;
  assert n = 0, 'student must not change a semester';
  delete from public.semester where name = 'Semester 1';
  get diagnostics n = row_count;
  assert n = 0, 'student must not delete a semester';
  reset role;

  -- Pending user: reads nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', pending_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.semester;
  assert n = 0, format('pending user should see no semesters, saw %s', n);
  reset role;

  -- Admin: reads hidden ones too, and can add, change and delete.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.semester where id = hidden_id;
  assert n = 1, 'admin reads a hidden semester';
  insert into public.semester (name, sort_order) values ('zz Admin semester', 998);
  update public.semester set is_open = true where id = hidden_id;
  get diagnostics n = row_count;
  assert n = 1, 'admin can open a semester';
  delete from public.semester where name = 'zz Admin semester';
  get diagnostics n = row_count;
  assert n = 1, 'admin can delete an empty semester';

  -- A semester that still has courses cannot be deleted.
  denied := false;
  begin delete from public.semester where name = 'Semester 1'; exception when foreign_key_violation then denied := true; end;
  assert denied, 'a semester with courses must not be deleted';
  reset role;
end $$;

select 'ALL SEMESTER TESTS PASSED' as result;

rollback;
