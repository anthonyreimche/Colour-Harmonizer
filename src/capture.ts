// Live pixels for the scope, the inference and the picker. Core recomputes the
// develop histogram after every settled render (throttled), so its identity
// changing is the "frame changed" signal; on each one the sampler captures an
// off-screen frame of the live view (api.develop.captureFrame), shrinks it to
// SAMPLE_LONG_EDGE, and reduces it to RYB polar points plus a chroma-weighted
// UCS hue histogram. Captures are throttled and coalesced — one in flight at a
// time, at most one queued — and stop with the photo. The panel starts the
// sampler while mounted, so a closed panel costs nothing.
//
// The sample is display-referred (the rendered frame), as darktable's
// vectorscope is; darktable's module reads its own pipeline input for the
// histogram and picker — hue survives the tone transform closely enough.

import { HUE_BINS } from "./harmony";
import { api } from "./runtime";
import type { DevelopParams, DevelopStoreState, StoreApi } from "./safelight";
import { scopePolar } from "./scope";
import { store, type ScopeSample } from "./store";
import { hueTurn, linearSrgbToJch, srgbToLinear } from "./ucs";

export const SAMPLE_LONG_EDGE = 192;
export const CAPTURE_THROTTLE_MS = 150;

const DECODE = new Float32Array(256);
for (let i = 0; i < 256; i++) DECODE[i] = srgbToLinear(i / 255);

/** Reduce an 8-bit sRGB RGBA buffer to a scope sample. */
export function sampleFromRgba(data: Uint8ClampedArray, width: number, height: number): ScopeSample {
  const count = width * height;
  const points = new Float32Array(count * 2);
  const histogram = new Float32Array(HUE_BINS);
  for (let i = 0; i < count; i++) {
    const r = DECODE[data[i * 4]];
    const g = DECODE[data[i * 4 + 1]];
    const b = DECODE[data[i * 4 + 2]];
    const [hue, chroma] = scopePolar([r, g, b]);
    points[i * 2] = hue;
    points[i * 2 + 1] = chroma;
    const [, C, H] = linearSrgbToJch([r, g, b]);
    if (C > 0.01) histogram[Math.floor(hueTurn(H) * HUE_BINS) % HUE_BINS] += C;
  }
  return { points, count, histogram, width, height };
}

export interface Readback {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

let scratch: OffscreenCanvas | null = null;

/** Draw a captured frame at ≤ SAMPLE_LONG_EDGE and read it back; null for a
 *  blank (the host's "no renderer" 1×1 bitmap). */
export function readbackBitmap(bitmap: ImageBitmap): Readback | null {
  const { width: bw, height: bh } = bitmap;
  if (bw < 2 || bh < 2) return null;
  const scale = Math.min(1, SAMPLE_LONG_EDGE / Math.max(bw, bh));
  const w = Math.max(1, Math.round(bw * scale));
  const h = Math.max(1, Math.round(bh * scale));
  if (!scratch) scratch = new OffscreenCanvas(w, h);
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

export interface SamplerDeps {
  develop: StoreApi<DevelopStoreState>;
  capture(params: DevelopParams): Promise<ImageBitmap>;
  readback(bitmap: ImageBitmap): Readback | null;
  publish(sample: ScopeSample | null): void;
  throttleMs?: number;
}

/** Follow the develop store and publish a fresh sample per settled render.
 *  Returns the stop function. */
export function startSampler(deps: SamplerDeps): () => void {
  const throttle = deps.throttleMs ?? CAPTURE_THROTTLE_MS;
  let stopped = false;
  let inFlight = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastStart = -Infinity;

  const run = () => {
    timer = null;
    const state = deps.develop.getState();
    if (stopped || !state.photoId) return;
    inFlight = true;
    lastStart = Date.now();
    deps
      .capture(state.previewParams ?? state.params)
      .then((bitmap) => {
        const read = stopped ? null : deps.readback(bitmap);
        bitmap.close?.();
        if (stopped) return;
        deps.publish(read ? sampleFromRgba(read.data, read.width, read.height) : null);
      })
      .catch(() => {
        if (!stopped) deps.publish(null);
      })
      .finally(() => {
        inFlight = false;
        if (queued && !stopped) {
          queued = false;
          request();
        }
      });
  };

  const request = () => {
    if (stopped) return;
    if (inFlight) {
      queued = true;
      return;
    }
    if (timer !== null) return;
    const wait = Math.max(0, throttle - (Date.now() - lastStart));
    timer = setTimeout(run, wait);
  };

  const unsubscribe = deps.develop.subscribe((state, prev) => {
    if (state.photoId !== prev.photoId && !state.photoId) {
      queued = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      deps.publish(null);
      return;
    }
    if (state.photoId && (state.histogram !== prev.histogram || state.photoId !== prev.photoId)) request();
  });

  request();

  return () => {
    stopped = true;
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

/** The production sampler over the live app. */
export function startLiveSampler(): () => void {
  const a = api();
  return startSampler({
    develop: a.stores.useDevelopStore,
    capture: (params) => a.develop.captureFrame(params),
    readback: readbackBitmap,
    publish: (sample) => store().getState().setSample(sample),
  });
}
