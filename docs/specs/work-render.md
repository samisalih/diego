# Spec: phase b — work-mode rendering

Contract for phase b of `docs/plan.md` (section 6.1, phase table row b). Test-agent and coding-agent
both work from this file. Units: metres, degrees, hours. UI strings are German and live in
`apps/web/src/i18n/de.ts`; everything else is English. Look & feel: `docs/design.md` (binding).

**Done when** (from the plan): the seed apartment renders at 60 fps on a laptop, and a database change
shows up live without a reload.

---

## 0. Scope

In scope:
- app shell with a login gate (the database is owner-only, nothing is readable without a session);
- data layer: load the active document with its assets and materials, keep it in sync via Realtime;
- scene: walls with openings, floors, ceilings, window glass, furniture from resolved assets, PBR
  materials from material rows, sky + sun, soft shadows, AO, tone mapping, dollhouse orbit view;
- a dev-only fixture mode that renders the core seed data without a database;
- adaptive quality to hold 60 fps.

Out of scope (later phases): selection, editing, outlines and state markers (c); texture maps from
Storage and GLB models (d) — materials render from their scalar values only, `model` parts render as
a placeholder box; workshop (e); lamps — light parts render their geometry but emit no light (g);
time bar UI (g); photo mode (h); first-person view (i); documents view (j); mood layer (l).

---

## 1. Module layout (`apps/web/src/`)

```
app/            App.tsx (routing + login gate), routes
auth/           LoginScreen.tsx, session hook
data/           supabase client, row mappers, store (zustand), realtime sync, fixture loader
scene/
  build/        pure builders: no React, no WebGL context; three.js math/geometry classes are allowed
  Viewport.tsx  <Canvas> + scene graph
  ...           Apartment, Items, Sky/Sun, Effects, DollhouseControls
styles/         tokens.css (Night Signal CSS variables, design.md §12.1), fonts.css, base.css
i18n/de.ts
```

Rule: everything that can be computed without a GPU lives in `scene/build/` or `data/` and is unit
tested. React components stay thin and only wire builders to R3F.

---

## 2. Data layer (`data/`)

### 2.1 Row mapping
DB rows are snake_case, core types are camelCase. `data/mappers.ts`:
- `documentFromRow(row)` → `{ id, name, source, apartment, items, lighting, version, updatedAt }`,
  content validated with core's `documentContentSchema`; invalid content → throws a `RowValidationError`
  carrying the row id and core's validation issues.
- `assetFromRow(row)` → core `Asset` + `version`; `materialFromRow(row)` → core `Material`;
  `appStateFromRow(row)` → core `AppState`.
- Rows with `deleted_at` set are treated as absent.

### 2.2 Store
`data/store.ts` — one zustand store, plain data only:

```ts
SceneData = {
  appState: AppState | null;
  document: PlannerDocument | null;     // the active document
  assets: Map<string, Asset>;           // by id
  materials: Map<string, Material>;     // by id
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}
```

Pure reducer functions (exported and tested without zustand). They take raw snake_case DB rows
(as delivered by Realtime) and map them internally; delete events carry only `{ id }`. The mappers
return `null` for soft-deleted rows. `RowValidationError` has `rowId` and `issues` (core validation
issues).
- `applyDocumentChange(state, change)` — `change = { type: "upsert" | "delete", row }`. Upsert replaces
  the active document only if `row.id === state.appState.activeDocumentId` and `row.version >=
  current.version` (stale events are ignored). Soft delete (`deleted_at` set) or delete of the active
  document → `document = null`.
- `applyAssetChange`, `applyMaterialChange` — upsert/delete in the map; soft-deleted rows are removed.
- `applyAppStateChange` — replaces `appState`; if `activeDocumentId` changed, the caller reloads the
  document (the reducer returns `{ state, needsDocumentReload: boolean }`).

### 2.3 Loading and sync
- Initial load: `app_state` (id 1) → active document → all non-deleted assets and materials.
- Realtime: one channel subscribing to `postgres_changes` on `documents`, `assets`, `materials`,
  `app_state`; events go through the reducers above. On channel reconnect (`SUBSCRIBED` after an
  error/close) the full initial load runs again, so nothing missed while offline stays missed.
- After every successful load/apply the store snapshot is written to `platform.cache` (key
  `scene-data`); on start-up, a cached snapshot is shown immediately while the network load runs.
- A database change must be visible in the viewport within 2 s, without reload.

### 2.5 Sync merge rules (`data/sync.ts`, pure, tested)
The race-free order between the initial load and Realtime:
- The channel is subscribed first. The full load starts on the **first** `SUBSCRIBED` and again on
  every `SUBSCRIBED` that follows an error/close. Every load gets an increasing sequence number; only
  the result of the newest load is applied, older results are dropped.
