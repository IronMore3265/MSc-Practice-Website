-- Private storage buckets (plan section 5). Nothing here is public.
-- figures: 1:1 figure images from the PDFs. Written by the import tool (service role), read by active members.
-- answer-photos: handwritten answer photos, one folder per user ({user id}/...), deleted after grading.

insert into storage.buckets (id, name, public)
values ('figures', 'figures', false), ('answer-photos', 'answer-photos', false)
on conflict (id) do update set public = false;

create policy "figures: active members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'figures' and (select private.is_active()));

create policy "figures: admin write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'figures' and (select private.is_admin()));

create policy "figures: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'figures' and (select private.is_admin()))
  with check (bucket_id = 'figures' and (select private.is_admin()));

create policy "figures: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'figures' and (select private.is_admin()));

create policy "answer photos: own folder read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'answer-photos'
    and (select private.is_active())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "answer photos: own folder insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'answer-photos'
    and (select private.is_active())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "answer photos: own folder delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'answer-photos'
    and (select private.is_active())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
