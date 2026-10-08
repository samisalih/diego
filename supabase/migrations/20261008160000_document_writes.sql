-- Atomic document writes with revisions and undo/redo (docs/specs/editor.md section 1).
-- All functions are SECURITY INVOKER: RLS applies, so only the owner can call them successfully.
-- Snapshot shape everywhere: { name, apartment, items, lighting }.
--
-- Errors (sqlstate / message):
--   P0404 / document_not_found  document missing or soft-deleted
--   P0409 / version_conflict    expected version differs from the stored version

-- "Live revisions of a document ordered by id" (undo) and "oldest undone revision" (redo).
create index if not exists document_revisions_document_id_id_idx
  on public.document_revisions (document_id, id);

create or replace function public.save_document(
  p_id text,
  p_expected_version int,
  p_name text,
  p_apartment jsonb,
  p_items jsonb,
  p_lighting jsonb,
  p_created_by text
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc public.documents;
begin
  select * into v_doc
  from public.documents
  where id = p_id and deleted_at is null
  for update;

  if not found then
    raise exception 'document_not_found' using errcode = 'P0404';
  end if;
  if v_doc.version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0409';
  end if;

  -- First save: keep the pre-change state as the baseline to undo back to.
  if not exists (select 1 from public.document_revisions where document_id = p_id) then
    insert into public.document_revisions (document_id, snapshot, created_by)
    values (
      p_id,
      jsonb_build_object(
        'name', v_doc.name, 'apartment', v_doc.apartment,
        'items', v_doc.items, 'lighting', v_doc.lighting),
      'user');
  end if;

  -- No branching history: a new save drops everything that was undone.
  delete from public.document_revisions where document_id = p_id and undone_at is not null;

  update public.documents
  set name = p_name, apartment = p_apartment, items = p_items, lighting = p_lighting,
      version = version + 1
  where id = p_id
  returning version into v_doc.version;

  insert into public.document_revisions (document_id, snapshot, created_by)
  values (
    p_id,
    jsonb_build_object(
      'name', p_name, 'apartment', p_apartment, 'items', p_items, 'lighting', p_lighting),
    p_created_by);

  return v_doc.version;
end;
$$;

create or replace function public.undo_document(p_id text, p_expected_version int)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc public.documents;
  v_live bigint[];
  v_snapshot jsonb;
begin
  select * into v_doc
  from public.documents
  where id = p_id and deleted_at is null
  for update;

  if not found then
    raise exception 'document_not_found' using errcode = 'P0404';
  end if;
  if v_doc.version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0409';
  end if;

  -- Two newest live revisions: [newest, previous].
  select array_agg(id order by id desc) into v_live
  from (
    select id from public.document_revisions
    where document_id = p_id and undone_at is null
    order by id desc
    limit 2
  ) r;

  if coalesce(array_length(v_live, 1), 0) < 2 then
    return null;
  end if;

  update public.document_revisions set undone_at = now() where id = v_live[1];
  select snapshot into v_snapshot from public.document_revisions where id = v_live[2];

  update public.documents
  set name = v_snapshot ->> 'name', apartment = v_snapshot -> 'apartment',
      items = v_snapshot -> 'items', lighting = v_snapshot -> 'lighting',
      version = version + 1
  where id = p_id
  returning version into v_doc.version;

  return v_doc.version;
end;
$$;

create or replace function public.redo_document(p_id text, p_expected_version int)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc public.documents;
  v_revision_id bigint;
  v_snapshot jsonb;
begin
  select * into v_doc
  from public.documents
  where id = p_id and deleted_at is null
  for update;

  if not found then
    raise exception 'document_not_found' using errcode = 'P0404';
  end if;
  if v_doc.version <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0409';
  end if;

  -- The oldest undone revision is the next one to re-apply.
  select id, snapshot into v_revision_id, v_snapshot
  from public.document_revisions
  where document_id = p_id and undone_at is not null
  order by id
  limit 1;

  if v_revision_id is null then
    return null;
  end if;

  update public.document_revisions set undone_at = null where id = v_revision_id;

  update public.documents
  set name = v_snapshot ->> 'name', apartment = v_snapshot -> 'apartment',
      items = v_snapshot -> 'items', lighting = v_snapshot -> 'lighting',
      version = version + 1
  where id = p_id
  returning version into v_doc.version;

  return v_doc.version;
end;
$$;

create or replace function public.document_history_state(p_id text)
returns table (can_undo boolean, can_redo boolean)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
  select
    count(*) filter (where r.undone_at is null) >= 2,
    count(*) filter (where r.undone_at is not null) >= 1
  from public.document_revisions r
  where r.document_id = p_id;
end;
$$;

-- Callable by the signed-in owner only. Supabase default privileges grant new public functions
-- to anon, so revoke explicitly (revoke from public alone does not remove those grants).
revoke all on function public.save_document(text, int, text, jsonb, jsonb, jsonb, text) from public, anon;
revoke all on function public.undo_document(text, int) from public, anon;
revoke all on function public.redo_document(text, int) from public, anon;
revoke all on function public.document_history_state(text) from public, anon;

grant execute on function public.save_document(text, int, text, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.undo_document(text, int) to authenticated;
grant execute on function public.redo_document(text, int) to authenticated;
grant execute on function public.document_history_state(text) to authenticated;
