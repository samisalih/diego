# Spec: phase c — editor

Contract for phase c of `docs/plan.md` (phase table row c, §4.2 D5, §5 shortcut registry). Test-agent,
coding-agent and supabase-backend work from this file. Units: metres, degrees. UI strings German in
`apps/web/src/i18n/de.ts`; everything else English. Look & feel: `docs/design.md` (binding — §A and the
state vocabulary in §B). Builds on `docs/specs/work-render.md` (phase b).

**Done when** (from the plan): every inspector field writes a revision; undo/redo round-trips.

---

## 0. Scope

In scope:
- atomic document writes with optimistic concurrency and revisions, undo/redo — in the database, so the
  UI now and the MCP server in phase f share one implementation;
- client write path: operation → validate → optimistic update → save → reapply on version conflict;
- selection (viewport + tree, shared via `app_state.selection`);
- move (drag on the floor), rotate, duplicate, delete, lock, hide for items;
- side panel with tree and inspector; toolbar; central shortcut registry with a `?` overview;
- layout feedback from core's `checkLayout`: collision / narrow passage / blocked opening / outside room
  in viewport, tree and inspector;
- distance lines from the selected item to the surrounding walls;
- "Claude arbeitet …" chip while `app_state.ai_busy_until` is in the future;
- the deferred wall-joint fix from phase b (work-render spec §4.1 "Known limits").

Out of scope: editing the apartment geometry in the UI (walls, rooms, openings are created by Claude via
MCP in phase f; the UI shows them read-only), placing new items from the library (phase e), material
picker (phase e), lamps (phase g), measuring tape tool (phase i), documents view (phase j).

---

## 1. Database: revisions and undo/redo (migration, supabase-backend)

New migration `supabase/migrations/<timestamp>_document_writes.sql`. All functions `language plpgsql`,
`security invoker` (RLS applies — only the owner can call them successfully), `set search_path = ''`,
execute revoked from `public, anon`, granted to `authenticated`. Snapshot shape everywhere:
`{ "name", "apartment", "items", "lighting" }`.

### 1.1 `public.save_document(p_id text, p_expected_version int, p_name text, p_apartment jsonb, p_items jsonb, p_lighting jsonb, p_created_by text) returns int`
1. Lock the row (`select … for update`); missing or soft-deleted → raise `document_not_found`.
2. `version <> p_expected_version` → raise exception with message `version_conflict` and
   `errcode = 'P0409'` (custom), nothing written.
3. If the document has **no** revisions yet: insert a baseline revision with the **current** (pre-change)
   snapshot, `created_by = 'user'`.
4. Delete all revisions of the document with `undone_at is not null` (no branching history).
5. Update name/apartment/items/lighting, `version = version + 1`.
6. Insert a revision with the new snapshot and `p_created_by` (`'user' | 'ai'`).
7. Return the new version.

### 1.2 `public.undo_document(p_id text, p_expected_version int) returns int`
- Version check as above (`version_conflict`).
- Live revisions = `undone_at is null`, ordered by `id`. Fewer than 2 live revisions → return `null`
  (nothing to undo, nothing written).
- Mark the newest live revision `undone_at = now()`; restore the snapshot of the previous live revision
  into the document; `version + 1`; return the new version.

### 1.3 `public.redo_document(p_id text, p_expected_version int) returns int`
- Version check.
- No undone revision → return `null`.
- The **oldest** undone revision (lowest `id` with `undone_at is not null`): clear `undone_at`, restore its
  snapshot into the document, `version + 1`, return the new version.

### 1.4 `public.document_history_state(p_id text) returns table (can_undo boolean, can_redo boolean)`
`can_undo` = at least 2 live revisions; `can_redo` = at least one undone revision. Used for the toolbar
button states (refetched after every write and on Realtime document events).

### 1.5 Verification
A SQL test script `supabase/tests/document_writes.sql` (written by test-agent) runs inside
`begin; … rollback;` through the Supabase MCP and raises on any failed assertion: baseline creation,
version conflict leaves the row unchanged, undo/redo round-trip restores exactly the previous snapshots,
a save after undo deletes the undone revisions, undo at the baseline returns null, redo with nothing
undone returns null, `created_by` stored. Advisors must be clean afterwards.

---

## 2. Client write path (`apps/web/src/data/`)

### 2.1 `documentWriter.ts` (pure core + injected I/O, tested)
```ts
type ContentOperation = (content: DocumentContent, assets: Asset[]) => OperationResult<DocumentContent>;
commitOperation(deps, operation, options?) → Promise<CommitResult>
CommitResult = { ok: true; version: number } | { ok: false; reason: "invalid"; issues: ValidationIssue[] }
             | { ok: false; reason: "conflict" | "network" | "notFound"; message: string }
```
- `deps` = `{ getDocument(): PlannerDocument | null; getAssets(): Asset[]; applyLocal(doc): void;
  save(args): Promise<number>; reload(): Promise<PlannerDocument | null> }` (injected; real
  implementation uses the store, `supabase.rpc("save_document", …)` and a single-document fetch).
