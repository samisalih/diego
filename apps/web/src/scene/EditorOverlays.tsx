import { itemClearances, type Obb, type Vec2 } from "@app/core";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";
import { useSceneStore } from "../data/store.ts";
import { de } from "../i18n/de.ts";
import { useEditorStore } from "../editor/editorStore.ts";
import { useEffectiveItems, useLayoutAnalysis } from "../editor/layoutAnalysis.ts";
import { flaggedSelectedFootprints, passageLines } from "../editor/viewportFeedback.ts";
import { tokenColor } from "./tokens.ts";

const LINE_LIFT_M = 0.012;
const FOOTPRINT_LIFT_M = 0.014;
const NARROW_CLEARANCE_M = 0.3;
const FOOTPRINT_OPACITY = 0.28;
const LINE_WIDTH_M = 0.032;
const LINE_EDGE_WIDTH_M = 0.06;
const LINE_EDGE_OPACITY = 0.55;
const MAX_SEGMENTS = 128;
const FLOATS_PER_SEGMENT = 18;
/** Annotations live on their own layer so the contact shadow bake (camera layer 0 only) never sees them. */
export const OVERLAY_LAYER = 1;

type Segment = [from: Vec2, to: Vec2];

function lift(point: Vec2, height: number): [number, number, number] {
  return [point[0], height, point[1]];
}

function writeRibbon(target: Float32Array, index: number, [from, to]: Segment, halfWidth: number): boolean {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (length < 1e-6) return false;
  const [nx, nz] = [(-(to[1] - from[1]) / length) * halfWidth, ((to[0] - from[0]) / length) * halfWidth];
  const corners = [
    [from[0] - nx, from[1] - nz], [from[0] + nx, from[1] + nz], [to[0] + nx, to[1] + nz],
    [from[0] - nx, from[1] - nz], [to[0] + nx, to[1] + nz], [to[0] - nx, to[1] - nz],
  ] as const;
  corners.forEach(([x, z], corner) => target.set([x, LINE_LIFT_M, z], index * FLOATS_PER_SEGMENT + corner * 3));
  return true;
}

