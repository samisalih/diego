# Implementation plan — photorealistic 3D apartment planner

Status: signed off 2026-10-08 (D1–D6). Phase a in progress.
Research date for all versions and vendor facts: 2026-10-08.

---

## 0. Decisions that need a go

| # | Topic | Proposal | Section |
|---|---|---|---|
| D1 | OAuth for the MCP server | Supabase Auth **OAuth 2.1 Server** (beta) + DCR, own consent page in the web app | 7 |
| D2 | Path tracing | Work mode stays on WebGL; photo mode uses the new **WebGPUPathTracer** in its own canvas; deprecated WebGLPathTracer as fallback | 6 |
| D3 | Sharing `packages/core` with Deno | Core stays TypeScript source; the edge function is bundled into one file with core inside before deploy | 3 |
| D4 | Mood layer | `shaders` (WebGPU only) as overlay; CSS fallback for grain/vignette without WebGPU | 11 |
| D5 | Deviations from the data model in the brief | `version`, `undone_at`, `trash_dependents`, `ai_busy_until` — see 4.2 | 4 |
| D6 | Look & feel | `docs/design.md` = Night Signal for the UI chrome only, nothing over the viewport; state vocabulary agreed | 12 |

---

## Setup and tooling

- **Supabase is managed through the Supabase MCP**, configured project-scoped in `.mcp.json` (set up by
  you). The hosted Supabase project is the development database; no local Docker stack is required.
- Migrations still live as files in `supabase/migrations/` (source of truth in git) and are applied with
  the MCP's `apply_migration`; advisors are checked after every schema change. Edge functions are deployed
  via the MCP as well (single bundled file, see section 3).
- Every other service that offers an MCP is connected the same way, through `.mcp.json`.
- Secrets (service keys, OAuth settings) never go into the repo — `.env.local` for the web app,
  function secrets in Supabase.

---

## 1. Repository layout

```
/
├─ apps/
│  ├─ web/                         Vite + React + TS (strict)
│  │  ├─ src/
│  │  │  ├─ app/                   routing (hash router), providers, shortcut registry
│  │  │  ├─ platform/              platform layer (web implementation now, Electron later)
│  │  │  ├─ data/                  supabase client, realtime subscriptions, stores (zustand)
│  │  │  ├─ scene/                 R3F: apartment, items, parts, materials, lighting, sky
│  │  │  │  ├─ render-work/        realtime pipeline (postprocessing)
│  │  │  │  └─ render-photo/       path tracer
│  │  │  ├─ editor/                toolbar, tree, inspector, time bar, library bar, measure tool
│  │  │  ├─ workshop/              asset workshop (stage, parts tree, sliders, reference images)
│  │  │  ├─ documents/             overview, pager viewer, trash
│  │  │  ├─ library/               material + model import (Poly Haven, ambientCG, photos, GLB)
│  │  │  ├─ mood/                  <MoodLayer />
│  │  │  ├─ oauth/                 consent page for the MCP OAuth flow
│  │  │  └─ i18n/de.ts             every visible UI string, German
│  │  └─ vite.config.ts            base: './'
│  └─ desktop/                     placeholder (README only) — Electron comes later
├─ packages/
│  └─ core/                        shared by web AND the MCP edge function
│     └─ src/
│        ├─ schemas/               zod: apartment, item, lighting, asset, part, material, model, app-state, export
│        ├─ ids.ts                 prefixed readable ids (doc_, item_, asset_, …)
│        ├─ toon.ts                encode/decode wrapper around @toon-format/toon
│        ├─ formula/               Pratt parser + evaluator (no eval), dependency extraction, cycle check
│        ├─ asset/                 resolve params + formulas → concrete parts; clamp params to ranges
│        ├─ geometry/              polygon area, point-in-polygon, room assignment, OBB collision,
│        │                         clearances, passage width, blocked openings, wall collision
│        ├─ layout-check.ts        check_layout report (used by UI markers and MCP write responses)
│        ├─ sun.ts                 sun position from time, season→date, latitude, northAngle
│        ├─ lighting.ts            kelvin→RGB, lumen→candela/watts, golden hour, presets
│        ├─ operations/            pure document/asset mutations (place, update, remove, upsert apartment…)
│        └─ export/                export bundle, format detection, tolerant import, content hash
├─ supabase/
│  ├─ config.toml                  incl. [auth.oauth_server]
│  ├─ migrations/
│  ├─ seed.sql                     generated from packages/core seed data (see 4.5)
│  └─ functions/
│     ├─ mcp/                      remote MCP server (Streamable HTTP, stateless)
│     │  ├─ index.ts
│     │  ├─ deno.json              npm: specifiers for local Deno runs
│     │  ├─ tools/                 one file per tool group
│     │  └─ instructions.md        server instructions (English)
│     ├─ library-import/           server-side fetch of Poly Haven / ambientCG / URLs → Storage
│     └─ purge-trash/              daily job: hard-delete rows with deleted_at < now() - 30 days
├─ docs/
│  ├─ plan.md                      this file
│  ├─ design.md                    provided by you — binding
│  └─ glossary.md                  German UI term → English identifier
├─ pnpm-workspace.yaml
└─ README.md
```