- Flow: run the operation on the current document content → `ok: false` → return `invalid` with the
  issues, nothing written, no local change. Otherwise apply the result locally at once (optimistic,
  version unchanged), then `save` with the expected version. On success apply the returned version
  locally. On `version_conflict`: `reload()`, rerun the **same operation** on the fresh content, try
  again — at most 3 attempts, then return `conflict` and restore the reloaded document locally. Network
  error → return `network`, restore the last server state locally.
- Writes are serialised: a second `commitOperation` while one is in flight waits for it (queue), so
  rapid edits never race each other.
- `undo()` / `redo()` in the same module: rpc with the expected version, same conflict handling (reload
  and retry once), no optimistic update (the Realtime echo or the returned version + reload brings the
  new content).

### 2.2 Realtime echo
The store reducer already accepts a document event whose version is ≥ the local one; after a local save
the echo carries the same content and version — no flicker. Remote edits (Claude) arrive the same way.

### 2.3 History state
`useHistoryState()` → `{ canUndo, canRedo }` from `document_history_state`, refreshed after every
commit/undo/redo and on every document Realtime event (debounced 150 ms).

---

## 3. Selection and interaction (`apps/web/src/editor/`)

### 3.1 Selection (`selection.ts`, pure reducer, tested)
- State: ordered list of selected ids (items only in phase c; rooms/walls/openings can be *focused* in
  the tree for read-only inspection — `focusId`).
- Actions: `select(id)` (replace), `toggle(id)` (Shift/Cmd-click), `clear()`, `prune(existingIds)`
  (drops ids that no longer exist, e.g. after a remote delete).
- Written to `app_state.selection` / `focus_id` (debounced 300 ms, no revision — app state is not
  document content); incoming `app_state` changes from Claude update the local selection.

### 3.2 Viewport picking and drag (`drag.ts` pure math, tested)
- Click on a furniture mesh selects its item (Shift/Cmd toggles); click on empty floor or sky clears.
  Picking ignores walls, ceilings, ground.
- Pointer-down on a **selected, unlocked** item and drag moves all selected unlocked items on the floor
  plane (y = 0). Orbit controls are disabled during the drag.
- `dragDelta(startFloorPoint, currentFloorPoint)` → `[dx, dz]`; positions snap to 0.01 m; holding Shift
  snaps to 0.1 m. `floorPointFromRay(origin, direction)` → point on y = 0 or `null` (ray parallel/away).
- During the drag only the local preview changes (no write, no revision). On pointer-up one
  `updateItems` commit with the final positions → exactly **one revision per drag**. A drag shorter than
  0.005 m is treated as a click (no write).
- Locked items: drag does nothing; the cursor shows `not-allowed`.

### 3.3 Commands (all through `commitOperation`, each = one revision)
| Command | Core operation | Default shortcut |
|---|---|---|
| Rotate +90° / −90° | `updateItems` rotation | `R` / `Shift+R` |
| Duplicate | `duplicateItems` (offset 0.1, 0.1); selection moves to the copies | `Cmd/Ctrl+D` |
| Delete | `removeItems`; selection cleared | `Delete`, `Backspace` |
| Lock / unlock (toggle) | `updateItems` locked | `L` |
| Hide / show (toggle) | `updateItems` hidden | `H` |
| Undo / Redo | `undo_document` / `redo_document` | `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` |
| Clear selection | — | `Escape` |
| Shortcut overview | — | `?` |
Commands that need a selection are disabled without one. Locked items reject rotate (core issue);
the UI shows the German message as a toast and does not write.

### 3.4 Shortcut registry (`app/shortcuts.ts`, tested)
List of `{ id, keys: string[], label (German, from de.ts), run }`. One keydown listener on `window`;
ignored while focus is in an input/textarea/select or contenteditable; `Cmd` on macOS / `Ctrl`
elsewhere; never binds Cmd+Q/W/H/M. `matchShortcut(event, registry, platform)` is pure and tested. The `?`
overview is a small dialog listing every shortcut (Night Signal panel, closes with Escape).

---

## 4. Side panel, toolbar, chips (`apps/web/src/editor/`)

Layout: top bar (existing) → toolbar row → main area = viewport (left, flexible) + side panel (right,
320 px, flat ink surface with a hairline left edge, scrolls independently). Nothing over the canvas.

### 4.1 Toolbar
Undo, Redo (disabled from history state), Duplicate, Delete, Lock, Hide (disabled without selection),
`?` button. Icon buttons with German `aria-label` and tooltip showing the shortcut. Right side: the
"Claude arbeitet …" LED chip (design §B) while `ai_busy_until > now()` (re-evaluated every second).

### 4.2 Tree
- Header: document name (inline rename on double-click → `renameDocument` commit; a new core operation
  `setDocumentName(content, name)` 1..120 chars).
- Group "Möbel": every item, label = item name ?? asset name; state markers per design §B — locked (lock
  icon), hidden (40 % + struck eye), clamped params (mustard dot), layout issue (red dot); click selects,
  Shift/Cmd-click toggles; selected rows use the selected look.