/** Flat ribbons of the given width in one draw call; the buffer is rewritten in place, so a dragged segment allocates nothing. */
function RibbonLayer({ segments, color, widthM, opacity = 1, order }: { segments: Segment[]; color: string; widthM: number; opacity?: number; order: number }) {
  const geometry = useMemo(() => {
    const created = new BufferGeometry();
    created.setAttribute("position", new BufferAttribute(new Float32Array(MAX_SEGMENTS * FLOATS_PER_SEGMENT), 3));
    return created;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const positions = geometry.getAttribute("position") as BufferAttribute;
    let written = 0;
    for (const segment of segments.slice(0, MAX_SEGMENTS)) {
      if (writeRibbon(positions.array as Float32Array, written, segment, widthM / 2)) written += 1;
    }
    positions.needsUpdate = true;
    geometry.setDrawRange(0, written * 6);
    geometry.computeBoundingSphere();
  }, [segments, geometry, widthM]);

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={order} layers={OVERLAY_LAYER}>
      <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

/** A coloured line with a dark edge around it, so it reads on light and dark floors alike. */
function Lines({ segments, color }: { segments: Segment[]; color: string }) {
  return (
    <>
      <RibbonLayer segments={segments} color={tokenColor("--ink")} widthM={LINE_EDGE_WIDTH_M} opacity={LINE_EDGE_OPACITY} order={2} />
      <RibbonLayer segments={segments} color={color} widthM={LINE_WIDTH_M} order={3} />
    </>
  );
}

function boxEdges(box: Obb): Segment[] {
  const cos = Math.cos(box.angle);
  const sin = Math.sin(box.angle);
  const corner = (signX: number, signZ: number): Vec2 => [
    box.cx + cos * box.hx * signX + sin * box.hz * signZ,
    box.cz - sin * box.hx * signX + cos * box.hz * signZ,
  ];
  const corners = [corner(1, 1), corner(1, -1), corner(-1, -1), corner(-1, 1)];
  return corners.map((start, index) => [start, corners[(index + 1) % corners.length]!]);
}

function Label({ at, centimetres, className }: { at: Vec2; centimetres: number; className: string }) {
  return (
    <Html position={lift(at, LINE_LIFT_M)} center style={{ pointerEvents: "none" }}>
      <span className={`scene-label ${className}`}>{de.scene.distanceLabel(centimetres)}</span>
    </Html>
  );
}

function midpoint([from, to]: Segment): Vec2 {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
}

function FootprintRectangle({ box }: { box: Obb }) {
  return (
    <group position={[box.cx, FOOTPRINT_LIFT_M, box.cz]} rotation={[0, box.angle, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} layers={OVERLAY_LAYER}>
        <planeGeometry args={[box.hx * 2, box.hz * 2]} />
        <meshBasicMaterial color={tokenColor("--red")} transparent opacity={FOOTPRINT_OPACITY} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Scene annotations: distance lines of a single selected item, narrow passages and red footprints. */
export function EditorOverlays() {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.layers.enable(OVERLAY_LAYER);
  }, [camera]);
  const document = useSceneStore((state) => state.document);
  const assets = useSceneStore((state) => state.assets);
  const selectedIds = useEditorStore((state) => state.selection.selectedIds);
  const items = useEffectiveItems();
  const analysis = useLayoutAnalysis();
  const assetList = useMemo(() => [...assets.values()], [assets]);
  const apartment = document?.apartment;
  const issues = analysis?.issues;

  const clearances = useMemo(() => {
    const [onlyId] = selectedIds;
    if (!document || !apartment || selectedIds.length !== 1 || onlyId === undefined) return [];
    return itemClearances({ ...document, items }, assetList, onlyId);
    // The clearance depends on the walls and the displayed items, not on the document version.
  }, [apartment, items, assetList, selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const footprints = useMemo(() => (issues ? flaggedSelectedFootprints(items, selectedIds, assets, issues) : []), [items, selectedIds, assets, issues]);
  const passages = useMemo(() => (issues && apartment ? passageLines(issues, items, apartment.walls, assets) : []), [issues, items, apartment, assets]);

  const roomy = clearances.filter((clearance) => clearance.distance >= NARROW_CLEARANCE_M);
  const tight = clearances.filter((clearance) => clearance.distance < NARROW_CLEARANCE_M);
  const toSegment = ({ from, to }: { from: Vec2; to: Vec2 }): Segment => [from, to];
  const creamSegments = useMemo(() => roomy.map(toSegment), [clearances]); // eslint-disable-line react-hooks/exhaustive-deps
  const mustardSegments = useMemo(() => tight.map(toSegment), [clearances]); // eslint-disable-line react-hooks/exhaustive-deps
  const redSegments = useMemo(() => [...passages.map(toSegment), ...footprints.flatMap(boxEdges)], [passages, footprints]);

  return (
    <>
      <Lines segments={creamSegments} color={tokenColor("--cream")} />
      <Lines segments={mustardSegments} color={tokenColor("--mustard")} />
      <Lines segments={redSegments} color={tokenColor("--red")} />
      {clearances.map((clearance) => (
        <Label key={clearance.side} at={midpoint([clearance.from, clearance.to])} centimetres={Math.round(clearance.distance * 100)} className={clearance.distance < NARROW_CLEARANCE_M ? "scene-label-warning" : ""} />
      ))}
      {passages.map((passage) => (
        <Label key={passage.key} at={midpoint([passage.from, passage.to])} centimetres={passage.centimetres} className="scene-label-danger" />
      ))}
      {footprints.map((box, index) => (
        <FootprintRectangle key={index} box={box} />
      ))}
    </>
  );
}
