-- Leaderboard: per exam, each student's average MCQ % over full-set sessions.
-- The admin switches it on or off for everyone. Students join it themselves (opt-in), and only sessions
-- started after joining count, so scores from before never show. Leaving and joining again restarts the count.
-- Answers stay private: the leaderboard shares only a name, an average and a session count.

-- app_setting: one row of site-wide switches.
create table public.app_setting (
  id smallint primary key default 1 check (id = 1),
  leaderboard_on boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.app_setting (id) values (1) on conflict (id) do nothing;

revoke all on table public.app_setting from anon, authenticated;
grant select, update on table public.app_setting to authenticated;

alter table public.app_setting enable row level security;

create policy "app_setting: active read" on public.app_setting
  for select to authenticated using ((select private.is_active()));
create policy "app_setting: admin update" on public.app_setting
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- When the student joined the leaderboard. Null means not joined.
alter table public.profile add column leaderboard_since timestamptz;

-- set_leaderboard_opt_in(): join or leave. Profile rows have no update grant, so this is the only way in.
create function public.set_leaderboard_opt_in(p_on boolean) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  since timestamptz;
begin
  if not (select private.is_active()) then
    raise exception 'Only active members can join the leaderboard' using errcode = '42501';
  end if;
  update public.profile
  set leaderboard_since = case when p_on then coalesce(leaderboard_since, now()) else null end
  where id = (select auth.uid())
  returning leaderboard_since into since;
  return since;
end;
$$;
revoke execute on function public.set_leaderboard_opt_in(boolean) from public, anon;
grant execute on function public.set_leaderboard_opt_in(boolean) to authenticated;

-- exam_leaderboard(): the top 10 for one exam plus your own row. Empty while the admin has it switched off.
-- Counts finished MCQ-only sessions from a set (not retries of missed questions) started after the student joined.
create function public.exam_leaderboard(p_exam_id uuid)
returns table (rank integer, name text, avg_percent integer, sessions integer, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_active()) then
    raise exception 'Only active members can see the leaderboard' using errcode = '42501';
  end if;
  if not coalesce((select s.leaderboard_on from public.app_setting s where s.id = 1), false) then
    return;
  end if;

  return query
  with scores as (
    select p.id, p.name, round(avg(r.score * 100.0 / r.max_score))::integer as avg_percent, count(*)::integer as sessions
    from public.session_run r
    join public.profile p on p.id = r.user_id
    where r.exam_id = p_exam_id
      and r.retry_of is null
      and r.set_id is not null
      and r.sections = '{mcq}'
      and r.finished_at is not null
      and r.max_score > 0
      and p.status = 'active'
      and p.leaderboard_since is not null
      and r.started_at >= p.leaderboard_since
    group by p.id, p.name
  ),
  ranked as (
    select sc.*, (rank() over (order by sc.avg_percent desc, sc.sessions desc))::integer as rk from scores sc
  )
  select rd.rk, rd.name, rd.avg_percent, rd.sessions, rd.id = (select auth.uid())
  from ranked rd
  where rd.rk <= 10 or rd.id = (select auth.uid())
  order by rd.rk, rd.name;
end;
$$;
revoke execute on function public.exam_leaderboard(uuid) from public, anon;
grant execute on function public.exam_leaderboard(uuid) to authenticated;
