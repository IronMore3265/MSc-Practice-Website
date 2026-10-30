-- Chapter sets: a set can belong to one chapter of its exam. The home screen shows chapter sets only when that
-- chapter is picked, and whole-exam sets (chapter_id null) when All is picked.

alter table public.question_set add column chapter_id uuid references public.chapter (id) on delete cascade;
create index question_set_chapter_idx on public.question_set (chapter_id);

-- create_auto_set(): as before, plus an optional chapter. With a chapter, the questions come from that chapter only
-- and the set is named "Ch N Set M", numbered per chapter. Whole-exam sets keep the "Set N" numbering.
drop function public.create_auto_set(uuid, uuid);
create function public.create_auto_set(p_exam_id uuid, p_user uuid, p_chapter_id uuid default null) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.exam_set_settings;
  sid uuid;
  prefix text := 'Set ';
  next_n integer;
  total integer;
  added integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_exam_id::text, 0));

  select * into s from public.exam_set_settings where exam_id = p_exam_id;
  if not found then
    raise exception 'unknown_exam' using errcode = 'P0001';
  end if;

  if p_chapter_id is not null then
    select 'Ch ' || c.number || ' Set ' into prefix
    from public.exam_chapter ec join public.chapter c on c.id = ec.chapter_id
    where ec.exam_id = p_exam_id and ec.chapter_id = p_chapter_id;
    if not found then
      raise exception 'unknown_chapter' using errcode = 'P0001';
    end if;
  end if;

  select count(*) into total from public.question_set where exam_id = p_exam_id;
  if total >= 50 then
    raise exception 'too_many_sets' using errcode = 'P0001';
  end if;
  select coalesce(max((regexp_match(name, '^' || prefix || '([0-9]+)$'))[1]::integer), 0) + 1 into next_n
  from public.question_set where exam_id = p_exam_id;

  insert into public.question_set (exam_id, chapter_id, name, origin, created_by)
  values (p_exam_id, p_chapter_id, prefix || next_n, 'auto', p_user)
  returning id into sid;

  with pool as (
    select q.id, q.kind,
      row_number() over (partition by q.chapter_id, (q.kind = 'mcq') order by random()) as rn,
      random() as r
    from public.question q
    join public.exam_chapter ec on ec.chapter_id = q.chapter_id and ec.exam_id = p_exam_id
    where q.status = 'approved' and (p_chapter_id is null or q.chapter_id = p_chapter_id)
  ),
  picked as (
    (select id, 0 as grp, rn, r from pool where kind = 'mcq' order by rn, r limit s.mcq_count)
    union all
    (select id, 1 as grp, rn, r from pool where kind <> 'mcq' order by rn, r limit s.cq_count)
  )
  insert into public.question_set_item (set_id, question_id, position)
  select sid, id, (row_number() over (order by grp, rn, r))::integer - 1 from picked;

  get diagnostics added = row_count;
  if added = 0 then
    raise exception 'no_questions' using errcode = 'P0001';
  end if;
  return sid;
end;
$$;
revoke execute on function public.create_auto_set(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_auto_set(uuid, uuid, uuid) to service_role;
