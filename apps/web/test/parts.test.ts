import type { ResolvedPart } from "@app/core";
import { describe, expect, it } from "vitest";
import { buildPartGeometry } from "../src/scene/build/parts.ts";
import { boundsOf, getTriangles, getVertices, hasOnlyFiniteValues } from "./helpers/geometry.ts";

function makePart(shape: ResolvedPart["shape"], size: [number, number, number], extra: Partial<ResolvedPart> = {}): ResolvedPart {
  const [w, h, d] = size;
  return { id: "part_test", name: "Test", shape, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, w, h, d, bevel: 0, materialId: null, ...extra } as ResolvedPart;
}

const SHAPES: ResolvedPart["shape"][] = ["box", "cylinder", "sphere", "capsule", "torus", "plane", "cushion", "lathe", "extrude", "model"];
const PROFILE: Array<[number, number]> = [[0.2, 0], [0.2, 0.5], [0.1, 1]];
const OUTLINE: Array<[number, number]> = [[-0.5, -0.25], [0.5, -0.25], [0.5, 0.25], [-0.5, 0.25]];

function expectSize(part: ResolvedPart, [w, h, d]: [number, number, number], tolerance = 3) {
  const { size, center } = boundsOf(buildPartGeometry(part));
  expect(size.x).toBeCloseTo(w, tolerance);
  expect(size.y).toBeCloseTo(h, tolerance);
  expect(size.z).toBeCloseTo(d, tolerance);
  expect(center.x).toBeCloseTo(0, tolerance);
  expect(center.y).toBeCloseTo(0, tolerance);
  expect(center.z).toBeCloseTo(0, tolerance);
}

