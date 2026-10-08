# Spec: `packages/core`

Contract for the shared core package. Test-agent and coding-agent both work from this file. Units:
metres, degrees, hours. All modules are pure TypeScript: no DOM, no three.js, no Supabase, no Deno or
Node APIs (only `Intl` and standard ECMAScript). Relative imports use explicit `.ts` extensions.

Module layout (`packages/core/src/`), everything re-exported from `index.ts`:

```
ids.ts  validation.ts  hash.ts
schemas/{common,apartment,item,lighting,asset,material,model,document,app-state,export}.ts
formula/{parser,evaluate}.ts
asset/{params,resolve}.ts
geometry/{polygon,obb,footprint}.ts
layout-check.ts
sun.ts  lighting.ts
toon.ts  export/{bundle,import}.ts
operations/{apartment,items,lighting,asset}.ts
seed/  (phase a, task 7)
```

---

## 1. Ids — `ids.ts`

- `ID_PREFIXES = ["doc","item","asset","part","mat","model","room","wall","opening"] as const`,
  `type IdPrefix`.
- An id is `<prefix>_<body>`, body matches `[a-z0-9][a-z0-9_-]{0,63}`. Readable bodies are allowed and
  encouraged for hand-written data (`room_living`, `asset_sofa`).
- `createId(prefix)` → prefix + `_` + 10 random base36 chars (uses `crypto.getRandomValues`).
- `isId(value, prefix)` → boolean. `idSchema(prefix)` → zod string schema enforcing the pattern.

## 2. Validation errors — `validation.ts`

Machine-readable errors used everywhere (UI fields, MCP responses, import):

```ts
type ValidationIssue = { field: string; value: unknown; allowed: string; message: string };
```

- `field` is a dotted path (`items.item_sofa.rotation`, `apartment.walls.wall_a.thickness` — array entries that
  have an `id` are addressed by id, others by index).
- `allowed` is a human-readable English description (`"number between 0.05 and 1"`,
  `"one of: window, door, balconyDoor"`).
- `toValidationIssues(zodError, input)` maps zod issues to this shape.
- `type Result<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] }`.

## 3. Schemas — `schemas/*`

zod 4. Every schema exports the schema and the inferred type. Numbers that may be formulas use
`NumberOrFormula = number | string` where the string must start with `=`.

### 3.1 Apartment

```ts
ApartmentMeta = {
  name: string;                 // 1..120
  ceilingHeight: number;        // 2..5
  northAngle: number;           // 0..<360, degrees, clockwise from plan "up" (-z) to where north points
  latitude: number;             // -90..90
  longitude: number;            // -180..180, default 10
  timeZone: string;             // IANA name, default "Europe/Berlin", must be accepted by Intl
}
Room = { id: room_*; name: string (1..80, content, may be German); polygon: [x, z][] (>= 3 points, no
         repeated closing point); floorMaterialId?: mat_* | null; wallMaterialId?: mat_* | null;
         ceilingMaterialId?: mat_* | null; estimated?: boolean }
Wall = { id: wall_*; startX; startZ; endX; endZ: number; thickness: number (0.05..1);
         exterior: boolean; estimated?: boolean }      // length must be > 0.05
Opening = { id: opening_*; wallId: wall_*; type: "window" | "door" | "balconyDoor";
            offsetFromStart: number (>= 0, distance from wall start to the opening's near edge);
            width: number (0.2..5); height: number (0.2..3); sillHeight: number (0..2.5);
            frameMaterialId?: mat_* | null; estimated?: boolean }
Apartment = { meta: ApartmentMeta; rooms: Room[]; walls: Wall[]; openings: Opening[] }
```

Cross-field rules (apartment schema `superRefine`):
- ids unique within each list; every `opening.wallId` exists;
- `offsetFromStart + width <= wall length`; `sillHeight + height <= meta.ceilingHeight`;
- doors and balcony doors have `sillHeight` 0..0.05.

### 3.2 Item