Rule for the split: anything that both the UI and Claude must compute identically (validation,
formulas, collisions, sun position, mutations, TOON) lives in `packages/core`. Nothing in core
touches the DOM, three.js, Supabase or Deno APIs.

---

## 2. Stack and versions

Rendering (web):

| Package | Version | Use |
|---|---|---|
| three | 0.186.x (pinned) | renderer, materials |
| @react-three/fiber | 9.8.x (React 19) | scene graph in React |
| @react-three/drei | 10.7.x | controls, helpers, contact shadows |
| @react-three/postprocessing / postprocessing | 3.1.x / 6.39.x | work-mode effects (WebGL only) |
| n8ao | 2.x (via `<N8AO>`) | ambient occlusion, `halfRes` |
| three-gpu-pathtracer | 0.0.26 (pinned) | photo mode |
| three-mesh-bvh | 0.9.x | BVH for path tracer, raycasts, first-person collisions |
| zustand | 5.x | UI state |
| react-router | 7.x, hash router | routing that works from `file://` |

Shared / backend:

| Package | Version | Use |
|---|---|---|
| zod | 4.x | schemas in core |
| @toon-format/toon | 4.1.1 | TOON encode/decode (`encode`, `decode`, option `indentSize`, `delimiter`) |
| suncalc | 2.1.1 (pinned — v2 changed units to degrees) | sun position |
| @modelcontextprotocol/server (official TS SDK) | latest at phase f | MCP server, stateless |
| @supabase/server, @supabase/middleware | latest at phase f | OAuth protected-resource metadata + token check in the edge function |
| fflate | latest | unzip ambientCG downloads in the edge function |
| @gltf-transform/core + functions | 4.5.x | GLB optimisation (browser worker) |

Formula evaluation: **hand-written Pratt parser** (~120 lines). `expr-eval` has an unpatched
remote-code CVE (CVE-2025-13204), `mathjs` is far too heavy. The parser supports numbers,
parameter names, `+ - * / ^`, parentheses, unary minus and `min max round floor ceil abs clamp`.
It also returns the identifiers a formula uses, which gives cycle detection for free.

---

## 3. Sharing `packages/core` between Vite and Deno (D3)

**Solution:** core is plain TypeScript source; the edge function is bundled into one file before deploy.

- All relative imports inside core carry an explicit `.ts` extension. Deno requires that; Vite and
  TypeScript accept it with `allowImportingTsExtensions` + `noEmit` (`moduleResolution: bundler`).
- Core's npm dependencies are imported by bare name (`zod`, `@toon-format/toon`, `suncalc`).
  - Web: Vite consumes the TS source through the workspace dependency `"@app/core": "workspace:*"`.
  - Edge function: a small esbuild script bundles `supabase/functions/mcp/index.ts` together with core
    into one ESM file. npm packages stay external and are rewritten to pinned `npm:` specifiers, so Deno
    loads them itself. The output is a single file — it deploys the same way through the Supabase MCP,
    the CLI or the dashboard, and needs no experimental flags or imports from outside `supabase/`.
  - Local debugging: `deno run` against the unbundled source works directly, because core is valid
    Deno TypeScript.
