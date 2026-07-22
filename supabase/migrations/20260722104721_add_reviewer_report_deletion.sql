-- Reviewers may remove reports during triage. Ordinary reporters retain no
-- report-delete permission. Related media/enrichment rows cascade in Postgres;
-- Storage objects are removed explicitly by the server action.

drop policy if exists "reports_delete_admin" on public.reports;
drop policy if exists "reports_delete_reviewer" on public.reports;
create policy "reports_delete_reviewer"
  on public.reports for delete to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  );

drop policy if exists "report_media_bucket_delete" on storage.objects;
create policy "report_media_bucket_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-media'
    and (
      (select auth.uid())::text = (storage.foldername(name))[1]
      or exists (
        select 1 from public.user_profiles
        where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
      )
    )
  );
