// Session state shared by the panel, the scope and the picker: the latest
// frame sample and which hue (if any) the on-image picker is armed for.
// Built on the host's zustand `create` so the components subscribe like core.

import { api } from "./runtime";
import type { StoreApi } from "./safelight";

/** Which hue the picker writes: the anchor, or a custom node slot. */
export type PickTarget = "anchor" | 0 | 1 | 2 | 3;

/** A downscaled render reduced to what the scope and inference need. */
export interface ScopeSample {
  /** (RYB hue turn, chroma) per pixel, interleaved. */
  points: Float32Array;
  count: number;
  /** Chroma-weighted UCS hue histogram, HUE_BINS bins. */
  histogram: Float32Array;
  width: number;
  height: number;
}

export interface HarmonyUiState {
  sample: ScopeSample | null;
  picking: PickTarget | null;
  setSample(sample: ScopeSample | null): void;
  setPicking(target: PickTarget | null): void;
}

let current: StoreApi<HarmonyUiState> | null = null;

export function initStore(): void {
  current = api().stores.create<HarmonyUiState>((set) => ({
    sample: null,
    picking: null,
    setSample: (sample) => set({ sample }),
    setPicking: (picking) => set({ picking }),
  }));
}

export function store(): StoreApi<HarmonyUiState> {
  if (!current) throw new Error("[colour-harmony] store() called before activate()");
  return current;
}
