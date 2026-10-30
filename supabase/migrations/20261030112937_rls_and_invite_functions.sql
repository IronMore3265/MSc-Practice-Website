-- Row level security for every Phase 1 table, plus the invite functions.
-- Browser code uses the anon key and the signed-in user's JWT, so these policies are the real gate.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Role helpers. Security definer so they can read profile without recursing into its policies.
create function private.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profile
    where id = (select auth.uid()) and role = 'admin' and status = 'active'
  );
$$;

create function private.is_active() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profile
    where id = (select auth.uid()) and status = 'active'
  );
$$;

revoke execute on function private.is_admin() from public, anon;
revoke execute on function private.is_active() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.is_active() to authenticated, service_role;

-- Table privileges: anon gets nothing. Signed-in users get only what the policies below can open up.
revoke all on table
  public.profile, public.invite, public.course, public.chapter,
  public.exam, public.exam_chapter, public.exam_set_settings
from anon, authenticated;

grant select on table
  public.profile, public.invite, public.course, public.chapter,
  public.exam, public.exam_chapter, public.exam_set_settings
to authenticated;

grant insert, update, delete on table
  public.course, public.chapter, public.exam, public.exam_chapter, public.exam_set_settings
to authenticated;

-- Admins may delete invites. Nobody edits profile rows from the browser: approvals, caps,
-- limits and password resets go through server routes that check the admin role first.
grant delete on table public.invite to authenticated;

alter table public.profile enable row level security;
alter table public.invite enable row level security;
alter table public.course enable row level security;
alter table public.chapter enable row level security;
alter table public.exam enable row level security;
alter table public.exam_chapter enable row level security;
alter table public.exam_set_settings enable row level security;

-- profile: see your own row; admins see everyone.
create policy "profile: read own or admin" on public.profile
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

-- invite: see your own codes; admins see all and may delete.
create policy "invite: read own or admin" on public.invite
  for select to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()));

create policy "invite: admin delete" on public.invite
  for delete to authenticated
  using ((select private.is_admin()));

-- Course content: readable by active members, writable by the admin only.
create policy "course: active read" on public.course
  for select to authenticated using ((select private.is_active()));
create policy "course: admin insert" on public.course
  for insert to authenticated with check ((select private.is_admin()));
create policy "course: admin update" on public.course
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "course: admin delete" on public.course
  for delete to authenticated using ((select private.is_admin()));

create policy "chapter: active read" on public.chapter
  for select to authenticated using ((select private.is_active()));
create policy "chapter: admin insert" on public.chapter
  for insert to authenticated with check ((select private.is_admin()));
create policy "chapter: admin update" on public.chapter
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "chapter: admin delete" on public.chapter
  for delete to authenticated using ((select private.is_admin()));

create policy "exam: active read" on public.exam
  for select to authenticated using ((select private.is_active()));
create policy "exam: admin insert" on public.exam
  for insert to authenticated with check ((select private.is_admin()));
create policy "exam: admin update" on public.exam
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "exam: admin delete" on public.exam
  for delete to authenticated using ((select private.is_admin()));

create policy "exam_chapter: active read" on public.exam_chapter
  for select to authenticated using ((select private.is_active()));
create policy "exam_chapter: admin insert" on public.exam_chapter
  for insert to authenticated with check ((select private.is_admin()));
create policy "exam_chapter: admin update" on public.exam_chapter
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "exam_chapter: admin delete" on public.exam_chapter
  for delete to authenticated using ((select private.is_admin()));

create policy "exam_set_settings: active read" on public.exam_set_settings
  for select to authenticated using ((select private.is_active()));
create policy "exam_set_settings: admin insert" on public.exam_set_settings
  for insert to authenticated with check ((select private.is_admin()));
create policy "exam_set_settings: admin update" on public.exam_set_settings
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "exam_set_settings: admin delete" on public.exam_set_settings
  for delete to authenticated using ((select private.is_admin()));

-- create_invite(): any active member makes a code. At most invite_limit unused codes at a time
-- (the admin has no limit). Locking the caller's profile row keeps two clicks from racing past the limit.
create function public.create_invite() returns public.invite
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profile;
  unused integer;
  inv public.invite;
  candidate text;
begin
  select * into me from public.profile where id = (select auth.uid()) for update;
  if not found or me.status <> 'active' then
    raise exception 'Only active members can create invite codes' using errcode = '42501';
  end if;

  if me.role <> 'admin' then
    select count(*) into unused from public.invite
    where created_by = me.id and used_at is null and expires_at > now();
    if unused >= me.invite_limit then
      raise exception 'You already have % unused invite codes', unused using errcode = 'P0001';
    end if;
  end if;

  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    candidate := substr(candidate, 1, 4) || '-' || substr(candidate, 5, 4) || '-' || substr(candidate, 9, 4);
    begin
      insert into public.invite (code, created_by) values (candidate, me.id) returning * into inv;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  return inv;
end;
$$;
revoke execute on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;

-- redeem_invite(): called only by the sign-up server route (service role) right after it creates the auth user.
-- Re-checks the code under a row lock, creates the pending profile and marks the code used.
create function public.redeem_invite(p_code text, p_user_id uuid, p_name text, p_email text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invite;
begin
  select * into inv from public.invite where code = upper(trim(p_code)) for update;
  if not found or inv.used_at is not null or inv.expires_at <= now() then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profile where id = inv.created_by and status = 'active') then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  insert into public.profile (id, name, email, invited_by)
  values (p_user_id, p_name, p_email, inv.created_by);

  update public.invite set used_by = p_user_id, used_at = now() where id = inv.id;
end;
$$;
revoke execute on function public.redeem_invite(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.redeem_invite(text, uuid, text, text) to service_role;