- A check script keeps the npm versions in `packages/core/package.json` and the bundle's `npm:`
  specifiers identical.

---

## 4. Data model (Supabase)

### 4.1 Tables

Kept as flat as the brief asks. All ids are `text` with prefix (`doc_…`), generated in core
(prefix + 10 chars base36), so the UI and Claude can create ids before the insert.

```sql
documents (
  id text primary key,               -- doc_…
  name text not null,
  source text not null check (source in ('user','ai','import')),
  apartment jsonb not null,
  items jsonb not null default '[]',
  lighting jsonb not null,
  thumbnail_path text,
  thumbnail_rendered_at timestamptz,
  version int not null default 1,    -- optimistic concurrency (D5)
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

document_revisions (
  id bigint generated always as identity primary key,
  document_id text not null references documents on delete cascade,
  snapshot jsonb not null,           -- { name, apartment, items, lighting } after the change
  created_by text not null check (created_by in ('user','ai')),
  undone_at timestamptz,             -- undo/redo pointer (D5)
  created_at timestamptz not null default now()
)

assets (
  id text primary key,               -- asset_…
  name text not null,
  category text not null,
  params jsonb not null default '[]',
  parts jsonb not null default '[]',
  reference_images jsonb not null default '{}',   -- { front, side, top }: path, opacity, calibration
  thumbnail_path text,
  content_hash text not null,        -- for import dedup
  version int not null default 1,
  trash_dependents jsonb,            -- what was removed with it (D5)
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

asset_revisions (same shape as document_revisions, asset_id instead of document_id)

materials (
  id text primary key,               -- mat_…
  name text not null,
  source text not null check (source in ('polyhaven','ambientcg','photo')),
  source_id text,
  license text not null,             -- 'CC0' for both providers; photo → 'own'
  source_url text,
  maps jsonb not null,               -- { baseColor, normal, roughness, metalness, ao, displacement? } → storage paths
  tile_size real not null,           -- metres per tile
  tint text,                         -- hex
  roughness_factor real not null default 1,
  thumbnail_path text,
  content_hash text not null,
  trash_dependents jsonb,
  deleted_at timestamptz,
  created_at …, updated_at …
)

models (
  id text primary key,               -- model_…
  name text not null,
  source text not null check (source in ('upload','polyhaven','url')),
  source_id text, license text,
  storage_path text not null,
  bounding_box jsonb not null,       -- { min:[x,y,z], max:[x,y,z] } metres
  content_hash text not null,
  trash_dependents jsonb,
  deleted_at timestamptz,
  created_at …, updated_at …
)

app_state (                          -- exactly one row, id = 1
  id int primary key check (id = 1),
  mode text, active_document_id text, active_asset_id text,
  editor_view text, render_mode text, photo_resolution jsonb,
  camera jsonb,                      -- { position, target, focalLength }
  focus_id text, selection jsonb,
  workshop_camera text, workshop_light text,
  measurement_overlay jsonb,         -- list of { from, to } lines
  ai_busy_until timestamptz,         -- (D5)
  updated_at timestamptz
)
```

### 4.2 Deviations from the brief (D5)

- **`version`** on documents and assets. You and Claude can edit the same document at the same time.
  Every write is `update … where version = $expected`; on mismatch the writer reloads and reapplies the
  operation. Prevents silent overwrites.
- **`undone_at`** on revisions. Undo marks the newest live revision as undone and restores the snapshot
  before it; redo clears the mark. A new change after an undo deletes the undone revisions (no
  branching history). The same mechanism serves the UI buttons and the MCP `undo`/`redo` tools.
