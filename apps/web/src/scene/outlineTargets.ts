import type { Object3D } from "three";
import { create } from "zustand";

/** The meshes the two outline effects draw around; written by the items, read by the effects. */
type OutlineTargets = { selected: Object3D[]; flagged: Object3D[]; setTargets: (selected: Object3D[], flagged: Object3D[]) => void };

export const useOutlineTargets = create<OutlineTargets>()((set) => ({
  selected: [],
  flagged: [],
  setTargets: (selected, flagged) => set({ selected, flagged }),
}));
