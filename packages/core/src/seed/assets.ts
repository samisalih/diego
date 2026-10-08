import type { Asset, AssetParam, Part } from "../schemas/asset.ts";

// Asset space: metres, origin on the floor in the middle of the footprint, front of the furniture towards +z,
// back towards -z. Every x/y/z is the centre of the part's box, y counts up from the floor.

type PartFields = Pick<Part, "x" | "y" | "z" | "w" | "h" | "d" | "materialId"> & Partial<Part>;

function part(id: string, name: string, shape: Part["shape"], fields: PartFields): Part {
  return { rx: 0, ry: 0, rz: 0, bevel: 0, ...fields, id: `part_${id}`, name, shape };
}

function param(
  key: string,
  label: string,
  [min, max, step, defaultValue]: [number, number, number, number],
  unit: AssetParam["unit"] = "m",
): AssetParam {
  return { key, label, min, max, step, default: defaultValue, unit };
}

const NO_REFERENCE_IMAGES = {};

// Formula shared by every asset with four corner legs: index 0..3 -> (-1,-1), (1,-1), (-1,1), (1,1).
const CORNER_SIGN_X = "if(i%2==0,-1,1)";
const CORNER_SIGN_Z = "if(i<2,-1,1)";

const SOFA_ARM_WIDTH = 0.18;
const SOFA_INNER_WIDTH = `(width-${2 * SOFA_ARM_WIDTH})`;

const sofa: Asset = {
  id: "asset_sofa",
  name: "Sofa",
  category: "Sofas",
  params: [
    param("width", "Breite", [1.8, 2.6, 0.05, 2.2]),
    param("depth", "Tiefe", [0.85, 1.1, 0.05, 0.95]),
    param("seatHeight", "Sitzhöhe", [0.38, 0.5, 0.01, 0.44]),
    param("seatCount", "Sitzkissen", [2, 4, 1, 3], "count"),
  ],
  parts: [
    part("frame", "Gestell", "box", {
      x: 0, y: "=(seatHeight-0.06)/2", z: 0, w: "=width", h: "=seatHeight-0.3", d: "=depth",
      bevel: 0.03, materialId: "mat_linen",
    }),
    part("arms", "Armlehnen", "box", {
      x: `=(i*2-1)*(width/2-${SOFA_ARM_WIDTH / 2})`, y: "=(seatHeight+0.32)/2", z: 0,
      w: SOFA_ARM_WIDTH, h: "=seatHeight+0.08", d: "=depth", bevel: 0.04,
      repeat: { count: 2 }, materialId: "mat_linen",
    }),
    part("seat_cushions", "Sitzkissen", "cushion", {
      x: `=-${SOFA_INNER_WIDTH}/2+(i+0.5)*${SOFA_INNER_WIDTH}/seatCount`, y: "=seatHeight-0.09", z: 0.11,
      w: `=${SOFA_INNER_WIDTH}/seatCount-0.01`, h: 0.18, d: "=depth-0.22", bevel: 0.04, fill: 0.6,
      repeat: { count: "=seatCount" }, materialId: "mat_linen",
    }),
    part("back_frame", "Rückenlehne", "box", {
      x: 0, y: "=(seatHeight+0.54)/2", z: "=-depth/2+0.07", w: `=${SOFA_INNER_WIDTH}`, h: "=seatHeight+0.3", d: 0.14,
      bevel: 0.03, materialId: "mat_linen",
    }),
    part("back_cushions", "Rückenkissen", "cushion", {
      x: `=-${SOFA_INNER_WIDTH}/2+(i+0.5)*${SOFA_INNER_WIDTH}/seatCount`, y: "=seatHeight+0.22", z: "=-depth/2+0.25",
      rx: -8, w: `=${SOFA_INNER_WIDTH}/seatCount-0.01`, h: 0.42, d: 0.2, bevel: 0.04, fill: 0.7,
      repeat: { count: "=seatCount" }, materialId: "mat_linen",
    }),
    part("legs", "Füße", "cylinder", {
      x: `=${CORNER_SIGN_X}*(width/2-0.12)`, y: 0.06, z: `=${CORNER_SIGN_Z}*(depth/2-0.12)`,
      w: 0.07, h: 0.12, d: 0.07, repeat: { count: 4 }, materialId: "mat_oak",
    }),
  ],
  referenceImages: NO_REFERENCE_IMAGES,
};