- **`trash_dependents`**. Deleting an asset that is used in documents removes its items from those
  documents and stores them here (`[{ documentId, items }]`). Restore puts them back. For materials:
  the asset parts and rooms that referenced it fall back to a neutral default material and are listed
  here; for models: the asset parts. One column instead of a separate trash table.
- **`ai_busy_until`** instead of a boolean. If an MCP call crashes midway, a boolean stays `true`
  forever. The server sets `now() + 30 s` at the start of each write and clears it at the end; the UI
  shows "Claude arbeitet …" while the timestamp is in the future.
- **`content_hash`** on assets, materials, models — the import dedup the brief asks for.
- **`import_status` + `fallback_color`** on materials: texture files are imported asynchronously; until
  they are ready the renderer uses the fallback colour.
- **`meta.longitude` + `meta.timeZone`** in the apartment: needed to turn "19 Uhr im Winter" (local
  wall-clock time incl. DST) into the correct sun position.
- **Owner**: the first account created becomes the owner automatically (trigger on `auth.users`).

### 4.3 jsonb shapes

Exactly as in the brief (apartment with `meta`, `rooms[]`, `walls[]`, `openings[]`; items; lighting;
asset `params[]` and `parts[]`). zod schemas in core are the single definition; the database stores
what they accept. Additional details:

- Part transform is flattened for TOON: `x y z rx ry rz w h d` instead of nested objects, plus
  `bevel` (radius), `shape`, `materialId`, and shape-specific fields (`profile` for lathe/extrude,
  `fill` for cushion, `modelId` + `scaleMode` for model). Any numeric field may be a string starting
  with `=` (formula).