```ts
Item = { id: item_*; assetId: asset_*; name?: string | null; x: number; z: number;
         rotation: number;            // degrees around y, normalised to [0, 360)
         params: Record<string, number>; // slider values, keys = asset param keys
         locked: boolean; hidden: boolean; lightOn: boolean;
         clampedParams?: string[] }   // keys clamped after an asset range change (shown in the tree)
```

Item `(x, z)` is the asset origin in world space. Asset space: origin at the centre of the footprint on
the floor, `x` = width, `y` = up, `z` = depth, front faces `+z`. Rotation follows three.js: world
position of a local point `(px, pz)` = `(x + px·cosθ + pz·sinθ, z − px·sinθ + pz·cosθ)` with θ in radians.

### 3.3 Lighting

```ts
Season = "winter" | "spring" | "summer" | "autumn"
Lighting = { time: number (0..24); season: Season; effectsEnabled: boolean;
             lampShadowsEnabled: boolean (default false); presetId?: PresetId | null }
```

### 3.4 Asset

```ts
ParamUnit = "m" | "deg" | "count" | "factor"
AssetParam = { key: string (camelCase identifier, not one of: i, count, pi); label: string (German);
               min: number; max: number; step: number (> 0); default: number; unit: ParamUnit }
               // min < max, min <= default <= max

PartShape = "box" | "cylinder" | "sphere" | "capsule" | "torus" | "plane" | "cushion" | "lathe"
          | "extrude" | "model"

Part = {
  id: part_*; name: string;
  shape: PartShape;
  x, y, z: NumberOrFormula;         // centre of the part's local bounding box, asset space
  rx, ry, rz: NumberOrFormula;      // degrees, default 0
  w, h, d: NumberOrFormula;         // size of the local bounding box (x, y, z extent)
  bevel: NumberOrFormula;           // edge radius, default 0
  materialId?: mat_* | null;
  repeat?: { count: NumberOrFormula } | null;   // part repeated count times; formulas see i (0-based) and count
  light?: { lumens: NumberOrFormula; kelvin: NumberOrFormula; type: "point" | "spot" | "area" } | null;
  // shape-specific
  fill?: NumberOrFormula;           // cushion: 0..1 puffiness
  tube?: NumberOrFormula;           // torus: tube radius
  profile?: [NumberOrFormula, NumberOrFormula][];  // lathe: [radius, y] (y bottom→top);
                                                   // extrude: [x, y] closed outline, extruded along z by d
  modelId?: model_* | null;         // model only
  scaleMode?: "uniform" | "stretch" | "fit";       // model only, default "fit"
}

Asset = { id: asset_*; name: string; category: string (content, e.g. "Sofas"); params: AssetParam[];
          parts: Part[]; referenceImages: { front?: ReferenceImage; side?: ReferenceImage; top?: ReferenceImage } }
ReferenceImage = { path: string; opacity: number (0..1);
                   calibration?: { a: [number, number]; b: [number, number]; lengthM: number } | null }
```

Rules: param keys unique; part ids unique; `lathe`/`extrude` need `profile` with ≥ 2 / ≥ 3 points;
`model` needs `modelId`.

### 3.5 Material, model

```ts
MaterialMaps = { baseColor?: string; normal?: string; roughness?: string; metalness?: string;
                 ao?: string; displacement?: string }    // storage paths in bucket "textures"
Material = { id: mat_*; name: string; source: "polyhaven" | "ambientcg" | "photo"; sourceId?: string | null;
             license: string; sourceUrl?: string | null; maps: MaterialMaps;
             importStatus: "pending" | "ready" | "failed";
             tileSize: number (> 0, metres per tile); tint?: string | null (#rrggbb);
             roughnessFactor: number (0..2, default 1); metalnessFactor?: number (0..1) | null;
             fallbackColor: string (#rrggbb — used until maps are loaded) }
BoundingBox = { min: [number, number, number]; max: [number, number, number] }
Model = { id: model_*; name: string; source: "upload" | "polyhaven" | "url"; sourceId?: string | null;
          license?: string | null; storagePath: string; boundingBox: BoundingBox }
```

