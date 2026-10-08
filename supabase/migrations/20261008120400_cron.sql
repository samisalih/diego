-- Trash purge: hard-deletes soft-deleted rows older than 30 days, scheduled daily.
-- Storage file cleanup is out of scope here; it is handled by an edge function in phase j.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.purge_trash()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.documents where deleted_at < now() - interval '30 days';
  delete from public.assets where deleted_at < now() - interval '30 days';
  delete from public.materials where deleted_at < now() - interval '30 days';
  delete from public.models where deleted_at < now() - interval '30 days';
$$;

-- Only the cron job (postgres) runs it; not exposed through the API.
revoke all on function public.purge_trash() from public, anon, authenticated;

-- cron.schedule with an existing job name updates that job, so re-running is safe.
select cron.schedule('purge-trash', '15 3 * * *', 'select public.purge_trash()');