- Lamp parts: `lightLumens`, `lightKelvin`, `lightType` (`point` | `spot` | `area`).
- Each item carries a flag for clamped parameter values, so the tree can mark them (brief: "Item im
  Baum markieren").

### 4.4 RLS and auth

- Supabase Auth, email + password (or magic link), **public sign-ups disabled**, one user.
- Every table has RLS enabled with one policy: `to authenticated using (private.is_owner())` where
  `is_owner()` compares `auth.uid()` to the single owner id stored in a private table. This also covers
  tokens that claude.ai receives through OAuth, because those are normal Supabase JWTs for the same user.
- Storage buckets `thumbnails`, `reference-images`, `textures`, `models`, `photos` — private, same policy.
  The web app loads files through signed URLs, cached.
- Realtime publication on all tables.
- `purge-trash` runs daily via `pg_cron` and hard-deletes rows (and their storage files) whose
  `deleted_at` is older than 30 days.

### 4.5 Migrations and seed

1. `0001_tables.sql` — tables, constraints, indexes (`deleted_at`, `document_id, created_at`).
2. `0002_rls.sql` — `private.is_owner()`, policies, storage buckets and policies.
3. `0003_realtime.sql` — publication.
4. `0004_revisions.sql` — `updated_at` triggers.
5. `0005_cron.sql` — trash purge schedule.

Seed (generated by a core script so it is validated by the zod schemas before it is written):
- One document "Musterwohnung", ~55 m²: living room, bedroom, kitchen, bathroom, hallway, with
  walls, windows, a balcony door, interior doors; `latitude` 51.0, `northAngle` 0.
- CC0 materials: oak floorboards, tiles, wall paint, linen, oak, brass — real Poly Haven / ambientCG
  ids, downloaded into Storage by `pnpm seed:assets` (one-off script that calls `library-import`).
- Parametric assets: sofa, bed 160, shelf, dining table, chair, floor lamp — with bevels, cushions and
  formulas, so they look right from the start.

---

## 5. Platform layer (`apps/web/src/platform/`)

One interface, one web implementation now, one Electron implementation later via a preload bridge.
The rest of the app imports only `platform`.

```ts
interface Platform {
  files: {
    open(options: { accept: string[]; multiple?: boolean }): Promise<PickedFile[]>;
    save(options: { suggestedName: string; data: Blob | string }): Promise<void>;
  };
  clipboard: { readText(): Promise<string>; writeText(text: string): Promise<void> };
  cache: { get<T>(key: string): T | null; set(key: string, value: unknown): void; remove(key: string): void };
  window: { setTitle(title: string): void };
  links: { openExternal(url: string): void };
  config: { supabaseUrl: string; supabaseAnonKey: string; mcpUrl: string; authRedirectUrl: string };
}
```

- Web: File System Access API with `<input type=file>` / download-link fallback, `navigator.clipboard`,
  `localStorage` (offline cache of the last loaded state), `document.title`, `window.open`, config from
  `import.meta.env`.
- Desktop-ready elsewhere in the app:
  - hash router, Vite `base: './'`, no absolute URLs anywhere;
  - central shortcut registry (`app/shortcuts.ts`) — id, default key, German label, handler; used for the
    `?` overview and later for the Electron menu; never binds OS-reserved keys (Cmd+Q, Cmd+W, Cmd+H, Cmd+M);
  - auth redirect read from config, so it can later become a deep link (`wohnungsplaner://auth`);
  - no Node APIs in the frontend.

---

## 6. Rendering

### 6.1 Work mode (realtime, WebGL)

- `WebGLRenderer` via R3F. Reason: the pmndrs post-processing stack (AO, SMAA, bloom, tone mapping) is
  WebGL only, and drei's mature helpers are too. Moving the whole app to WebGPU today would mean
  rebuilding that stack in TSL.
- Effects: N8AO (half resolution), SMAA, subtle bloom, tone mapping as the **last** effect (only one
  place tone-maps).
- **Tone mapping: AgX.** In interiors the windows are far brighter than the room; AgX rolls those
  highlights off gracefully instead of clipping them to flat white, and keeps wood and paint colours
  closer to reality than ACES, which adds contrast and darkens. Neutral and ACES remain available as an
  internal setting for comparison.
- Sky: three.js `Sky` (Preetham), synced to the sun. On every sun change it is baked once into an
  environment map (PMREM) that lights the scene and serves as background. Below the windows a simple
  ground plane, so the view outside is never empty.
- Sun: one directional light with soft shadow maps, the only shadow caster by default (lamp shadows via
  toggle). The ceiling is invisible in dollhouse view but still casts shadows, so light enters through
  the windows.
- Contact shadows under furniture; floor reflections via a low-resolution `MeshReflectorMaterial` on
  glossy floors only.
- Glass: `transmission` with reduced transmission resolution on window panes; if the 60 fps budget is
  missed, work mode falls back to a thin transparent glass and only photo mode uses real transmission.
- Geometry: walls are generated from wall segments with openings cut out (extruded 2D wall profile with
  holes), with proper UVs in metres so `tile_size` maps 1:1. Boxes use rounded/bevelled geometry.
- Performance: drei `PerformanceMonitor` lowers AO quality and pixel ratio before frames drop; measured
  in phase b on the seed apartment.

### 6.2 Photo mode — path tracing (D2)

Facts (2026-10-08):
- `three-gpu-pathtracer` 0.0.25 (end of September 2026) introduced a new **WebGPUPathTracer** and
  deprecated the old `WebGLPathTracer` ("will be removed in a future release"). The WebGL one is still
  shipped in 0.0.26.
- The WebGPU tracer brings what the brief needs: progressive samples with a live sample counter,
  physical camera with depth of field, an optional **denoiser** (OIDN) — the main lever for "usable
  image after a few seconds" — and `maxSamples` for stop/continue.
- The R3F wrapper `@react-three/gpu-pathtracer` is unmaintained since mid-2025 and wraps only the old
  tracer. Not usable.

Proposal:
- Photo mode opens its own canvas over the viewport with a **WebGPURenderer** and the
  **WebGPUPathTracer**, fed with the same three.js scene graph that R3F builds for work mode. The work
  canvas pauses while the photo renders (editing is locked anyway). A small custom component owns the
  tracer — no wrapper.
- Camera: `PhysicalCamera`, focal lengths 24 / 35 / 50 mm on a full-frame sensor, optional depth of
  field (f-stop + focus distance, click to focus). Moving the camera resets the samples.
- Environment: the same baked sky map as work mode, blurred for faster convergence; the sun as a
  directional light.
- Output: chosen resolution, sample counter, stop/continue, PNG download through the platform layer.
- Desktop only. WebGPU runs in current Chrome, Edge, Safari and Firefox on desktop, and in Electron.
- **Fallback:** if the WebGPU tracer proves too young in the phase-h spike (two days against the seed
  interior with glass and lamps), photo mode uses the pinned `WebGLPathTracer` on the existing WebGL
  renderer and migrates later. Both tracers share the same input (scene + env map + camera), so the
  switch is local to one component.

Why not the whole app on WebGPU now: the realtime effect stack would have to be rebuilt in TSL. This
can still happen later without touching data, core or UI — the scene components stay the same.

---

## 7. MCP server and OAuth (D1)

### 7.1 OAuth proposal

Supabase Auth now ships an **OAuth 2.1 authorization server** (beta, all plans, no extra cost) with an
official guide for MCP authentication. That is the recommended route:

1. Switch the project's JWT signing key to asymmetric (ES256). Required — the MCP flow rejects legacy
   HS256 tokens.
2. Enable the OAuth server, set the authorization path to `/#/oauth/consent` of the web app.
3. Enable dynamic client registration (DCR). claude.ai registers itself.
4. Build the consent page in the web app (login if needed, show client + scopes, approve/deny).
5. The edge function wraps the MCP handler in `withOAuthProtectedResource()` (serves RFC 9728 metadata,
   answers 401 with `WWW-Authenticate: Bearer resource_metadata=…`) and `withSupabase({ auth: 'user' })`
   (verifies the token, gives a user-scoped client — RLS applies). `verify_jwt = false` for this function,
   because the middleware does the check.
6. claude.ai: Settings → Connectors → Add custom connector → URL `https://<ref>.supabase.co/functions/v1/mcp`,
   OAuth client option "Register automatically". Approve on the consent page.

Why not alternatives: a self-built OAuth server is more code and more security surface; Cloudflare's
OAuth provider would move the server off Supabase; a static bearer header is beta in claude.ai and not
OAuth.

Known risk: the Supabase OAuth server is beta and the audience handling between the `resource`
parameter and the token `aud` has to be verified end to end. Phase f starts with a spike: MCP Inspector
+ a real claude.ai connection against a hello-world tool, before any real tool is written.

### 7.2 Server shape

- Official TypeScript MCP SDK, Streamable HTTP, **stateless** (a fresh server per request — fits edge
  functions; claude.ai needs no sessions).
- Read responses are TOON. Errors are JSON-like objects `{ error, field, value, allowed }`, encoded as
  TOON as well.
- Every write tool:
  1. sets `ai_busy_until`;
  2. loads the target, applies the pure operation from `packages/core/operations`;
  3. validates with zod; on failure returns field / value / allowed;
  4. writes with the `version` check and inserts a revision with `created_by = 'ai'`;
  5. runs `checkLayout` on the affected document and appends the warnings to the response;
  6. clears `ai_busy_until`.
- Batch everywhere: lists in, lists out.

### 7.3 Tools (36)

Read (TOON):
| Tool | Input |
|---|---|
| `get_app_state` | — |
| `list_documents` | `source?`, `includeTrashed?` |
| `get_document` | `documentId?` (default active), `include?: ('apartment'\|'items'\|'lighting')[]` |
| `list_assets` | `category?`, `search?` |
| `get_asset` | `assetId` |
| `list_materials` | `search?`, `source?` |
| `list_models` | `search?` |
| `get_usage` | `id` (asset / material / model) → documents + counts |
| `check_layout` | `documentId?` |
| `list_trash` | — |

Documents:
`create_document`, `duplicate_document`, `rename_document`, `delete_document`, `restore_from_trash`
(any trashed id), `empty_trash` (`confirm: true` required), `import_document` (`content`, `format?`),
`export_document` (`documentId`, `format: 'toon'|'json'`).

Apartment + items:
`update_apartment` (`documentId?`, `upsert: { meta?, rooms?, walls?, openings? }`, `remove: { rooms?, walls?, openings? }`),
`place_items`, `update_items`, `remove_items` (always lists).

Assets, materials, models:
`create_asset`, `update_asset` (upsert/remove for params and parts + meta; `confirm` when used in more
than one document), `delete_asset`, `delete_material`, `delete_model` (first call returns usage, second
with `confirm: true` deletes), `search_library_materials` (`provider`, `query`), `import_material`
(`provider` + `sourceId`, or `imageUrl` + `tileSize`), `update_material` (tint, roughness, tile size;
`confirm` rule as for assets), `import_model` (`url` or Poly Haven id), `set_reference_image`.

App control:
`navigate`, `set_view`, `set_render_mode`, `set_lighting`, `select`, `show_measurement`, `undo`, `redo`.

### 7.4 Server instructions

Shipped in the `initialize` response (English, ~1.5k tokens): units and coordinates, id prefixes, asset
anatomy with all shapes and the formula syntax, material workflow, behaviour rules from the brief
(active document by default, confirm rule, prefer library materials, give edges a bevel, layout warnings,
revisions), and the photo setup guide (measured beats estimated, `estimated: true`, derive materials from
photos and propose library matches, ask for missing key measurements, end with a list of what to measure).

### 7.5 Later, without rework: `get_snapshot`

The app already uploads thumbnails and photos to Storage. `get_snapshot` will ask the app (via
`app_state`) for a capture, wait for the upload, and return it as an MCP image content block. Nothing in
the current design blocks this.

---

## 8. Material and model library

- **Poly Haven**: public API with CORS; the edge function `library-import` downloads the 2K JPG maps
  (diffuse, nor_gl, rough, ao; metal where present) with a unique `User-Agent`, as their API terms require,
  and stores them in `textures/`. CC0, no attribution required for self-hosted copies.
- **ambientCG**: no CORS → server-side only; download the 2K-JPG zip, unzip with fflate, map the files to
  our map keys, store. CC0.
- **Own photo**: in the browser — square crop, make seamless (mirror-blend the edges), derive a rough
  normal map (Sobel on luminance) and roughness map (inverted, contrast-stretched luminance), upload,
  enter the real tile size in cm.
- Textures max 2K. Compression to KTX2 (Basis) runs in a **web worker in the open app**, not in the
  edge function: Supabase edge functions have a ~2 s CPU budget per request, which is enough for
  downloading and storing files but not for image encoding. Until the compressed variant exists the
  app uses the 2K JPGs. Measured in phase d; if GPU memory is fine with JPGs, KTX2 is dropped.
- The edge function `library-import` only downloads and stores (I/O, no heavy CPU). Anything
  CPU-heavy (texture compression, GLB optimisation) is done by the web app in a worker; imports
  triggered by Claude are picked up by the open app.
- **Models**: GLB upload or URL / Poly Haven id; optimised in the browser worker with gltf-transform
  (prune, dedup, meshopt, textures resized to 2K); store the bounding box. Models are only ever used as `model` parts inside assets.

---

## 9. Lighting

- Sun: `sun.ts` turns time + season date (15 Jan / 15 Apr / 15 Jul / 15 Oct) + latitude + `northAngle`
  into a direction in scene coordinates. Colour and intensity follow the sun's altitude (warmer and weaker
  near the horizon, zero below it).