### 3.6 Document, app state

```ts
DocumentSource = "user" | "ai" | "import"
DocumentContent = { name: string; apartment: Apartment; items: Item[]; lighting: Lighting }
Document = DocumentContent & { id: doc_*; source: DocumentSource }
AppState = { mode: "editor" | "documents" | "workshop"; activeDocumentId: doc_* | null;
             activeAssetId: asset_* | null; editorView: "dollhouse" | "firstPerson";
             renderMode: "work" | "photo"; photoResolution: { width: number; height: number };
             camera: { position: [n,n,n]; target: [n,n,n]; focalLength: number (10..200, mm) } | null;
             focusId: string | null; selection: string[];
             workshopCamera: "front" | "side" | "top" | "perspective";
             workshopLight: "studio" | "apartment";
             measurementOverlay: { from: [n, n, n]; to: [n, n, n] }[];
             aiBusyUntil: string | null }  // ISO timestamp
```

## 4. Content hash — `hash.ts`

`contentHash(value)` → 16-char hex FNV-1a 64-bit over a stable JSON serialisation (object keys sorted,
`undefined` dropped). `assetContentHash(asset)`, `materialContentHash(material)`, `modelContentHash(model)`
hash everything except `id`. Same content with different key order or id → same hash.

## 5. Formulas — `formula/*`

A field is a formula when it is a string starting with `=`. No `eval`, no `Function`.

Grammar (Pratt parser): numbers (`1`, `0.5`, `.5`, `1e-3`), identifiers `[A-Za-z_][A-Za-z0-9_]*`,
binary `+ - * / % ^` (`^` right-associative, highest), unary `-`/`+`, comparisons `< <= > >= == !=`
(yield 1 or 0), parentheses, function calls. Functions: `min(…≥1) max(…≥1) round(x) floor(x) ceil(x)
abs(x) sqrt(x) clamp(x, lo, hi) if(cond, a, b)` (cond ≠ 0 → a). Constant `pi`. Whitespace ignored.

API:
```ts
parseFormula(source: string): { ok: true; ast: FormulaNode; identifiers: string[] }
                            | { ok: false; error: FormulaError }
evaluateFormula(source: string, scope: Record<string, number>): { ok: true; value: number }
                                                              | { ok: false; error: FormulaError }
resolveNumber(value: NumberOrFormula, scope): same result shape (plain numbers pass through)
FormulaError = { message: string; position: number }   // position = index in the source string
```
Errors: syntax errors with position; unknown identifier; unknown function; wrong argument count;
division by zero; non-finite result. Identifier lookup must not reach the prototype chain
(`constructor`, `__proto__`, `toString` are unknown identifiers).

## 6. Asset params and resolution — `asset/*`

- `normalizeParams(params: AssetParam[], values: Record<string, number>)` →
  `{ values, clampedKeys }`: missing keys get `default`; unknown keys are dropped; out-of-range values
  are clamped to `[min, max]` and listed in `clampedKeys`; `count` units are rounded to integers.
- `reconcileItemsWithAsset(items, asset)` → items of that asset with normalised params and
  `clampedParams` set to the keys that had to be clamped (others unchanged).
- `resolveAsset(asset, values?)` →
  `{ parts: ResolvedPart[]; issues: { partId: string; field: string; error: FormulaError }[]; boundingBox: BoundingBox }`
  - scope = normalised param values (+ `pi`); repeated parts additionally see `i` and `count`;
  - `repeat.count` is evaluated first and floored, max 200;
  - each repeated copy gets id `<partId>#<i>`;
  - `ResolvedPart` = `Part` with every numeric field a plain number;
  - a failing field becomes `0` (size fields `0.01`) and produces an issue — resolution never throws;
  - `boundingBox` = union of all parts' rotated local boxes (rotation order XYZ, degrees).
- `assetFootprint(resolved)` → `{ halfWidth, halfDepth, centerX, centerZ, minY, maxY }` from the
  bounding box (used by geometry).

## 7. Geometry — `geometry/*`

