-- Assertion script for the document write functions (docs/specs/editor.md section 1.5):
--   save_document, undo_document, redo_document, document_history_state.
--
-- How to run: execute the whole file in ONE call (e.g. Supabase MCP execute_sql, as role postgres, RLS bypassed).
-- Everything happens inside begin ... rollback, so nothing is left behind, not even on success.
-- The first failed assertion raises 'ASSERTION FAILED: <label>' and aborts the script (the rollback then
-- happens implicitly). On success the last statement returns one row 'document_writes: all assertions passed'.
--
-- The script creates its own scratch document 'doc_test_writes_1' and does not depend on auth.uid().
-- Note: errors raised inside a plpgsql exception block roll that block back, so "the row is unchanged after a
-- version conflict" is checked after the failed call, which is what a client observes as well.
--
-- Document content used below is deliberately tiny. A snapshot is
--   { "name": text, "apartment": { "marker": text }, "items": [...], "lighting": { "t": int } }
-- built by pg_temp.snap(name, marker, items, t).

begin;

-- ---------------------------------------------------------------------------------------------------------------
-- Helpers (session-local, vanish with the transaction)
-- ---------------------------------------------------------------------------------------------------------------

create function pg_temp.assert_true(p_ok boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_ok is distinct from true then
    raise exception 'ASSERTION FAILED: %', p_label;
  end if;
end;
$$;

-- Snapshot in the shape the functions store in document_revisions.snapshot.
create function pg_temp.snap(p_name text, p_marker text, p_items jsonb, p_t int)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'name', p_name,
    'apartment', jsonb_build_object('marker', p_marker),
    'items', p_items,
    'lighting', jsonb_build_object('t', p_t)
  );
$$;

-- Current content of the scratch document as a snapshot.
create function pg_temp.row_snapshot()
returns jsonb
language sql
as $$
  select jsonb_build_object('name', d.name, 'apartment', d.apartment, 'items', d.items, 'lighting', d.lighting)
  from public.documents d
  where d.id = 'doc_test_writes_1';
$$;

create function pg_temp.row_version()
returns int
language sql
as $$
  select d.version from public.documents d where d.id = 'doc_test_writes_1';
$$;

-- All revision snapshots, oldest first.
create function pg_temp.revision_snapshots()
returns jsonb
language sql
as $$
  select coalesce(jsonb_agg(r.snapshot order by r.id), '[]'::jsonb)
  from public.document_revisions r
  where r.document_id = 'doc_test_writes_1';
$$;

-- undone flags of all revisions, oldest first, e.g. [false, false, true].
create function pg_temp.revision_undone_flags()
returns jsonb
language sql
as $$
  select coalesce(jsonb_agg(r.undone_at is not null order by r.id), '[]'::jsonb)
  from public.document_revisions r
  where r.document_id = 'doc_test_writes_1';
$$;

-- created_by of all revisions, oldest first.
create function pg_temp.revision_authors()
returns jsonb
language sql
as $$
  select coalesce(jsonb_agg(r.created_by order by r.id), '[]'::jsonb)
  from public.document_revisions r
  where r.document_id = 'doc_test_writes_1';
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Fixture: scratch document at version 1 without any revision
-- ---------------------------------------------------------------------------------------------------------------

insert into public.documents (id, name, source, apartment, items, lighting)
values (
  'doc_test_writes_1', 'N0', 'user',
  '{"marker": "a0"}'::jsonb, '[]'::jsonb, '{"t": 0}'::jsonb
);