- Sky: physical sky synchronised to the sun; it also provides the environment light (see 6).
- Golden hour is computed (sun altitude between −4° and +6° in the evening), not fixed.
- Presets (`morningCoffee`, `noon`, `goldenHour`, `cozyEvening`, `movieNight`) live in core with
  time + effects; German labels in `de.ts`.
- Lamps: lumens and kelvin per light part; kelvin → RGB (Tanner Helland approximation), lumens → candela
  for three's physical units. Lampshades use a translucent material so light passes through. Lamps default
  to off.
- Camera-style exposure: physically based light units, exposure set like a camera (EV), so a sunny
  noon and a lamp-lit evening both look right without hand-tuning.

---

## 10. Phases

Each phase ends with: everything runs, tests green, a short summary to you, waiting for your go.
Implementation follows the chain test-agent → coding-agent → code-review-agent. Every phase lives on its
own worktree branch and is merged only after your sign-off.

| Phase | Content | Done when |
|---|---|---|
| a | Monorepo, `packages/core` (schemas, ids, TOON, geometry, formulas, sun, layout check, operations), migrations, seed, platform layer (web), bundle script for edge functions | `pnpm test` green (incl. JSON→TOON→JSON roundtrip), migrations + seed applied to the Supabase project via MCP, a hello function using core is deployed and answers |
| b | Work-mode rendering: walls with openings, floors/ceilings, PBR materials, sky + sun, shadows, AO, glass, dollhouse view, realtime sync | seed apartment renders at 60 fps on a laptop; a DB change shows up live |
| c | Editor: toolbar, side panel (tree + inspector), move/rotate/duplicate/delete items, collisions, distances, revisions, undo/redo | every inspector field writes a revision; undo/redo round-trips |
| d | Material + model library: Poly Haven, ambientCG, own photos, GLB import | a material from each source and one GLB land in Storage and render |
| e | Library bar + asset workshop: shapes, formulas with fx and live errors, sliders, reference images, material picker, place/done flow | the six seed assets can be rebuilt in the workshop |
| f | MCP server + OAuth spike + all tools + claude.ai connector guide | MCP Inspector passes every tool; claude.ai connects and builds a shelf live |
| g | Lighting: time bar, seasons, presets, lamps | presets and lamps behave as specified |
| h | Photo mode: path tracing, camera, PNG export | usable image in seconds, clean image under a minute |
| i | First-person walk-through + measuring tape | WASD, collisions, doors passable, measurements from UI and Claude |
| j | Documents view: overview, pager, trash, thumbnails | all card actions, trash restore incl. dependents |
| k | Export / import | TOON + JSON, dedup by hash, error messages with line/field |
| l | Mood layer | WebGPU overlay with fallback |