const bed160: Asset = {
  id: "asset_bed_160",
  name: "Bett 160",
  category: "Betten",
  params: [
    param("width", "Breite", [1.4, 1.8, 0.05, 1.6]),
    param("length", "Länge", [1.9, 2.2, 0.05, 2.1]),
    param("headboardHeight", "Kopfteilhöhe", [0.8, 1.3, 0.05, 1.05]),
  ],
  parts: [
    part("legs", "Füße", "box", {
      x: `=${CORNER_SIGN_X}*(width/2-0.06)`, y: 0.09, z: `=${CORNER_SIGN_Z}*(length/2-0.06)`,
      w: 0.07, h: 0.18, d: 0.07, bevel: 0.01, repeat: { count: 4 }, materialId: "mat_oak",
    }),
    part("frame", "Bettrahmen", "box", {
      x: 0, y: 0.29, z: 0.05, w: "=width", h: 0.22, d: "=length-0.1", bevel: 0.02, materialId: "mat_oak",
    }),
    part("headboard", "Kopfteil", "box", {
      x: 0, y: "=headboardHeight/2", z: "=-length/2+0.05", w: "=width", h: "=headboardHeight", d: 0.1,
      bevel: 0.04, materialId: "mat_linen",
    }),
    part("mattress", "Matratze", "cushion", {
      x: 0, y: 0.52, z: 0, w: "=width-0.1", h: 0.24, d: "=length-0.22", bevel: 0.05, fill: 0.5, materialId: "mat_linen",
    }),
    part("pillows", "Kopfkissen", "cushion", {
      x: "=(i*2-1)*width/4", y: 0.7, z: "=-length/2+0.41", w: "=width/2-0.12", h: 0.14, d: 0.4,
      bevel: 0.04, fill: 0.8, repeat: { count: 2 }, materialId: "mat_linen",
    }),
  ],
  referenceImages: NO_REFERENCE_IMAGES,
};

const shelf: Asset = {
  id: "asset_shelf",
  name: "Regal",
  category: "Regale",
  params: [
    param("width", "Breite", [0.6, 1.6, 0.05, 0.9]),
    param("height", "Höhe", [0.8, 2.2, 0.05, 1.8]),
    param("depth", "Tiefe", [0.25, 0.45, 0.01, 0.32]),
    param("shelfCount", "Anzahl Böden", [2, 8, 1, 5], "count"),
  ],
  parts: [
    part("sides", "Seitenwände", "box", {
      x: "=(i*2-1)*(width/2-0.015)", y: "=height/2", z: 0, w: 0.03, h: "=height", d: "=depth",
      bevel: 0.005, repeat: { count: 2 }, materialId: "mat_oak",
    }),
    part("back", "Rückwand", "box", {
      x: 0, y: "=height/2+0.04", z: "=-depth/2+0.005", w: "=width-0.06", h: "=height-0.08", d: 0.01,
      bevel: 0.002, materialId: "mat_oak",
    }),
    part("boards", "Böden", "box", {
      x: 0, y: "=0.0925+i*(height-0.105)/(shelfCount-1)", z: 0, w: "=width-0.06", h: 0.025, d: "=depth-0.02",
      bevel: 0.004, repeat: { count: "=shelfCount" }, materialId: "mat_oak",
    }),
  ],
  referenceImages: NO_REFERENCE_IMAGES,
};

const diningTable: Asset = {
  id: "asset_dining_table",
  name: "Esstisch",
  category: "Tische",
  params: [
    param("width", "Breite", [1.2, 2.4, 0.05, 1.6]),
    param("depth", "Tiefe", [0.7, 1.1, 0.05, 0.9]),
    param("height", "Höhe", [0.7, 0.78, 0.01, 0.75]),
  ],
  parts: [
    part("top", "Tischplatte", "box", {
      x: 0, y: "=height-0.02", z: 0, w: "=width", h: 0.04, d: "=depth", bevel: 0.015, materialId: "mat_oak",
    }),
    part("legs", "Tischbeine", "box", {
      x: `=${CORNER_SIGN_X}*(width/2-0.09)`, y: "=(height-0.04)/2", z: `=${CORNER_SIGN_Z}*(depth/2-0.09)`,
      w: 0.07, h: "=height-0.04", d: 0.07, bevel: 0.008, repeat: { count: 4 }, materialId: "mat_oak",
    }),
    part("aprons", "Zargen", "box", {
      x: 0, y: "=height-0.08", z: "=(i*2-1)*(depth/2-0.09)", w: "=width-0.2", h: 0.08, d: 0.025,
      bevel: 0.004, repeat: { count: 2 }, materialId: "mat_oak",
    }),
  ],
  referenceImages: NO_REFERENCE_IMAGES,
};