do $$
begin
  perform pg_temp.assert_true(pg_temp.row_version() = 1, 'fixture starts at version 1');
  perform pg_temp.assert_true(pg_temp.revision_snapshots() = '[]'::jsonb, 'fixture starts without revisions');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. First save: baseline revision (pre-change snapshot, created_by user) + revision of the new state (created_by ai)
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  new_version int;
begin
  new_version := public.save_document(
    'doc_test_writes_1', 1, 'N1',
    '{"marker": "a1"}'::jsonb, '[{"id": "item_1"}]'::jsonb, '{"t": 1}'::jsonb, 'ai'
  );
  perform pg_temp.assert_true(new_version = 2, 'save returns the new version 2');
  perform pg_temp.assert_true(pg_temp.row_version() = 2, 'row version is 2 after the first save');
  perform pg_temp.assert_true(
    pg_temp.row_snapshot() = pg_temp.snap('N1', 'a1', '[{"id": "item_1"}]'::jsonb, 1),
    'row holds the saved content after the first save');
  perform pg_temp.assert_true(
    pg_temp.revision_snapshots() = jsonb_build_array(
      pg_temp.snap('N0', 'a0', '[]'::jsonb, 0),
      pg_temp.snap('N1', 'a1', '[{"id": "item_1"}]'::jsonb, 1)),
    'first save creates the baseline (pre-change snapshot) and the new revision, in that order');
  perform pg_temp.assert_true(
    pg_temp.revision_authors() = '["user", "ai"]'::jsonb,
    'created_by: baseline is user, the saved revision carries p_created_by (ai)');
  perform pg_temp.assert_true(
    pg_temp.revision_undone_flags() = '[false, false]'::jsonb,
    'no revision is undone after the first save');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Second save: no second baseline, created_by user stored
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  new_version int;
begin
  new_version := public.save_document(
    'doc_test_writes_1', 2, 'N2',
    '{"marker": "a2"}'::jsonb, '[{"id": "item_1"}, {"id": "item_2"}]'::jsonb, '{"t": 2}'::jsonb, 'user'
  );
  perform pg_temp.assert_true(new_version = 3, 'second save returns version 3');
  perform pg_temp.assert_true(
    jsonb_array_length(pg_temp.revision_snapshots()) = 3,
    'second save adds exactly one revision (no second baseline)');
  perform pg_temp.assert_true(
    pg_temp.revision_authors() = '["user", "ai", "user"]'::jsonb,
    'created_by of the second save is stored (user)');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Version conflict: errcode P0409, message version_conflict, row and revisions unchanged
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  caught_state text;
  caught_message text;
  before_snapshot jsonb := pg_temp.row_snapshot();
  before_revisions jsonb := pg_temp.revision_snapshots();
begin
  -- save with a stale expected version (current is 3)
  begin
    perform public.save_document(
      'doc_test_writes_1', 2, 'STALE',
      '{"marker": "stale"}'::jsonb, '[]'::jsonb, '{"t": 99}'::jsonb, 'user');
  exception when others then
    caught_state := sqlstate;
    get stacked diagnostics caught_message = message_text;
  end;
  perform pg_temp.assert_true(caught_state = 'P0409', 'stale save raises errcode P0409');
  perform pg_temp.assert_true(caught_message = 'version_conflict', 'stale save raises message version_conflict');
  perform pg_temp.assert_true(pg_temp.row_version() = 3, 'stale save leaves the version unchanged');
  perform pg_temp.assert_true(pg_temp.row_snapshot() = before_snapshot, 'stale save leaves the content unchanged');
  perform pg_temp.assert_true(pg_temp.revision_snapshots() = before_revisions, 'stale save writes no revision');

  -- undo with a stale expected version
  caught_state := null;
  caught_message := null;
  begin
    perform public.undo_document('doc_test_writes_1', 2);
  exception when others then
    caught_state := sqlstate;
    get stacked diagnostics caught_message = message_text;
  end;
  perform pg_temp.assert_true(caught_state = 'P0409' and caught_message = 'version_conflict', 'stale undo raises P0409 version_conflict');
  perform pg_temp.assert_true(pg_temp.row_version() = 3 and pg_temp.row_snapshot() = before_snapshot, 'stale undo changes nothing');

  -- redo with a stale expected version
  caught_state := null;
  caught_message := null;
  begin
    perform public.redo_document('doc_test_writes_1', 2);
  exception when others then
    caught_state := sqlstate;
    get stacked diagnostics caught_message = message_text;
  end;
  perform pg_temp.assert_true(caught_state = 'P0409' and caught_message = 'version_conflict', 'stale redo raises P0409 version_conflict');
  perform pg_temp.assert_true(pg_temp.row_version() = 3 and pg_temp.row_snapshot() = before_snapshot, 'stale redo changes nothing');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. document_history_state before any undo
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  state record;
begin
  select * into state from public.document_history_state('doc_test_writes_1');
  perform pg_temp.assert_true(state.can_undo is true, 'history state: can_undo with 3 live revisions');
  perform pg_temp.assert_true(state.can_redo is false, 'history state: no redo before any undo');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Undo twice: exact previous snapshots come back, version +1 each time
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  new_version int;
  state record;