- `polygonArea(points)` (absolute, m²), `polygonCentroid(points)`, `pointInPolygon([x,z], points)`.
- `wallLength(wall)`, `openingSegment(wall, opening)` → start/end points.
- `roomForPoint(apartment, x, z)` → room id or `null` (first room containing the point).
- OBB in the plan: `{ cx, cz, hx, hz, angle }` (angle radians, same convention as item rotation).
  `itemObb(item, footprint)`, `wallObb(wall)`.
- `obbIntersects(a, b, tolerance = 0.001)` (separating axis; touching within tolerance is not an
  intersection), `obbDistance(a, b)` (0 when intersecting).

## 8. Layout check — `layout-check.ts`

```ts
checkLayout(content: DocumentContent, assets: Map<string, Asset>): LayoutIssue[]
LayoutIssue = { kind: "collision" | "narrowPassage" | "blockedOpening" | "outsideRoom" | "clampedParam"
                      | "adjustedParam" | "unknownAsset";
                subjectId: string; objectId: string | null; value: number | null; detail: string | null }
```
Flat and uniform on purpose (TOON tabular). Hidden items are ignored. Items whose asset is missing →
`unknownAsset`.
- `collision`: item–item OBB intersection (subject/object = item ids, sorted), item–wall intersection
  (object = wall id) — except where the item overlaps only an opening's span of that wall.
- `narrowPassage`: two obstacles (items or walls) whose distance is ≥ 0.3 and < 0.8 m and whose facing
  sides overlap by at least 0.3 m along the gap; `value` = gap width in metres.
- `blockedOpening`: an item intersects the clearance zone of an opening. Doors/balcony doors: rectangle
  of opening width × 0.8 m depth on each side of the wall (only the room side for exterior walls).
  Windows: 0.4 m depth on the room side, only items whose top (`maxY`) is above `sillHeight + 0.1`.
  subject = opening id, object = item id.
- `outsideRoom`: item centre not inside any room.
- `clampedParam`: item has `clampedParams`; `detail` = comma-separated keys.
- `adjustedParam`: item params differ from the asset defaults; `detail` = comma-separated keys.
- Order: by kind in the order listed above, then subjectId.

## 9. Sun — `sun.ts`

- `SEASON_DATES = { winter: [1, 15], spring: [4, 15], summer: [7, 15], autumn: [10, 15] }` (month, day).
- `localTimeToDate({ year, month, day, hours, timeZone })` → `Date` (UTC instant of that wall-clock time
  in the zone, DST-aware, via `Intl.DateTimeFormat`).
- `sunPosition({ time, season, latitude, longitude, timeZone, northAngle, year })` →
  `{ altitudeDeg, azimuthDeg, direction: [x, y, z] }`. Azimuth measured from north, clockwise towards
  east. `direction` = unit vector from the scene towards the sun in scene coordinates:
  north `N = (sin n, 0, −cos n)`, east `E = (cos n, 0, sin n)` with `n = northAngle` in radians;
  `direction = cos(alt)·(cos(az)·N + sin(az)·E) + sin(alt)·(0, 1, 0)`. Uses `suncalc` 2.1.1 (check its
  units: v2 returns degrees; the azimuth convention must be converted if it differs from the above).
- `goldenHourTime({ season, latitude, longitude, timeZone, year })` → local time in hours when the
  evening sun descends through 2° altitude (bisection, ±1 min).
- `sunLight(altitudeDeg)` → `{ color: [r, g, b] (0..1); illuminanceLux: number }`. Below −0.83°: lux 0.
  Colour from `kelvinToRgb` of a temperature rising from 2000 K at the horizon to 5800 K at 40°+;
  illuminance from an air-mass model, ~100 000 lx at 60°+, monotonically increasing with altitude.

## 10. Lighting helpers — `lighting.ts`

- `kelvinToRgb(kelvin)` → `[r, g, b]` 0..1 (Tanner Helland approximation, clamped 1000..40000 K).
- `lumensToCandela(lumens, type, spotAngleDeg = 60)`: point/area → `lm / 4π`; spot →
  `lm / (2π(1 − cos(angle/2)))`.
