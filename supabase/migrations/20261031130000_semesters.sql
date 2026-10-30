-- Semesters: courses now belong to a semester, so the site can carry on into later semesters.
-- Students pick the semester first on the home screen. The admin can hide a finished semester.

create table public.semester (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.semester (name, sort_order) values ('Semester 1', 1)
on conflict (name) do nothing;

-- Every existing course moves into Semester 1. Course names stay unique across all semesters,
-- so the import tool can keep finding a course by its name.
alter table public.course add column semester_id uuid references public.semester(id) on delete restrict;
update public.course set semester_id = (select id from public.semester where name = 'Semester 1') where semester_id is null;
alter table public.course alter column semester_id set not null;
create index course_semester_id_idx on public.course (semester_id);

-- Privileges and RLS, same pattern as course: anon gets nothing, active members read, the admin writes.
-- A hidden semester is only visible to the admin. Its courses stay readable, so old results keep their names.
revoke all on table public.semester from anon, authenticated;
grant select, insert, update, delete on table public.semester to authenticated;

alter table public.semester enable row level security;

create policy "semester: read open or admin" on public.semester
  for select to authenticated using ((select private.is_admin()) or ((select private.is_active()) and is_open));
create policy "semester: admin insert" on public.semester
  for insert to authenticated with check ((select private.is_admin()));
create policy "semester: admin update" on public.semester
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "semester: admin delete" on public.semester
  for delete to authenticated using ((select private.is_admin()));