begin
  new_version := public.undo_document('doc_test_writes_1', 3);
  perform pg_temp.assert_true(new_version = 4, 'first undo returns version 4');
  perform pg_temp.assert_true(pg_temp.row_version() = 4, 'first undo bumps the row version');
  perform pg_temp.assert_true(
    pg_temp.row_snapshot() = pg_temp.snap('N1', 'a1', '[{"id": "item_1"}]'::jsonb, 1),
    'first undo restores the exact previous snapshot');
  perform pg_temp.assert_true(
    pg_temp.revision_undone_flags() = '[false, false, true]'::jsonb,
    'first undo marks only the newest live revision as undone');
  select * into state from public.document_history_state('doc_test_writes_1');
  perform pg_temp.assert_true(state.can_undo is true and state.can_redo is true, 'history state after one undo: can undo and redo');

  new_version := public.undo_document('doc_test_writes_1', 4);
  perform pg_temp.assert_true(new_version = 5, 'second undo returns version 5');
  perform pg_temp.assert_true(
    pg_temp.row_snapshot() = pg_temp.snap('N0', 'a0', '[]'::jsonb, 0),
    'second undo restores the baseline snapshot exactly');
  perform pg_temp.assert_true(
    pg_temp.revision_undone_flags() = '[false, true, true]'::jsonb,
    'second undo marks the next newest live revision as undone');
  select * into state from public.document_history_state('doc_test_writes_1');
  perform pg_temp.assert_true(state.can_undo is false, 'history state at the baseline: cannot undo');
  perform pg_temp.assert_true(state.can_redo is true, 'history state at the baseline: can redo');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Undo at the baseline returns null and writes nothing
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  result int;
  before_revisions jsonb := pg_temp.revision_snapshots();
begin
  result := public.undo_document('doc_test_writes_1', 5);
  perform pg_temp.assert_true(result is null, 'undo at the baseline returns null');
  perform pg_temp.assert_true(pg_temp.row_version() = 5, 'undo at the baseline does not bump the version');
  perform pg_temp.assert_true(
    pg_temp.row_snapshot() = pg_temp.snap('N0', 'a0', '[]'::jsonb, 0),
    'undo at the baseline does not change the content');
  perform pg_temp.assert_true(pg_temp.revision_snapshots() = before_revisions, 'undo at the baseline changes no revision');
  perform pg_temp.assert_true(pg_temp.revision_undone_flags() = '[false, true, true]'::jsonb, 'undo at the baseline marks nothing');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Redo twice: oldest undone revision first, exact snapshots, back to the newest state
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  new_version int;
  state record;