- `PRESET_IDS = ["morningCoffee", "noon", "goldenHour", "cozyEvening", "movieNight"]`.
- `LIGHTING_PRESETS`: per id `{ time: number | "goldenHour"; effectsEnabled: boolean;
  mood: { grain: number; vignette: number; lightLeak: number; halftone: number } }` (0..1 strengths).
  Times: morningCoffee 7.5, noon 12.5, goldenHour computed, cozyEvening 20, movieNight 21.5.
- `resolvePresetTime(presetId, location)` → hours (calls `goldenHourTime` for `goldenHour`).

## 11. TOON and export/import — `toon.ts`, `export/*`

- `encodeToon(value)` / `decodeToon(text)` wrap `@toon-format/toon` 4.1.1 (`encode`, `decode`), 2-space
  indent, comma delimiter.
- `detectFormat(text)` → `"json" | "toon"` (after trimming BOM, whitespace and a surrounding Markdown
  code fence: first non-space char `{` or `[` → json).
- Export bundle:
  ```ts
  ExportBundle = { format: "apartment-planner"; version: 1; document: DocumentContent;
                   assets: Asset[]; materials: Material[]; models: Model[] }
  ```
  `buildExportBundle(content, { assets, materials, models })` includes only what the document uses:
  assets of its items; materials referenced by rooms, openings and those assets' parts; models of those
  parts. `serializeBundle(bundle, format)`.
- `parseImport(text, format?)` → `Result<ExportBundle>`; tolerant: strips BOM and code fences,
  JSON accepts trailing commas; validated with zod; issues carry `field` and, where the parser knows it,
  a `line` number (`ValidationIssue & { line?: number }`).
- `planImport(bundle, existing: { assets; materials; models })` → `{ content, assets: { create: Asset[]; reuse: Record<oldId, existingId> }, materials: …, models: … }`:
  every entity is matched by content hash; identical → reuse the existing id; otherwise create with a
  fresh id. All references in the document content and in created assets are rewritten. Existing
  entities are never modified.
- Roundtrip: `decode(encode(x))` deep-equals `x` for every schema-valid `ExportBundle` and `Document`.

## 12. Operations — `operations/*`

Pure functions over `DocumentContent` (and assets where needed). Every operation returns

```ts
OperationResult<T> = { ok: true; value: T; changedIds: string[] } | { ok: false; issues: ValidationIssue[] }
```
and validates its result with the schemas (invalid input never produces a value).

- `upsertApartment(content, { upsert?: { meta?: Partial<ApartmentMeta>; rooms?; walls?; openings? },
  remove?: { rooms?: string[]; walls?: string[]; openings?: string[] } })` — upsert by id; for an
  existing id the given fields are merged, for a new id the entry must be complete; removing a wall also
  removes its openings; unknown ids in `remove` → issue.
- `placeItems(content, items: (Partial<Item> & { assetId; x; z })[], assets)` — generates missing ids,
  defaults `rotation 0, locked false, hidden false, lightOn false`, normalises params; unknown asset → issue.
- `updateItems(content, patches: (Partial<Item> & { id })[], assets)` — locked items reject position or
  rotation changes (issue with `field` `items.<id>.x` …) unless the patch also sets `locked: false`.
- `removeItems(content, ids)`, `duplicateItems(content, ids, offset = [0.1, 0.1])`.
- `setLighting(content, patch: Partial<Lighting> & { allLamps?: boolean }, assets)` — `allLamps` sets
  `lightOn` on every item whose asset has at least one part with `light`.
- `upsertAssetDefinition(asset, { meta?, upsertParams?, removeParams?, upsertParts?, removeParts? })` →
  new asset (validated).
- `removeAssetFromContent(content, assetId)` → `{ content, removedItems }`;
  `restoreItemsToContent(content, items)`.
- `replaceMaterialReferences(content, materialId, replacementId | null)` and
  `replaceMaterialInAsset(asset, materialId, replacementId | null)`.
