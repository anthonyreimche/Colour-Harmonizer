// Session state shared by the panel and the scope: the latest frame sample.
// Built on the host's zustand `create` so the components subscribe like core.

import { api } from "./runtime";
import type { StoreApi } from "./safelight";

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
  setSample(sample: ScopeSample | null): void;
}

let current: StoreApi<HarmonyUiState> | null = null;

export function initStore(): void {
  current = api().stores.create<HarmonyUiState>((set) => ({
    sample: null,
    setSample: (sample) => set({ sample }),
  }));
}

export function store(): StoreApi<HarmonyUiState> {
  if (!current) throw new Error("[colour-harmony] store() called before activate()");
  return current;
}