describe("buildPartGeometry", () => {
  describe("box", () => {
    // Red if the box is not w x h x d or not centred on the origin.
    it("is centred and sized to w x h x d", () => {
      expectSize(makePart("box", [1, 0.5, 0.3]), [1, 0.5, 0.3], 6);
    });

    // Red if bevel 0 produces rounded geometry: every vertex must sit on a corner coordinate.
    it("is a plain box when bevel is 0", () => {
      for (const v of getVertices(buildPartGeometry(makePart("box", [1, 0.5, 0.3])))) {
        expect(Math.abs(v.x)).toBeCloseTo(0.5, 6);
        expect(Math.abs(v.y)).toBeCloseTo(0.25, 6);
        expect(Math.abs(v.z)).toBeCloseTo(0.15, 6);
      }
    });

    // Red if the bevel is ignored (a sharp corner vertex exists) or the bevel enlarges the box.
    it("rounds the edges while keeping the outer size", () => {
      const part = makePart("box", [1, 0.5, 0.3], { bevel: 0.05 });
      expectSize(part, [1, 0.5, 0.3], 5);
      const sharpCorner = getVertices(buildPartGeometry(part)).some((v) =>
        Math.abs(Math.abs(v.x) - 0.5) < 1e-6 && Math.abs(Math.abs(v.y) - 0.25) < 1e-6 && Math.abs(Math.abs(v.z) - 0.15) < 1e-6);
      expect(sharpCorner).toBe(false);
    });

    // Red if the bevel is not limited to min(bevel, w/2, h/2, d/2): a huge bevel must not blow up the size.
    it("limits the bevel radius to the smallest half extent", () => {
      const part = makePart("box", [1, 0.2, 0.5], { bevel: 10 });
      expectSize(part, [1, 0.2, 0.5], 5);
      expect(hasOnlyFiniteValues(buildPartGeometry(part))).toBe(true);
    });

    // Red if normals are not unit length (rounded-box normals broken).
    it("has unit-length normals", () => {
      const normal = buildPartGeometry(makePart("box", [1, 0.5, 0.3], { bevel: 0.05 })).getAttribute("normal");
      for (let i = 0; i < normal.count; i += 1) {
        expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 4);
      }
    });
  });

  describe("cylinder", () => {
    const part = makePart("cylinder", [0.4, 1, 0.2]);

    // Red if the axis is not y or the extents are not w/h/d.
    it("has its axis along y and elliptical x/z extents", () => {
      expectSize(part, [0.4, 1, 0.2], 2);
    });

    // Red if the section is circular instead of elliptical (radius w/2 in x, d/2 in z).
    it("lies on the ellipse (x / (w/2))^2 + (z / (d/2))^2 = 1 in the rim", () => {
      let maxValue = 0;
      for (const v of getVertices(buildPartGeometry(part))) {
        const value = (v.x / 0.2) ** 2 + (v.z / 0.1) ** 2;
        expect(value).toBeLessThan(1 + 1e-4);
        maxValue = Math.max(maxValue, value);
      }
      expect(maxValue).toBeCloseTo(1, 4);
    });
  });

  describe("sphere", () => {
    // Red if the radii are mixed up between axes.
    it("is an ellipsoid with radii w/2, h/2, d/2", () => {
      const part = makePart("sphere", [0.6, 0.4, 0.2]);
      expectSize(part, [0.6, 0.4, 0.2], 2);
      for (const v of getVertices(buildPartGeometry(part))) {
        expect((v.x / 0.3) ** 2 + (v.y / 0.2) ** 2 + (v.z / 0.1) ** 2).toBeCloseTo(1, 4);
      }
    });
  });

  describe("capsule", () => {
    // Red if the radius is not min(w, d)/2 or the total height excludes the caps.
    it("has radius min(w, d)/2 and total height h along y", () => {
      expectSize(makePart("capsule", [0.4, 1.2, 0.6]), [0.4, 1.2, 0.4], 2);
    });
  });

  describe("torus", () => {
    // Red if the ring is not in the x/z plane or the tube radius is not used for the y extent.
    it("lies in the x/z plane with the outer extent w x d and the given tube radius", () => {
      expectSize(makePart("torus", [1, 0.2, 0.8], { tube: 0.05 }), [1, 0.1, 0.8], 1);
    });

    // Red if the default tube radius is not h/2.
    it("defaults the tube radius to h/2", () => {
      const { size } = boundsOf(buildPartGeometry(makePart("torus", [1, 0.2, 1])));
      expect(size.y).toBeCloseTo(0.2, 2);
    });
  });

  describe("plane", () => {
    const geometry = buildPartGeometry(makePart("plane", [2, 0.5, 1]));

    // Red if the plane is vertical or sized with h.
    it("is a flat w x d rectangle at the box centre", () => {
      const { size, center } = boundsOf(geometry);
      expect(size.x).toBeCloseTo(2, 6);
      expect(size.y).toBeCloseTo(0, 6);
      expect(size.z).toBeCloseTo(1, 6);
      expect(center.x).toBeCloseTo(0, 6);
      expect(center.y).toBeCloseTo(0, 6);
      expect(center.z).toBeCloseTo(0, 6);
    });

    // Red if the plane faces down in normals or winding.
    it("faces +y", () => {
      for (const t of getTriangles(geometry)) {
        expect(t.faceNormal.y).toBeGreaterThan(0.99);
        for (const normal of t.normals) expect(normal.y).toBeGreaterThan(0.99);
      }
    });
  });

  describe("cushion", () => {
    const bulge = (fill: number, h: number) => (fill * Math.min(h, 0.1)) / 2;

    // Red if fill 0 changes the outline (a cushion without puffiness is a rounded box).
    it("is a rounded box of size w x h x d without fill", () => {
      expectSize(makePart("cushion", [0.6, 0.2, 0.5], { bevel: 0.04, fill: 0 }), [0.6, 0.2, 0.5], 5);
    });

    // Red if the bulge deviates from fill * min(h, 0.1) / 2 on top and bottom (fill 0.5, h 0.2 -> 0.025 each).
    it("bulges top and bottom outwards by fill * min(h, 0.1) / 2", () => {
      const b = bulge(0.5, 0.2);
      const { size } = boundsOf(buildPartGeometry(makePart("cushion", [0.6, 0.2, 0.5], { bevel: 0.04, fill: 0.5 })));
      expect(size.y).toBeCloseTo(0.2 + 2 * b, 5);
      expect(size.x).toBeCloseTo(0.6, 5);
      expect(size.z).toBeCloseTo(0.5, 5);
    });

    // Red if min(h, 0.1) is missing (a tall cushion would bulge by fill * h / 2).
    it("caps the bulge reference height at 0.1", () => {
      const { size } = boundsOf(buildPartGeometry(makePart("cushion", [0.6, 0.5, 0.5], { bevel: 0.04, fill: 1 })));
      expect(size.y).toBeCloseTo(0.5 + 2 * bulge(1, 0.5), 5);
    });

    // Red if a thin cushion uses 0.1 instead of h (h = 0.04 -> bulge 0.02).
    it("uses h as bulge reference for thin cushions", () => {
      const { size } = boundsOf(buildPartGeometry(makePart("cushion", [0.6, 0.04, 0.5], { bevel: 0.01, fill: 1 })));
      expect(size.y).toBeCloseTo(0.04 + 2 * bulge(1, 0.04), 5);
    });

    // Red if the default fill is not 0.5.
    it("defaults fill to 0.5", () => {
      const withDefault = boundsOf(buildPartGeometry(makePart("cushion", [0.6, 0.2, 0.5], { bevel: 0.04 }))).size.y;
      const explicit = boundsOf(buildPartGeometry(makePart("cushion", [0.6, 0.2, 0.5], { bevel: 0.04, fill: 0.5 }))).size.y;
      expect(withDefault).toBeCloseTo(explicit, 6);
      expect(withDefault).toBeGreaterThan(0.2 + 1e-4);
    });

    // Red if the bulge is not centred in the middle of the top face (the highest vertex lies at the centre column).
    it("puts the highest point of the top face in the middle", () => {
      const top = getVertices(buildPartGeometry(makePart("cushion", [0.6, 0.2, 0.5], { bevel: 0.04, fill: 1 })));
      const maxY = Math.max(...top.map((v) => v.y));
      const highest = top.filter((v) => v.y > maxY - 1e-6);
      for (const v of highest) {
        expect(Math.abs(v.x)).toBeLessThan(0.3 - 0.04 - 1e-6);
        expect(Math.abs(v.z)).toBeLessThan(0.25 - 0.04 - 1e-6);
      }
    });
  });

  describe("lathe", () => {
    // Red if the profile is not centred by -h/2 or the revolve axis is not y.
    it("revolves the profile around y and centres it vertically", () => {
      const { min, max, size } = boundsOf(buildPartGeometry(makePart("lathe", [0.4, 1, 0.4], { profile: PROFILE })));
      expect(min.y).toBeCloseTo(-0.5, 5);
      expect(max.y).toBeCloseTo(0.5, 5);
      expect(size.x).toBeCloseTo(0.4, 2);
      expect(size.z).toBeCloseTo(0.4, 2);
    });

    // Red if the profile radius is ignored: the widest ring comes from the profile.
    it("takes the radius from the profile", () => {
      const vertices = getVertices(buildPartGeometry(makePart("lathe", [0.4, 1, 0.4], { profile: PROFILE })));
      const topRing = vertices.filter((v) => v.y > 0.5 - 1e-6);
      for (const v of topRing) expect(Math.hypot(v.x, v.z)).toBeCloseTo(0.1, 5);
    });

    // Red if a missing profile throws (builders never throw).
    it("does not throw without a profile", () => {
      expect(() => buildPartGeometry(makePart("lathe", [0.4, 1, 0.4]))).not.toThrow();
    });
  });

  describe("extrude", () => {
    // Red if the outline is extruded along the wrong axis or not centred in z.
    it("extrudes the outline along z by d, centred in z", () => {
      const { min, max, size } = boundsOf(buildPartGeometry(makePart("extrude", [1, 0.5, 0.3], { profile: OUTLINE })));
      expect(min.z).toBeCloseTo(-0.15, 5);
      expect(max.z).toBeCloseTo(0.15, 5);
      expect(size.x).toBeCloseTo(1, 5);
      expect(size.y).toBeCloseTo(0.5, 5);
    });

    // Red if a missing outline throws (builders never throw).
    it("does not throw without an outline", () => {
      expect(() => buildPartGeometry(makePart("extrude", [1, 0.5, 0.3]))).not.toThrow();
    });
  });

  describe("model", () => {
    // Red if the placeholder is not a w x h x d box.
    it("is a plain box placeholder", () => {
      expectSize(makePart("model", [0.7, 0.4, 0.2], { modelId: "model_x" }), [0.7, 0.4, 0.2], 6);
    });
  });

  describe("degenerate sizes", () => {
    // Red if a zero or negative size yields a zero-size box (clamp to 0.01 m).
    it.each(["box", "model"] as const)("clamps %s sizes <= 0 to 0.01 m", (shape) => {
      expectSize(makePart(shape, [0, -1, 0]), [0.01, 0.01, 0.01], 6);
    });

    // Red if any shape throws or produces NaN for degenerate sizes.
    it.each(SHAPES)("never throws and stays finite for %s with zero size", (shape) => {
      const part = makePart(shape, [0, 0, 0], { profile: shape === "extrude" ? OUTLINE : PROFILE });
      let geometry: ReturnType<typeof buildPartGeometry> | undefined;
      expect(() => { geometry = buildPartGeometry(part); }).not.toThrow();
      expect(hasOnlyFiniteValues(geometry!)).toBe(true);
      expect(geometry!.getAttribute("position").count).toBeGreaterThan(0);
    });

    // Red if the clamp applies only to some axes.
    it("clamps each axis independently", () => {
      expectSize(makePart("box", [1, 0, 2]), [1, 0.01, 2], 6);
    });
  });
});
