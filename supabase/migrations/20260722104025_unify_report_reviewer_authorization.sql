-- user_profiles is the application's authoritative role table. Keep every
-- report-related policy aligned with the server-side authorization checks.

drop policy if exists "reports_select_authenticated" on public.reports;
drop policy if exists "Observers can read their own reports" on public.reports;
create policy "reports_select_authenticated"
  on public.reports for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  );

drop policy if exists "reports_update_reviewer_or_admin" on public.reports;
drop policy if exists "Reviewers can update report decisions" on public.reports;
create policy "reports_update_reviewer_or_admin"
  on public.reports for update to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  );

drop policy if exists "report_media_select_authorized" on public.report_media;
create policy "report_media_select_authorized"
  on public.report_media for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  );

drop policy if exists "report_enrichment_select_authorized" on public.report_enrichment;
create policy "report_enrichment_select_authorized"
  on public.report_enrichment for select to authenticated
  using (
    exists (
      select 1 from public.reports
      where id = report_enrichment.report_id
        and (
          reporter_id = (select auth.uid())
          or exists (
            select 1 from public.user_profiles
            where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
          )
        )
    )
  );

drop policy if exists "report_enrichment_insert_reviewer_or_admin" on public.report_enrichment;
create policy "report_enrichment_insert_owner_or_reviewer"
  on public.report_enrichment for insert to authenticated
  with check (
    exists (
      select 1 from public.reports
      where id = report_enrichment.report_id
        and (
          reporter_id = (select auth.uid())
          or exists (
            select 1 from public.user_profiles
            where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
          )
        )
    )
  );

drop policy if exists "report_enrichment_update_reviewer_or_admin" on public.report_enrichment;
create policy "report_enrichment_update_reviewer_or_admin"
  on public.report_enrichment for update to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where user_id = (select auth.uid()) and role in ('reviewer', 'admin')
    )
  );
