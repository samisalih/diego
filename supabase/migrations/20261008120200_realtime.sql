-- Realtime: all public tables in the supabase_realtime publication.
do $$
declare
  t text;
begin
  foreach t in array array[
    'documents', 'document_revisions', 'assets', 'asset_revisions',
    'materials', 'models', 'app_state'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- Old row values in update/delete events, so the client can diff.
alter table public.documents replica identity full;
alter table public.assets replica identity full;
alter table public.materials replica identity full;
alter table public.models replica identity full;
alter table public.app_state replica identity full;
