import { itemClearances, type Obb, type Vec2 } from "@app/core";
import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, type LineSegments } from "three";
import { useSceneStore } from "../data/store.ts";
import { de } from "../i18n/de.ts";
import { useEditorStore } from "../editor/editorStore.ts";
import { useEffectiveItems, useLayoutAnalysis } from "../editor/layoutAnalysis.ts";
import { flaggedSelectedFootprints, passageLines } from "../editor/viewportFeedback.ts";
import { tokenColor } from "./tokens.ts";

const LINE_LIFT_M = 0.01;
const FOOTPRINT_LIFT_M = 0.012;
const NARROW_CLEARANCE_M = 0.3;
const FOOTPRINT_OPACITY = 0.28;
const MAX_SEGMENTS = 128;
const FLOATS_PER_SEGMENT = 6;

type Segment = [from: Vec2, to: Vec2];

function lift(point: Vec2, height: number): [number, number, number] {
  return [point[0], height, point[1]];
}

/**
 * Many line segments of one colour in a single draw call. The buffer is rewritten in place, so a segment
 * that follows a dragged item costs no allocation (fat Line2 geometries rebuilt per frame broke the frame budget).
 */
function SegmentLayer({ segments, color }: { segments: Segment[]; color: string }) {
  const lines = useRef<LineSegments>(null);
  const geometry = useMemo(() => {
    const created = new BufferGeometry();
    created.setAttribute("position", new BufferAttribute(new Float32Array(MAX_SEGMENTS * FLOATS_PER_SEGMENT), 3));
    return created;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const positions = geometry.getAttribute("position") as BufferAttribute;
    const count = Math.min(segments.length, MAX_SEGMENTS);
    segments.slice(0, count).forEach(([from, to], index) => {
      positions.set([...lift(from, LINE_LIFT_M), ...lift(to, LINE_LIFT_M)], index * FLOATS_PER_SEGMENT);
    });
    positions.needsUpdate = true;
    geometry.setDrawRange(0, count * 2);
    geometry.computeBoundingSphere();
  }, [segments, geometry]);

  return (
    <lineSegments ref={lines} geometry={geometry} frustumCulled={false} renderOrder={2}>
      <lineBasicMaterial color={color} />
    </lineSegments>
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[box.hx * 2, box.hz * 2]} />
        <meshBasicMaterial color={tokenColor("--red")} transparent opacity={FOOTPRINT_OPACITY} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Scene annotations: distance lines of a single selected item, narrow passages and red footprints. */
export function EditorOverlays() {
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
      <SegmentLayer segments={creamSegments} color={tokenColor("--cream")} />
      <SegmentLayer segments={mustardSegments} color={tokenColor("--mustard")} />
      <SegmentLayer segments={redSegments} color={tokenColor("--red")} />
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
