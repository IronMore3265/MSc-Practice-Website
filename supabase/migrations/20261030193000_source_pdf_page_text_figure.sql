-- Phase 2: PDF import tables (plan sections 6 and 8): source_pdf, page_text, figure.
-- The import tool on the laptop writes these with the service role key. Browsers only read.

-- source_pdf: one PDF per chapter. Re-importing a chapter replaces its row.
create table public.source_pdf (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null unique references public.chapter (id) on delete cascade,
  filename text not null,
  sha256 text not null,
  page_count integer not null check (page_count > 0),
  pages_without_text integer not null default 0 check (pages_without_text >= 0),
  figures_pending integer not null default 0 check (figures_pending >= 0),
  review_status text not null default 'in_review' check (review_status in ('in_review', 'reviewed')),
  imported_at timestamptz not null default now()
);

-- page_text: extracted text per page. Sent to Gemini by the server only, so students cannot read it.
create table public.page_text (
  pdf_id uuid not null references public.source_pdf (id) on delete cascade,
  page integer not null check (page > 0),
  text text not null,
  primary key (pdf_id, page)
);

-- figure: a 1:1 copy of a diagram, chart or table from the PDF. Only approved figures are uploaded.
-- bbox is [x0, y0, x1, y1] in PDF points on the unrotated page.
create table public.figure (
  id uuid primary key default gen_random_uuid(),
  pdf_id uuid not null references public.source_pdf (id) on delete cascade,
  chapter_id uuid not null references public.chapter (id) on delete cascade,
  import_key text not null,
  page integer not null check (page > 0),
  bbox double precision[] not null check (array_length(bbox, 1) = 4),
  label text,
  caption text,
  kind text not null check (kind in ('raster', 'vector', 'mixed', 'manual')),
  source text not null check (source in ('embedded', 'render')),
  blob_path text not null,
  mime_type text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sha256 text not null,
  created_at timestamptz not null default now(),
  unique (pdf_id, import_key)
);
create index figure_chapter_idx on public.figure (chapter_id);
create index figure_pdf_page_idx on public.figure (pdf_id, page);

revoke all on table public.source_pdf, public.page_text, public.figure from anon, authenticated;
grant select on table public.source_pdf, public.figure to authenticated;
grant select on table public.page_text to authenticated;

alter table public.source_pdf enable row level security;
alter table public.page_text enable row level security;
alter table public.figure enable row level security;

create policy "source_pdf: active read" on public.source_pdf
  for select to authenticated using ((select private.is_active()));

create policy "figure: active read" on public.figure
  for select to authenticated using ((select private.is_active()));

create policy "page_text: admin read" on public.page_text
  for select to authenticated using ((select private.is_admin()));
