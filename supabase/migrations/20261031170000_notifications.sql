-- Student notifications: one row per CQ session that has news, so a student who left while the AI was marking
-- sees it on the home screen and can open the result. Rows are written only by triggers. A student reads their
-- own rows and marks them read, nothing else.
--   graded: an answer in the session was marked. New marks in the same session make the row unread again.
--   grade_failed: a marking gave up after its retries; the result screen has the Retry button.

create table public.notification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profile (id) on delete cascade,
  session_run_id uuid not null references public.session_run (id) on delete cascade,
  kind text not null check (kind in ('graded', 'grade_failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  unique (session_run_id, kind)
);
create index notification_user_idx on public.notification (user_id, updated_at desc);

revoke all on table public.notification from anon, authenticated;
grant select on table public.notification to authenticated;
grant update (read_at) on table public.notification to authenticated;
alter table public.notification enable row level security;

create policy "notification: read own" on public.notification
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notification: mark own read" on public.notification
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function private.notify(p_user uuid, p_run uuid, p_kind text) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification (user_id, session_run_id, kind) values (p_user, p_run, p_kind)
  on conflict (session_run_id, kind) do update set updated_at = now(), read_at = null;
$$;
revoke execute on function private.notify(uuid, uuid, text) from public, anon, authenticated;

-- An answer was marked: notify, and settle an old "failed" note once no answer in the session is failed any more.
create function private.notify_graded() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(new.user_id, new.session_run_id, 'graded');
  if not exists (
    select 1 from public.attempt a join public.job j on j.id = a.job_id
    where a.session_run_id = new.session_run_id and j.status = 'failed'
  ) then
    update public.notification set read_at = now()
    where session_run_id = new.session_run_id and kind = 'grade_failed' and read_at is null;
  end if;
  return null;
end;
$$;
revoke execute on function private.notify_graded() from public, anon, authenticated;

create trigger attempt_graded_notify
after update of graded_at on public.attempt
for each row
when (new.graded_at is not null and new.graded_at is distinct from old.graded_at)
execute function private.notify_graded();

-- A grading job failed for good.
create function private.notify_grade_failed() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  for a in select user_id, session_run_id from public.attempt where job_id = new.id loop
    perform private.notify(a.user_id, a.session_run_id, 'grade_failed');
  end loop;
  return null;
end;
$$;
revoke execute on function private.notify_grade_failed() from public, anon, authenticated;

create trigger job_grade_failed_notify
after update of status on public.job
for each row
when (new.kind = 'grade' and new.status = 'failed' and old.status is distinct from 'failed')
execute function private.notify_grade_failed();
