import { useSceneStore } from "../data/store.ts";
import { useEditorStore } from "../editor/editorStore.ts";

const SIMULATION_START_DELAY_MS = 7000;
const SIMULATION_DURATION_MS = 8000;
const SIMULATION_RADIUS_M = 0.6;
const SIMULATION_LAPS = 3;
const SIMULATION_SAMPLES = 400;

type SimulationResult = { frames: number; medianMs: number; p95Ms: number; qualityLevel: number };

function hashParam(name: string): string | null {
  return new RegExp(`[?&]${name}=([^&]*)`).exec(window.location.hash)?.[1] ?? null;
}

/** Moves one item on a circle through the same preview path a real drag uses, and records frame times. */
function simulateDrag(itemId: string, durationMs: number): Promise<SimulationResult> {
  const item = useSceneStore.getState().document?.items.find((candidate) => candidate.id === itemId);
  const stats = window as unknown as { __frameStats?: (lastN: number) => SimulationResult; __frameStatsReset?: () => void };
  if (!item) return Promise.reject(new Error(`No item ${itemId}`));
  stats.__frameStatsReset?.();
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const step = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const angle = progress * SIMULATION_LAPS * Math.PI * 2;
      useEditorStore.getState().setDragPreview(new Map([[itemId, { x: item.x + Math.sin(angle) * SIMULATION_RADIUS_M, z: item.z + (1 - Math.cos(angle)) * SIMULATION_RADIUS_M }]]));
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      useEditorStore.getState().setDragPreview(null);
      resolve(stats.__frameStats?.(SIMULATION_SAMPLES) as SimulationResult);
    };
    requestAnimationFrame(step);
  });
}

/**
 * Dev only, fixture mode: `&select=item_sofa` selects, `&focus=room_living` focuses, `&drag=item_sofa:0.8,0.2`
 * shows a static drag preview, `&dragsim=item_sofa` runs a simulated drag and leaves the frame stats in
 * `window.__dragSimResult`.
 */
export function installEditorDevHooks(): () => void {
  const editor = useEditorStore.getState();
  const select = hashParam("select");
  const focus = hashParam("focus");
  if (select) editor.replaceSelection({ selectedIds: select.split(","), focusId: null });
  if (focus) editor.replaceSelection({ selectedIds: [], focusId: focus });

  const drag = hashParam("drag");
  const [dragId, dragOffset] = drag?.split(":") ?? [];
  const [dx, dz] = (dragOffset ?? "").split(",").map(Number);
  const item = useSceneStore.getState().document?.items.find((candidate) => candidate.id === dragId);
  if (item && dx !== undefined && dz !== undefined) editor.setDragPreview(new Map([[item.id, { x: item.x + dx, z: item.z + dz }]]));

  const target = window as unknown as Record<string, unknown>;
  target.__simulateDrag = simulateDrag;
  const simulationItemId = hashParam("dragsim");
  const timer = simulationItemId
    ? setTimeout(() => {
        editor.replaceSelection({ selectedIds: [simulationItemId], focusId: null });
        void simulateDrag(simulationItemId, SIMULATION_DURATION_MS).then((result) => {
          target.__dragSimResult = result;
        });
      }, SIMULATION_START_DELAY_MS)
    : undefined;

  return () => {
    clearTimeout(timer);
    delete target.__simulateDrag;
  };
}