---

## 11. Mood layer (D4)

The `shaders` package (v4, MIT, from `shaders/react`) is **WebGPU only** — without WebGPU its canvas
stays transparent. Its effects (FilmGrain, Vignette, LightLeak, Halftone) are filters that wrap a child
layer (image, video, HTML). Applying them on top of a separate three.js canvas is not documented.

Plan:
- `<MoodLayer />` as a transparent overlay canvas with `pointer-events: none`, effects driven by the preset.
- Spike in phase l: overlay mode (generative layers with blend mode over the scene) vs. feeding the
  scene canvas as an input layer. Pick what works.
- For the finished photo: the PNG is a plain image, so it can be passed as `ImageTexture` — this path is
  documented and safe.
- Without WebGPU: CSS grain + vignette as a cheap fallback, LightLeak and Halftone are omitted.

---

## 12. Look & feel (D6)

`docs/design.md` is binding: Night Signal for the UI chrome, nothing on top of the 3D viewport, tool
layout instead of poster layout, and the agreed state vocabulary (selected, estimated, collision,
locked, hidden, adjusted value, "Claude arbeitet …", photo rendering, in trash). Fonts are self-hosted.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| Supabase OAuth server is beta; audience handling with claude.ai unverified | spike at the start of phase f, before any tool code |
| 60 fps with transmission glass, soft shadows and AO on a laptop | performance budget per effect, adaptive quality (drei `PerformanceMonitor`), measured in phase b |
| Concurrent edits by you and Claude | `version` column + reapply |
| Mood layer WebGPU only | CSS fallback; layer is purely optional |
| WebGPU path tracer is only days old | two-day spike in phase h; pinned WebGL tracer as fallback |
| OAuth consent URL with a hash router (`/#/oauth/consent?authorization_id=…`) | verified in the phase-f spike; otherwise a tiny static `oauth-consent.html` outside the router |