const CHAIR_LEG_INSET = 0.03;

const chair: Asset = {
  id: "asset_chair",
  name: "Stuhl",
  category: "Stühle",
  params: [
    param("seatHeight", "Sitzhöhe", [0.42, 0.48, 0.01, 0.45]),
    param("seatWidth", "Sitzbreite", [0.4, 0.5, 0.01, 0.44]),
    param("backHeight", "Lehnenhöhe", [0.35, 0.5, 0.01, 0.43]),
  ],
  parts: [
    part("seat", "Sitzfläche", "box", {
      x: 0, y: "=seatHeight-0.0225", z: 0, w: "=seatWidth", h: 0.045, d: "=seatWidth", bevel: 0.015, materialId: "mat_linen",
    }),
    part("front_legs", "Vorderbeine", "box", {
      x: `=(i*2-1)*(seatWidth/2-${CHAIR_LEG_INSET})`, y: "=(seatHeight-0.045)/2", z: `=seatWidth/2-${CHAIR_LEG_INSET}`,
      w: 0.04, h: "=seatHeight-0.045", d: 0.04, bevel: 0.006, repeat: { count: 2 }, materialId: "mat_oak",
    }),
    part("rear_posts", "Hinterbeine", "box", {
      x: `=(i*2-1)*(seatWidth/2-${CHAIR_LEG_INSET})`, y: "=(seatHeight+backHeight)/2", z: `=-(seatWidth/2-${CHAIR_LEG_INSET})`,
      w: 0.04, h: "=seatHeight+backHeight", d: 0.04, bevel: 0.006, repeat: { count: 2 }, materialId: "mat_oak",
    }),
    part("backrest", "Rückenlehne", "box", {
      x: 0, y: "=seatHeight+0.1+(backHeight-0.12)/2", z: `=-(seatWidth/2-${CHAIR_LEG_INSET})`,
      w: "=seatWidth-0.1", h: "=backHeight-0.12", d: 0.025, bevel: 0.008, materialId: "mat_oak",
    }),
  ],
  referenceImages: NO_REFERENCE_IMAGES,
};

const SHADE_HEIGHT = 0.26;

const floorLamp: Asset = {
  id: "asset_floor_lamp",
  name: "Stehlampe",
  category: "Leuchten",
  params: [
    param("height", "Höhe", [1.5, 1.8, 0.05, 1.65]),
    param("shadeDiameter", "Schirmdurchmesser", [0.3, 0.5, 0.01, 0.4]),
  ],
  parts: [
    part("base", "Fuß", "lathe", {
      x: 0, y: 0.025, z: 0, w: 0.36, h: 0.05, d: 0.36, materialId: "mat_brass",
      profile: [[0, 0], [0.17, 0], [0.18, 0.012], [0.17, 0.028], [0.04, 0.04], [0.012, 0.05]],
    }),
    part("stem", "Stange", "cylinder", {
      x: 0, y: `=0.05+(height-${SHADE_HEIGHT + 0.01})/2`, z: 0, w: 0.024, h: `=height-${SHADE_HEIGHT + 0.01}`, d: 0.024,
      materialId: "mat_brass",
    }),
    part("shade", "Schirm", "lathe", {
      x: 0, y: `=height-${SHADE_HEIGHT / 2}`, z: 0, w: "=shadeDiameter", h: SHADE_HEIGHT, d: "=shadeDiameter",
      materialId: "mat_linen",
      profile: [
        ["=shadeDiameter/2", 0],
        ["=shadeDiameter/2*0.78", SHADE_HEIGHT],
        ["=shadeDiameter/2*0.78-0.006", SHADE_HEIGHT],
        ["=shadeDiameter/2-0.006", 0],
      ],
    }),
    part("bulb", "Leuchtmittel", "sphere", {
      x: 0, y: "=height-0.17", z: 0, w: 0.07, h: 0.07, d: 0.07, materialId: "mat_linen",
      light: { lumens: 1800, kelvin: 2700, type: "point" },
    }),
  ],
  referenceImages: NO_REFERENCE_IMAGES,
};

export const SEED_ASSETS: Asset[] = [sofa, bed160, shelf, diningTable, chair, floorLamp];
