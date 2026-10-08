-- Owner model, RLS on every public table, private storage buckets and their policies.
-- Single-user app: all access is gated by private.is_owner(). No anon access anywhere.

create schema if not exists private;

-- Single row holding the owner's auth user id. Filled manually once the owner account exists:
--   insert into private.owner (user_id) values ('<auth.users.id>');
create table if not exists private.owner (
  id boolean primary key default true check (id),
  user_id uuid not null
);

alter table private.owner enable row level security;
-- No policies: only the SECURITY DEFINER function below reads the table.
revoke all on table private.owner from anon, authenticated;
revoke all on schema private from anon, authenticated;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.owner o
    where o.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_owner() from public, anon;
-- Policies are evaluated as the calling role, so it needs schema usage and function execute.
grant usage on schema private to authenticated;
grant execute on function private.is_owner() to authenticated;

-- Public tables: RLS on, one policy per command for the authenticated owner.
do $$
declare
  t text;
begin
  foreach t in array array[
    'documents', 'document_revisions', 'assets', 'asset_revisions',
    'materials', 'models', 'app_state'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_owner', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_owner()))',
      t || '_select_owner', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert_owner', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_owner()))',
      t || '_insert_owner', t);

    execute format('drop policy if exists %I on public.%I', t || '_update_owner', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()))',
      t || '_update_owner', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete_owner', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.is_owner()))',
      t || '_delete_owner', t);
  end loop;
end
$$;

-- Storage buckets (all private).
insert into storage.buckets (id, name, public)
values
  ('thumbnails', 'thumbnails', false),
  ('reference-images', 'reference-images', false),
  ('textures', 'textures', false),
  ('models', 'models', false),
  ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "planner_objects_select_owner" on storage.objects;
create policy "planner_objects_select_owner" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('thumbnails', 'reference-images', 'textures', 'models', 'photos')
    and (select private.is_owner())
  );

drop policy if exists "planner_objects_insert_owner" on storage.objects;
create policy "planner_objects_insert_owner" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('thumbnails', 'reference-images', 'textures', 'models', 'photos')
    and (select private.is_owner())
  );

drop policy if exists "planner_objects_update_owner" on storage.objects;
create policy "planner_objects_update_owner" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('thumbnails', 'reference-images', 'textures', 'models', 'photos')
    and (select private.is_owner())
  )
  with check (
    bucket_id in ('thumbnails', 'reference-images', 'textures', 'models', 'photos')
    and (select private.is_owner())
  );

drop policy if exists "planner_objects_delete_owner" on storage.objects;
create policy "planner_objects_delete_owner" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('thumbnails', 'reference-images', 'textures', 'models', 'photos')
    and (select private.is_owner())
  );
