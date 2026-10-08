-- Core tables of the apartment planner. RLS is enabled in 20261008120100_rls_storage.sql
-- (same deploy; no data is written between the two files).
-- All ids are text with a prefix, generated in packages/core (see docs/specs/core.md section 1).

create table if not exists public.documents (
  id text primary key check (id ~ '^doc_[a-z0-9][a-z0-9_-]{0,63}$'),
  name text not null,
  source text not null check (source in ('user', 'ai', 'import')),
  apartment jsonb not null check (jsonb_typeof(apartment) = 'object'),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  lighting jsonb not null check (jsonb_typeof(lighting) = 'object'),
  thumbnail_path text,
  thumbnail_rendered_at timestamptz,
  -- Optimistic concurrency: every write is "update ... where version = $expected".
  version int not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_revisions (
  id bigint generated always as identity primary key,
  document_id text not null references public.documents (id) on delete cascade,
  -- { name, apartment, items, lighting } after the change
  snapshot jsonb not null,
  created_by text not null check (created_by in ('user', 'ai')),
  -- Undo/redo pointer: set on undone revisions, cleared on redo.
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id text primary key check (id ~ '^asset_[a-z0-9][a-z0-9_-]{0,63}$'),
  name text not null,
  category text not null,
  params jsonb not null default '[]' check (jsonb_typeof(params) = 'array'),
  parts jsonb not null default '[]' check (jsonb_typeof(parts) = 'array'),
  -- { front?, side?, top? }: path, opacity, calibration
  reference_images jsonb not null default '{}' check (jsonb_typeof(reference_images) = 'object'),
  thumbnail_path text,
  -- Import deduplication.
  content_hash text not null,
  version int not null default 1,
  -- What was removed together with the asset: [{ documentId, items }]
  trash_dependents jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_revisions (
  id bigint generated always as identity primary key,
  asset_id text not null references public.assets (id) on delete cascade,
  snapshot jsonb not null,
  created_by text not null check (created_by in ('user', 'ai')),
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.materials (
  id text primary key check (id ~ '^mat_[a-z0-9][a-z0-9_-]{0,63}$'),
  name text not null,
  source text not null check (source in ('polyhaven', 'ambientcg', 'photo')),
  source_id text,
  -- 'CC0' for polyhaven/ambientcg, 'own' for photo
  license text not null,
  source_url text,
  -- { baseColor?, normal?, roughness?, metalness?, ao?, displacement? } -> paths in bucket "textures"
  maps jsonb not null check (jsonb_typeof(maps) = 'object'),
  import_status text not null default 'pending' check (import_status in ('pending', 'ready', 'failed')),
  -- Metres per texture tile.
  tile_size real not null check (tile_size > 0),
  tint text check (tint ~* '^#[0-9a-f]{6}$'),
  roughness_factor real not null default 1 check (roughness_factor >= 0 and roughness_factor <= 2),
  metalness_factor real check (metalness_factor >= 0 and metalness_factor <= 1),
  -- Shown until the maps are loaded.
  fallback_color text not null default '#b8b0a4' check (fallback_color ~ '^#[0-9a-f]{6}$'),
  thumbnail_path text,
  content_hash text not null,
  trash_dependents jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.models (
  id text primary key check (id ~ '^model_[a-z0-9][a-z0-9_-]{0,63}$'),
  name text not null,
  source text not null check (source in ('upload', 'polyhaven', 'url')),
  source_id text,
  license text,
  storage_path text not null,
  -- { min: [x, y, z], max: [x, y, z] } in metres
  bounding_box jsonb not null check (jsonb_typeof(bounding_box) = 'object'),
  content_hash text not null,
  trash_dependents jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one row (id = 1): the session state shared by the UI and Claude.
create table if not exists public.app_state (
  id int primary key check (id = 1),
  mode text not null default 'editor' check (mode in ('editor', 'documents', 'workshop')),
  active_document_id text references public.documents (id) on delete set null,
  active_asset_id text references public.assets (id) on delete set null,
  editor_view text not null default 'dollhouse' check (editor_view in ('dollhouse', 'firstPerson')),
  render_mode text not null default 'work' check (render_mode in ('work', 'photo')),
  photo_resolution jsonb not null default '{"width": 1920, "height": 1080}'
    check (jsonb_typeof(photo_resolution) = 'object'),
  -- { position, target, focalLength } or null
  camera jsonb check (camera is null or jsonb_typeof(camera) = 'object'),
  focus_id text,
  selection jsonb not null default '[]' check (jsonb_typeof(selection) = 'array'),
  workshop_camera text not null default 'perspective'
    check (workshop_camera in ('front', 'side', 'top', 'perspective')),
  workshop_light text not null default 'studio' check (workshop_light in ('studio', 'apartment')),
  -- list of { from, to } lines
  measurement_overlay jsonb not null default '[]' check (jsonb_typeof(measurement_overlay) = 'array'),
  -- Claude's write lock as a timestamp: a crashed MCP call cannot leave it stuck.
  ai_busy_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.app_state (id) values (1) on conflict (id) do nothing;

-- Indexes: revision history, trash filters, import dedup, foreign keys of app_state.
create index if not exists document_revisions_document_id_created_at_idx
  on public.document_revisions (document_id, created_at desc);
create index if not exists asset_revisions_asset_id_created_at_idx
  on public.asset_revisions (asset_id, created_at desc);

create index if not exists documents_deleted_at_idx on public.documents (deleted_at) where deleted_at is not null;
create index if not exists assets_deleted_at_idx on public.assets (deleted_at) where deleted_at is not null;
create index if not exists materials_deleted_at_idx on public.materials (deleted_at) where deleted_at is not null;
create index if not exists models_deleted_at_idx on public.models (deleted_at) where deleted_at is not null;

create index if not exists assets_content_hash_idx on public.assets (content_hash);
create index if not exists materials_content_hash_idx on public.materials (content_hash);
create index if not exists models_content_hash_idx on public.models (content_hash);

create index if not exists app_state_active_document_id_idx on public.app_state (active_document_id);
create index if not exists app_state_active_asset_id_idx on public.app_state (active_asset_id);
