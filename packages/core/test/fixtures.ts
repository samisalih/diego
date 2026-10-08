// Reusable spec-conformant fixtures for the core tests (docs/specs/core.md section 3).
// Every builder returns a fresh object, so tests may mutate the result freely.
// Plain object literals on purpose: fixtures must not depend on the schemas they exercise.

// Two rooms side by side (4 m x 3 m and 3 m x 3 m), shared interior wall at x = 4.
// North is straight up in the plan, ceiling 2.6 m.
export function buildValidApartment() {
  return {
    meta: {
      name: "Testwohnung",
      ceilingHeight: 2.6,
      northAngle: 0,
      latitude: 52.52,
      longitude: 13.405,
      timeZone: "Europe/Berlin",
    },
    rooms: [
      {
        id: "room_living",
        name: "Wohnzimmer",
        polygon: [
          [0, 0],
          [4, 0],
          [4, 3],
          [0, 3],
        ],
        floorMaterialId: "mat_oak",
        wallMaterialId: null,
      },
      {
        id: "room_bedroom",
        name: "Schlafzimmer",
        polygon: [
          [4, 0],
          [7, 0],
          [7, 3],
          [4, 3],
        ],
      },
    ],
    walls: [
      { id: "wall_n", startX: 0, startZ: 0, endX: 7, endZ: 0, thickness: 0.3, exterior: true },
      { id: "wall_s", startX: 0, startZ: 3, endX: 7, endZ: 3, thickness: 0.3, exterior: true },
      { id: "wall_w", startX: 0, startZ: 0, endX: 0, endZ: 3, thickness: 0.3, exterior: true },
      { id: "wall_e", startX: 7, startZ: 0, endX: 7, endZ: 3, thickness: 0.3, exterior: true },
      { id: "wall_mid", startX: 4, startZ: 0, endX: 4, endZ: 3, thickness: 0.12, exterior: false },
    ],
    openings: [
      {
        id: "opening_window",
        wallId: "wall_s",
        type: "window",
        offsetFromStart: 1,
        width: 1.2,
        height: 1.2,
        sillHeight: 0.9,
      },
      {
        id: "opening_door",
        wallId: "wall_mid",
        type: "door",
        offsetFromStart: 0.5,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
      },
    ],
  };
}

export function buildValidItem() {
  return {
    id: "item_sofa_1",
    assetId: "asset_sofa",
    name: "Sofa am Fenster",
    x: 1.5,
    z: 2,
    rotation: 90,
    params: { width: 1.8, legCount: 4 },
    locked: false,
    hidden: false,
    lightOn: false,
  };
}

export function buildValidLighting() {
  return {
    time: 14.5,
    season: "summer",
    effectsEnabled: true,
    lampShadowsEnabled: false,
    presetId: null,
  };
}

// Asset with two params, a formula-driven box and a repeated cylinder (legs).
export function buildValidAsset() {
  return {
    id: "asset_sofa",
    name: "Sofa",
    category: "Sofas",
    params: [
      { key: "width", label: "Breite", min: 0.6, max: 3, step: 0.05, default: 1.8, unit: "m" },
      { key: "legCount", label: "Beinanzahl", min: 2, max: 8, step: 1, default: 4, unit: "count" },
    ],
    parts: [
      {
        id: "part_seat",
        name: "Sitzfläche",
        shape: "box",
        x: 0,
        y: 0.4,
        z: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        w: "=width",
        h: 0.15,
        d: 0.9,
        bevel: 0.02,
        materialId: "mat_oak",
      },
      {
        id: "part_leg",
        name: "Bein",
        shape: "cylinder",
        x: "=-width/2 + 0.1 + i*(width - 0.2)/max(count - 1, 1)",
        y: 0.2,
        z: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        w: 0.08,
        h: 0.4,
        d: 0.08,
        bevel: 0,
        repeat: { count: "=legCount" },
      },
    ],
    referenceImages: {},
  };
}

export function buildValidMaterial() {
  return {
    id: "mat_oak",
    name: "Eiche",
    source: "polyhaven",
    sourceId: "oak_veneer_01",
    license: "CC0",
    sourceUrl: "https://polyhaven.com/a/oak_veneer_01",
    maps: { baseColor: "mat_oak/base_color.jpg", normal: "mat_oak/normal.jpg" },
    importStatus: "ready",
    tileSize: 0.5,
    tint: null,
    roughnessFactor: 1,
    metalnessFactor: null,
    fallbackColor: "#a0784c",
  };
}

export function buildValidModel() {
  return {
    id: "model_vase",
    name: "Vase",
    source: "upload",
    sourceId: null,
    license: null,
    storagePath: "model_vase/vase.glb",
    boundingBox: { min: [-0.1, 0, -0.1], max: [0.1, 0.3, 0.1] },
  };
}

export function buildValidDocument() {
  return {
    id: "doc_demo",
    source: "user",
    name: "Demo",
    apartment: buildValidApartment(),
    items: [buildValidItem()],
    lighting: buildValidLighting(),
  };
}

export function buildValidAppState() {
  return {
    mode: "editor",
    activeDocumentId: "doc_demo",
    activeAssetId: null,
    editorView: "dollhouse",
    renderMode: "work",
    photoResolution: { width: 1920, height: 1080 },
    camera: { position: [5, 6, 8], target: [3.5, 0, 1.5], focalLength: 35 },
    focusId: null,
    selection: ["item_sofa_1"],
    workshopCamera: "perspective",
    workshopLight: "studio",
    measurementOverlay: [{ from: [0, 0, 0], to: [1, 0, 0] }],
    aiBusyUntil: null,
  };
}
