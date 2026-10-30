-- Seed the two known courses and their exams (plan section 2.1).
-- Safe to run twice: every insert checks for an existing row first.

insert into public.course (name, short_name, sort_order) values
  ('Sourcing & Procurement', 'Sourcing & Procurement', 1),
  ('IPE 6112 Probabilistic Methods in Engineering Design', 'IPE 6112', 2)
on conflict (name) do nothing;

-- Sourcing & Procurement: chapters 1 to 7 (titles are filled in when the PDFs are imported).
insert into public.chapter (course_id, number, title)
select c.id, n, 'Chapter ' || n
from public.course c, generate_series(1, 7) as n
where c.name = 'Sourcing & Procurement'
on conflict (course_id, number) do nothing;

-- IPE 6112: the nine topics from the course info sheet.
insert into public.chapter (course_id, number, title)
select c.id, t.number, t.title
from public.course c,
  (values
    (1, 'Basic probability'),
    (2, 'Random variables and distributions'),
    (3, 'Data analysis'),
    (4, 'Functions of random variables'),
    (5, 'Response surface methods'),
    (6, 'Monte Carlo simulation'),
    (7, 'Component reliability'),
    (8, 'System reliability'),
    (9, 'Reliability-based design')
  ) as t (number, title)
where c.name = 'IPE 6112 Probabilistic Methods in Engineering Design'
on conflict (course_id, number) do nothing;

-- Exams. mcq_count, cq_count and cq_marks_each are the default set settings.
create temp table seed_exam (
  course_name text, name text, weight numeric, format public.exam_format,
  mcq_marks integer, cq_marks integer, sort_order integer, chapter_numbers integer[],
  mcq_count integer, cq_count integer, cq_marks_each integer
) on commit drop;

insert into seed_exam values
  ('Sourcing & Procurement', 'CT-1',    10, 'mcq',  10,  0, 1, '{1,2}',     10, 0, 5),
  ('Sourcing & Procurement', 'CT-2',    10, 'mcq',  10,  0, 2, '{4,5}',     10, 0, 5),
  ('Sourcing & Procurement', 'Midterm', 30, 'both', 10, 20, 3, '{1,2,3}',   10, 4, 5),
  ('Sourcing & Procurement', 'Final',   30, 'cq',    0, 30, 4, '{4,5,6,7}',  0, 6, 5),
  -- IPE 6112: topics per exam are not known yet, so no chapters are linked. Weights split the 40% for two mid-terms evenly.
  ('IPE 6112 Probabilistic Methods in Engineering Design', 'Mid-term 1', 20, 'cq', 0, 20, 1, '{}', 0, 4, 5),
  ('IPE 6112 Probabilistic Methods in Engineering Design', 'Mid-term 2', 20, 'cq', 0, 20, 2, '{}', 0, 4, 5),
  ('IPE 6112 Probabilistic Methods in Engineering Design', 'Final',      30, 'cq', 0, 30, 3, '{}', 0, 6, 5);

insert into public.exam (course_id, name, weight, format, mcq_marks, cq_marks, sort_order)
select c.id, s.name, s.weight, s.format, s.mcq_marks, s.cq_marks, s.sort_order
from seed_exam s
join public.course c on c.name = s.course_name
on conflict (course_id, name) do nothing;

insert into public.exam_chapter (exam_id, chapter_id)
select e.id, ch.id
from seed_exam s
join public.course c on c.name = s.course_name
join public.exam e on e.course_id = c.id and e.name = s.name
join public.chapter ch on ch.course_id = c.id and ch.number = any (s.chapter_numbers)
on conflict do nothing;

-- The exam trigger already created default settings rows. Set the real defaults only where they are still untouched.
update public.exam_set_settings es
set mcq_count = s.mcq_count, cq_count = s.cq_count, cq_marks = s.cq_marks_each
from seed_exam s
join public.course c on c.name = s.course_name
join public.exam e on e.course_id = c.id and e.name = s.name
where es.exam_id = e.id
  and es.mcq_count = 10 and es.cq_count = 0 and es.cq_marks = 5;
