-- Phase 1 core schema: profile, invite, course, chapter, exam, exam_chapter, exam_set_settings.
-- Plan section 8. Row level security is in the next migration.

create type public.user_role as enum ('student', 'admin');
create type public.user_status as enum ('pending', 'active', 'disabled');
create type public.exam_format as enum ('mcq', 'cq', 'both');

-- profile: one row per auth user. id is the auth user id.
create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text not null,
  role public.user_role not null default 'student',
  status public.user_status not null default 'pending',
  daily_cap integer not null default 10 check (daily_cap >= 0),
  invite_limit integer not null default 3 check (invite_limit >= 0),
  invited_by uuid references public.profile (id) on delete set null,
  approved_by uuid references public.profile (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index profile_email_key on public.profile (lower(email));
create index profile_invited_by_idx on public.profile (invited_by);
create index profile_approved_by_idx on public.profile (approved_by);

-- invite: one-time codes, 7 day expiry. A code is used when used_at is set.
create table public.invite (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null references public.profile (id) on delete cascade,
  used_by uuid references public.profile (id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
create index invite_created_by_idx on public.invite (created_by);
create index invite_used_by_idx on public.invite (used_by);

create table public.course (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- chapter: one PDF per chapter (the PDF link is added in Phase 2).
create table public.chapter (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.course (id) on delete cascade,
  number integer not null check (number > 0),
  title text not null,
  created_at timestamptz not null default now(),
  unique (course_id, number)
);

-- exam: defined per course. Marks are totals for the real paper.
create table public.exam (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.course (id) on delete cascade,
  name text not null,
  weight numeric(5, 2) not null default 0 check (weight >= 0 and weight <= 100),
  format public.exam_format not null default 'mcq',
  mcq_marks integer not null default 0 check (mcq_marks >= 0),
  cq_marks integer not null default 0 check (cq_marks >= 0),
  mcq_seconds integer not null default 600 check (mcq_seconds >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (course_id, name)
);
create index exam_course_idx on public.exam (course_id);

-- exam_chapter: which chapters an exam covers (plan section 8 lists chapter_ids; a join table keeps the foreign keys).
create table public.exam_chapter (
  exam_id uuid not null references public.exam (id) on delete cascade,
  chapter_id uuid not null references public.chapter (id) on delete cascade,
  primary key (exam_id, chapter_id)
);
create index exam_chapter_chapter_idx on public.exam_chapter (chapter_id);

create table public.exam_set_settings (
  exam_id uuid primary key references public.exam (id) on delete cascade,
  mcq_count integer not null default 10 check (mcq_count >= 0),
  cq_count integer not null default 0 check (cq_count >= 0),
  cq_marks integer not null default 5 check (cq_marks >= 0)
);

-- Every exam always has a settings row.
create function public.exam_default_settings() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.exam_set_settings (exam_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public.exam_default_settings() from public, anon, authenticated;

create trigger exam_default_settings
after insert on public.exam
for each row execute function public.exam_default_settings();