- Group "Räume": rooms with name and area (m², core `polygonArea`, 1 decimal); under each room its walls
  (length) and openings (type + width); estimated entries marked (dashed mustard). Click focuses them for
  read-only inspection.

### 4.3 Inspector
- Nothing selected and nothing focused: document summary (rooms count, items count, total floor area).
- One item selected — every field is editable and commits on blur / Enter / slider release (one
  revision per committed change, none while dragging a slider):
  - Name (text, empty → `null`, falls back to the asset name);
  - Position X, Z (m, 2 decimals, step 0.01); Rotation (°, step 1, normalised by core);
  - one slider + number field per asset param (range, step, unit from the asset; value outside range is
    clamped by core); adjusted values (≠ default) show the mustard dot; clamped params listed;
  - Gesperrt, Ausgeblendet (LED-dot checkboxes);
  - layout issues of this item as a German list (see 5.2).
- Several items selected: count, and the bulk actions (duplicate, delete, lock, hide); no field editing.
- A focused room / wall / opening: read-only facts (name, area / length, thickness, type, width, height,
  sill height, estimated flag).
- Locked item: position/rotation fields disabled, with the lock hint.

---

## 5. Layout feedback

### 5.1 Computation
`checkLayout(content, assetsById)` from core, memoised on document version + assets. Pure mapper
`issuesBySubject(issues)` → `Map<id, LayoutIssue[]>` (both `subjectId` and `objectId` get the issue;
tested).

### 5.2 German issue texts (`i18n/de.ts`)
- collision: „Kollidiert mit {name}“ (item or „Wand“)
- narrowPassage: „Durchgang zu schmal: {value} cm“ (value in cm, rounded)
- blockedOpening: „Blockiert {Tür|Fenster|Balkontür}“
- outsideRoom: „Steht außerhalb eines Raums“
- clampedParam: „Regler angepasst: {keys}“
- unknownAsset: „Möbelvorlage fehlt“
(adjustedParam is shown as the mustard dot, not as a text.)

### 5.3 Viewport states (design §B)
- Selected: blue outline (`--blue-bright`) around the item.
- Collision / blocked opening / outside room: red outline (`--red`) when not selected. A selected item
  with such an issue keeps the blue outline and additionally gets a red footprint rectangle on the
  floor, so both states stay visible.
- Narrow passage: red measurement line between the two obstacles with the gap in cm.
- Hidden: not rendered (already in phase b).
- Outlines via post-processing `Outline` effect (pmndrs) or an inverted-hull mesh — whichever keeps the
  60 fps budget; one implementation for both colours.

---

## 6. Distance lines (core + viewport)

### 6.1 Core: `itemClearances(content, assets, itemId)` (new, `packages/core/src/geometry/clearance.ts`, tested)
- For the item's OBB (core `itemObb`): from the midpoint of each of its 4 sides, a ray along the side's
  outward normal in the plan; distance to the first wall OBB face hit (walls only, openings ignored —
  a ray through an opening span continues to the next wall); max 20 m, no hit → no entry.
- Returns `{ side: "front" | "back" | "left" | "right"; distance: number; from: Vec2; to: Vec2;
  wallId: string }[]` (front = local +z).
- Exported from `@app/core` (used by Claude in phase i too).

### 6.2 Viewport
While exactly one item is selected (and live during its drag), draw the clearance lines on the floor
(thin cream lines, 1 cm above the floor) with a small label in cm at the midpoint. Labels are scene
annotations (drei `Html` or sprite text), not chrome. Distances < 0.3 m use `--mustard`.

---

## 7. Wall joints (deferred from phase b)

Replace the "half of its own thickness" rule (work-render spec §4.1):
- L-joint (two wall **end points** meet): each end is extended by half the **other** wall's thickness.
- T-joint (an end lies on another wall's centre line, not at its end): the end is extended by
  `min(own, other) / 2`.
- End caps and the top face over the extension are not generated at joined ends (avoids coplanar faces
  with the joined wall); free ends keep their caps.
Update the phase b spec section accordingly; tests in `walls.test.ts`.

---

## 8. Performance
The phase b budget holds while dragging: median ≤ 16.7 ms, p95 ≤ 25 ms in fixture mode during a drag of
the sofa (dev-only drag simulation hook is fine). Layout check and clearances run at most once per
animation frame during a drag.

## 9. Acceptance (manual + automated)
1. Every inspector field change, drag, rotate, duplicate, delete, lock, hide and rename creates exactly
   one revision (checked in the DB via MCP).
2. Undo after each of them restores the previous state; redo restores it again; a new change after undo
   discards the redo stack.
3. A change by "Claude" (simulated via `save_document` with `created_by = 'ai'` through the MCP while the
   UI is open) appears live; a UI edit started on the old version reapplies on top of it (no lost edit).
4. Collision and narrow passage show up in viewport, tree and inspector when the sofa is dragged into the
   floor lamp / close to the wall.
5. Fixture mode keeps working read-only-friendly: writes in fixture mode apply locally only (no
   Supabase), undo/redo disabled.