- Changes that arrive while a load is in flight are buffered (in arrival order, tagged with their
  table). When the load resolves, `mergeLoadResult(loaded: SceneData, buffered: TableChange[])` →
  `{ state, needsDocumentReload }` replays them through the reducers on top of the loaded state.
  `TableChange = { table: "documents" | "assets" | "materials" | "app_state"; change: RowChange }`.
- The cached snapshot always loses against a load result (it is only a placeholder until the first
  load lands).
- Document reload after an `app_state` switch: `acceptReloadedDocument(state, loaded)` applies the
  loaded document only when `loaded.id === state.appState?.activeDocumentId` and not older than a
  document with the same id already in the state; otherwise the state is returned unchanged.
- Reducer corrections: `applyDocumentChange` compares versions only when the ids match;
  `applyAppStateChange` sets `document` to `null` when `activeDocumentId` changes (the reload fills it).
- Cache snapshot: key `scene-data:v1`; `parseCachedScene(raw: unknown)` → `SceneData | null`
  validates every document/asset/material/app state with the core schemas and returns `null` for
  anything invalid (the snapshot is then discarded). The cache is cleared on every `SIGNED_OUT` auth
  event, not only on the sign-out button.

### 2.4 Fixture mode
Only when `import.meta.env.DEV` and the URL hash route carries `?fixture=seed`: the store is filled
from core's `SEED_DOCUMENT`, `SEED_ASSETS`, `SEED_MATERIALS` with `appState` defaults; no Supabase
calls, no login gate. Used for screenshots and the fps measurement. Must not exist in production
builds (dead-code eliminated behind `import.meta.env.DEV`).

---

## 3. Auth (`auth/`, `app/`)

- Supabase email + password sign-in (`signInWithPassword`); session persisted by supabase-js.
- Without a session the app shows the login screen; with one, the editor route with the viewport.
- Login screen: Night Signal form (design.md §6.9) on `--ink`, fields "E-Mail" and "Passwort", button
  "Anmelden"; error toast/inline text in German for wrong credentials and for network errors. No
  sign-up link (sign-ups are disabled). A "Abmelden" control exists somewhere small in the chrome.
- If a signed-in user is not the owner, every table reads empty: the app shows a German empty-state
  message ("Kein Zugriff auf Daten …") instead of a broken scene.

---

## 4. Scene builders (`scene/build/`)

Coordinate system: plan `(x, z)` = world `(x, z)`, `y` up, floor at `y = 0`, ceiling at
`meta.ceilingHeight`. Return values are three.js `BufferGeometry` (or plain data); no materials or
renderer objects in builders unless stated.

### 4.1 Walls — `walls.ts`
`buildWallGeometry(wall, walls, openings, ceilingHeight)` → `BufferGeometry`:
- a box along the wall's centre line from start to end, `thickness` deep, `0..ceilingHeight` high;
- every opening of that wall (`opening.wallId === wall.id`) is a rectangular hole through the full
  thickness: along the wall from `offsetFromStart` to `offsetFromStart + width`, vertically from
  `sillHeight` to `sillHeight + height` (clamped to the ceiling); hole reveals (the inner faces of the
  hole) are part of the geometry;