begin
  new_version := public.redo_document('doc_test_writes_1', 5);
  perform pg_temp.assert_true(new_version = 6, 'first redo returns version 6');
  perform pg_temp.assert_true(
    pg_temp.row_snapshot() = pg_temp.snap('N1', 'a1', '[{"id": "item_1"}]'::jsonb, 1),
    'first redo restores the oldest undone revision (N1)');
  perform pg_temp.assert_true(
    pg_temp.revision_undone_flags() = '[false, false, true]'::jsonb,
    'first redo clears undone_at of the oldest undone revision only');

  new_version := public.redo_document('doc_test_writes_1', 6);
  perform pg_temp.assert_true(new_version = 7, 'second redo returns version 7');
  perform pg_temp.assert_true(
    pg_temp.row_snapshot() = pg_temp.snap('N2', 'a2', '[{"id": "item_1"}, {"id": "item_2"}]'::jsonb, 2),
    'second redo restores the newest snapshot (N2): undo/redo round trip is exact');
  perform pg_temp.assert_true(
    pg_temp.revision_undone_flags() = '[false, false, false]'::jsonb,
    'after two redos no revision is undone');
  select * into state from public.document_history_state('doc_test_writes_1');
  perform pg_temp.assert_true(state.can_undo is true and state.can_redo is false, 'history state after full redo: can undo, cannot redo');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 8. Redo with nothing undone returns null and writes nothing
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  result int;
  before_snapshot jsonb := pg_temp.row_snapshot();
begin
  result := public.redo_document('doc_test_writes_1', 7);
  perform pg_temp.assert_true(result is null, 'redo with nothing undone returns null');
  perform pg_temp.assert_true(pg_temp.row_version() = 7, 'redo with nothing undone does not bump the version');
  perform pg_temp.assert_true(pg_temp.row_snapshot() = before_snapshot, 'redo with nothing undone does not change the content');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 9. Save after undo deletes the undone revisions (no branching history)
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  new_version int;
  state record;
begin
  new_version := public.undo_document('doc_test_writes_1', 7);
  perform pg_temp.assert_true(new_version = 8, 'undo before the branching save returns version 8');
  perform pg_temp.assert_true(pg_temp.revision_undone_flags() = '[false, false, true]'::jsonb, 'one revision is undone before the branching save');

  new_version := public.save_document(
    'doc_test_writes_1', 8, 'N3',
    '{"marker": "a3"}'::jsonb, '[]'::jsonb, '{"t": 3}'::jsonb, 'user');
  perform pg_temp.assert_true(new_version = 9, 'save after undo returns version 9');
  perform pg_temp.assert_true(
    pg_temp.revision_snapshots() = jsonb_build_array(
      pg_temp.snap('N0', 'a0', '[]'::jsonb, 0),
      pg_temp.snap('N1', 'a1', '[{"id": "item_1"}]'::jsonb, 1),
      pg_temp.snap('N3', 'a3', '[]'::jsonb, 3)),
    'save after undo deletes the undone revision (N2) and appends the new one');
  perform pg_temp.assert_true(pg_temp.revision_undone_flags() = '[false, false, false]'::jsonb, 'no undone revision survives a save');
  select * into state from public.document_history_state('doc_test_writes_1');
  perform pg_temp.assert_true(state.can_redo is false, 'history state after the branching save: redo stack is gone');
  perform pg_temp.assert_true(state.can_undo is true, 'history state after the branching save: can undo');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 10. Missing and soft-deleted documents raise document_not_found
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare
  caught_message text;
begin
  begin
    perform public.save_document('doc_test_writes_missing', 1, 'X', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 'user');
  exception when others then
    get stacked diagnostics caught_message = message_text;
  end;
  perform pg_temp.assert_true(caught_message = 'document_not_found', 'save on a missing document raises document_not_found');

  update public.documents set deleted_at = now() where id = 'doc_test_writes_1';
  caught_message := null;
  begin
    perform public.save_document('doc_test_writes_1', 9, 'X', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 'user');
  exception when others then
    get stacked diagnostics caught_message = message_text;
  end;
  perform pg_temp.assert_true(caught_message = 'document_not_found', 'save on a soft-deleted document raises document_not_found');
  update public.documents set deleted_at = null where id = 'doc_test_writes_1';
end;
$$;

select 'document_writes: all assertions passed' as result;

rollback;
