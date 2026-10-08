# Apartment planner

Photorealistic 3D planner for one real apartment: rebuild it from photos and measurements, furnish it
with parametric furniture, and see it under real daylight for any time of day and season. The app is
driven primarily through an MCP server from claude.ai; everything also works by hand in the app.

Status: phase a (monorepo, shared core, database, seed, platform layer). See `docs/plan.md` for the
full plan and phase list, `docs/specs/core.md` for the shared core contract and `docs/design.md` for
the binding UI design.

## Repository

| Path | Content |
|---|---|
| `apps/web` | Vite + React + TypeScript web app |
| `apps/desktop` | placeholder for the Electron app |
| `packages/core` | code shared by the web app and the MCP edge function: schemas, TOON, formulas, geometry, layout check, sun position, operations, seed data |
| `supabase/migrations` | database schema, RLS, storage, realtime, trash purge |
| `supabase/functions` | edge functions (bundled before deploy) |
| `scripts` | build helpers |

## Setup

Requirements: Node 24, pnpm 12, a hosted Supabase project.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in the values
pnpm test
pnpm dev
```

Environment variables (`apps/web/.env.local`, never committed):

| Variable | Meaning |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | publishable / anon key |
| `VITE_MCP_URL` | URL of the MCP edge function |
| `VITE_AUTH_REDIRECT_URL` | where Supabase Auth redirects after login |

The Supabase project is managed through the Supabase MCP (`.mcp.json`, git-ignored because it holds an
access token). Migrations in `supabase/migrations` are the source of truth and are applied through it.
Sign-ups are disabled; the first account created in the dashboard becomes the owner automatically.

## Scripts

| Command | What it does |
|---|---|
| `pnpm test` | all unit tests (core + web) |
| `pnpm typecheck` | TypeScript in every package |
| `pnpm seed:sql` | regenerates `supabase/seed.sql` from the typed seed data in `packages/core/src/seed` |
| `pnpm functions:bundle [name]` | bundles an edge function together with `@app/core` into `supabase/functions/<name>/dist/index.js` |

### Why edge functions are bundled

`packages/core` is plain TypeScript with explicit `.ts` imports, so Vite and Deno can both read it.
The bundle script packs a function and core into one ESM file and rewrites npm imports to pinned
`npm:` specifiers taken from `packages/core/package.json`. That single file deploys identically through
the Supabase MCP, the CLI or the dashboard.

## Data formats

- Units: metres in data and API, centimetres in the UI. Rotation in degrees around the vertical axis.
- Coordinates: origin at an outer corner of the apartment, x to the right, z "down" in the floor plan,
  y up.
- Ids are readable and prefixed: `doc_`, `item_`, `asset_`, `part_`, `mat_`, `model_`, `room_`, `wall_`,
  `opening_`.
- Export/import: TOON (default) or JSON, see `docs/specs/core.md` §11.

## Licenses of third-party assets

Seed materials come from [Poly Haven](https://polyhaven.com) and [ambientCG](https://ambientcg.com),
both CC0 (public domain). Source, source id and license are stored on every material.