- UVs in metres on every face (1 UV unit = 1 m), so a material with `tileSize` t repeats every t m;
- normals pointing outwards; the geometry has a `groups`-free single index.
- Corners: a wall end that joins another wall (the end point lies within 1 mm of another wall's
  end point or of its centre line) is extended along the wall direction and gets no end cap; the
  extension length, cap and top-face rules are defined in `docs/specs/editor.md` section 7 (L-joint:
  half the other wall's thickness; T-joint: `min(own, other) / 2`). Opening offsets stay relative to
  the original wall start. `buildWallGeometry` therefore takes the full wall list:
  `buildWallGeometry(wall, walls, openings, ceilingHeight)`.

### 4.2 Floors and ceilings — `rooms.ts`
- `buildFloorGeometry(room)` → flat polygon at `y = 0`, normal `+y`, UVs = world `(x, z)` in metres.
- `buildCeilingGeometry(room, ceilingHeight)` → same polygon at `y = ceilingHeight`, normal `−y`.
- Polygons may be concave; winding order of the input must not matter.

### 4.3 Openings — `openings.ts`
`buildOpeningFixtures(wall, opening)` → plain data describing what to render in the hole:
- `window`: a frame (4 bars, 0.06 m wide, 0.07 m deep, centred in the wall thickness) and one glass pane
  filling the inside of the frame, 0.01 m thick;
- `balconyDoor`: same as a window over the full opening height;
- `door`: frame only (3 bars: two sides + top); no door leaf in phase b.
Each fixture: `{ kind: "frame" | "glass", position: [x, y, z], rotationY: number (radians), size:
[w, h, d] }` in world space.

### 4.4 Materials — `materials.ts`
`materialParams(material | undefined)` → `{ color: [r, g, b] (linear 0..1); roughness; metalness;
}`:
- colour = sRGB `fallbackColor`, multiplied by sRGB `tint` when present, converted to linear;
- `roughness = clamp(roughnessFactor, 0, 1)`; `metalness = metalnessFactor ?? 0`;
- missing material (unknown id or `null`) → neutral light grey `#c8c4bc`, roughness 0.8, metalness 0.
- glass: `glassParams()` → transmission material values used for panes (transmission 1, roughness 0.05,
  ior 1.5, thickness 0.01).

### 4.5 Furniture — `parts.ts`, `items.ts`
`buildPartGeometry(part: ResolvedPart)` → `BufferGeometry` sized to the part's `w × h × d` box and
centred on the origin (position and rotation are applied by the caller):
- `box`: rounded box with radius `min(bevel, w/2, h/2, d/2)`; `bevel = 0` → plain box;
- `cylinder`: axis = y, radius `w/2` in x and `d/2` in z (elliptical via scale), height `h`;
- `sphere`: ellipsoid with radii `w/2, h/2, d/2`;
- `capsule`: axis = y, radius `min(w, d)/2`, total height `h`;
- `torus`: ring in the x/z plane, outer extent `w × d`, tube radius `tube ?? h/2`;
- `plane`: `w × d` rectangle, normal `+y`, at the box centre;
- `cushion`: rounded box with radius `min(bevel, …)` whose top and bottom faces bulge outwards by
  `fill · min(h, 0.1) / 2` (default `fill` 0.5); the bulge lies outside the `h` box, so the geometry's
  height is `h + fill · min(h, 0.1)` (accepted: it is visual only, layout checks use the resolved box);
- `lathe`: lathe of `profile` (`[radius, y]`, y from 0 at the part bottom to `h` at the top) around y,
  shifted by `−h/2` so it is centred;
- `extrude`: closed `[x, y]` outline extruded along z by `d`, centred in z;
- `model`: plain box placeholder (phase d replaces it).
Degenerate sizes (≤ 0) are clamped to 0.01 m; builders never throw.

`buildItemParts(item, asset)` → list of `{ partId, shape, geometryKey, position: [x, y, z],
rotation: [rx, ry, rz] (radians, order XYZ), materialId }` in **asset space**, using core's
`resolveAsset(asset, item.params)`. The item group is placed at world `(item.x, 0, item.z)` with
y-rotation `item.rotation` (degrees → radians, three.js convention as in core spec §3.2). Hidden
items and items whose asset is missing are skipped (missing assets are reported once to the console,
not as a crash). `geometryKey` is a stable string of shape + all geometry-relevant numbers, so equal
parts share one geometry (cache).

### 4.6 Sun and sky — `sun.ts`
`sunSetup({ lighting, meta, year })` → `{ direction: Vec3; altitudeDeg; color: [r, g, b];
intensity: number; isNight: boolean; skyParams: { turbidity, rayleigh, mieCoefficient,
mieDirectionalG, sunPosition: Vec3 } }`:
- direction from core's `sunPosition` with `lighting.time`, `lighting.season`, `meta` location and
  `northAngle`; colour and illuminance from core's `sunLight`;
- `intensity` = illuminance mapped into three's units for a `DirectionalLight` (look up the current
  three.js convention; with physically based units, intensity is illuminance in lux) multiplied by a
  scene exposure factor (see 5.4);
- `isNight` when altitude < −0.83°; then sun intensity is 0 and the sky is a dark night gradient.

### 4.7 Framing — `framing.ts`
`apartmentBounds(apartment)` → `{ min: [x, y, z], max: [x, y, z], center, radius }` over all walls
(including thickness) and rooms. `dollhouseCamera(bounds)` → `{ position, target, fov }` looking at the
centre from the south-east at ~45° elevation, distance chosen so the whole bounds fit with 10 % margin.

---

## 5. Rendering (`scene/`)

### 5.1 Renderer
- R3F `<Canvas>` with WebGL (not WebGPU), `shadows="percentage"` (PCF; three r186 removed
  `PCFSoftShadowMap`), `dpr` adaptive `[1, 2]`,
  output colour space sRGB, renderer tone mapping **off** — tone mapping happens once, as the last
  post-processing effect.
