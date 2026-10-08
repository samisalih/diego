-- A NULL expected version must conflict, not pass: `<>` yields NULL for NULL input, so use
-- `is distinct from`. Functions are otherwise identical to 20261008160000_document_writes.sql;
-- create or replace keeps the existing grants.

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
  if v_doc.version is distinct from p_expected_version then
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
  if v_doc.version is distinct from p_expected_version then
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
  if v_doc.version is distinct from p_expected_version then
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