- Viewport fills the space next to the (later) side panel; in phase b it fills the window. Nothing is
  drawn over the viewport (design.md §A).

### 5.2 Scene content
- Walls with the wall material of the room they bound (the first room whose polygon edge lies on the
  wall centre line, else neutral); floors/ceilings with the room materials.
- **Dollhouse view:** ceilings are invisible to the camera but still cast shadows (shadow-only
  rendering), so sunlight only enters through the windows.
- Window/balcony-door glass uses the glass material; frames use the opening's `frameMaterialId`.
- Furniture from 4.5, every mesh casts and receives shadows; materials from 4.4.
- A ground plane outside the apartment (large, neutral, receives shadows) so the view through the
  windows is never empty.
- Contact shadows under furniture (drei `ContactShadows` or equivalent), low resolution.

### 5.3 Sun, sky, environment
- One `DirectionalLight` from 4.6, the only shadow caster; shadow camera fitted to the apartment
  bounds; shadow map 2048² (lowered by adaptive quality).
- three.js `Sky` (Preetham) driven by `skyParams`; on every sun change the sky is rendered once into a
  PMREM environment map that is used as `scene.environment` and `scene.background`. Not re-baked every
  frame.

### 5.4 Effects and exposure
- Post-processing (pmndrs): N8AO at half resolution, SMAA, subtle bloom (high threshold, only
  emissive/very bright pixels), tone mapping **AgX** as the last effect.
- Exposure: one scene exposure value chosen like a camera so that a sunny noon interior is neither
  blown out nor dark; at night the exposure rises so the scene is dim but readable. Keep the mapping in
  a pure, tested function `exposureForSun(altitudeDeg)` in `scene/build/sun.ts`.
- Light levels: `lightingLevels(sun: SunSetup)` in `scene/build/sun.ts` (pure, tested) returns
  `{ sunIntensity, environmentIntensity, backgroundIntensity, hemisphereIntensity,
  hemisphereSkyColor, hemisphereGroundColor }`. Every intensity in the scene comes from here (no
  literals in components). All values ≥ 0 and finite; at night environment and hemisphere stay > 0
  (dim but readable); values change continuously across the horizon (no jump between −1° and +1°).
- **Colour fidelity:** the apartment's colours must read true — oak looks like warm wood, beige tiles
  look beige, linen looks warm off-white. The blue sky must not tint the interior: the environment
  used for *lighting* (`scene.environment`) is neutral (e.g. a PMREM of a neutral room/studio
  environment, warmed slightly by the sun colour); the Preetham sky is used as *background* only.
- Empty apartment (no walls, no rooms): `apartmentBounds` returns fallback bounds centred on the origin
  (radius 5 m) instead of NaN.
- Glass: real `transmission` on panes with reduced transmission resolution; when adaptive quality drops
  to the lowest level, panes switch to thin transparent glass without transmission.

### 5.5 Adaptive quality
drei `PerformanceMonitor`: on decline, step down in this order — dpr 2 → 1.5 → 1, AO quality,
shadow map 2048 → 1024, transmission → plain transparent glass; step back up on incline. The current
level is kept in the store (not persisted).

### 5.6 Dollhouse controls
Orbit controls (drei) around `dollhouseCamera` target: damping on, polar angle limited to 10°–85°, zoom
limited to `[0.3·radius, 3·radius]`, pan limited to the apartment bounds. If `appState.camera` is set,
it is used as the initial camera instead.

---

## 6. Performance acceptance

Measured in fixture mode on this MacBook in the built-in browser, window ~1440×900, after 3 s warm-up:
continuous orbit for 10 s. Pass: median frame time ≤ 16.7 ms and p95 ≤ 25 ms, at whatever adaptive
level the monitor settles on, with dpr ≥ 1. The measurement script is a small dev-only hook
(`window.__fps` or similar) or a browser-side `requestAnimationFrame` probe; numbers go into the phase
summary.

## 7. Live sync acceptance

With the owner signed in: an `update public.documents set items = …, version = version + 1` that moves
the sofa by 1 m, run through the Supabase MCP, moves the sofa in the open viewport within 2 s without
reload. Same for a material colour change (`fallback_color`).

## 8. Tests (vitest, `apps/web/test/`)

Unit tests cover `data/mappers.ts`, the reducers in `data/store.ts`, and every builder in
`scene/build/` (geometry bounds, hole counts/positions via bounding boxes and vertex checks, UV scale in
metres, normals, part shape sizes, item transforms incl. rotation convention, hidden/missing assets,
geometry key stability, sun mapping incl. night, exposure monotonicity, framing fits bounds). Seed data
from `@app/core` is the main fixture. No WebGL context in tests.
