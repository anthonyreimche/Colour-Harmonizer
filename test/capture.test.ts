// The frame sampler: the pixel pass that turns a captured frame into scope
// points and a hue histogram, and the scheduling around api.develop.captureFrame
// — one capture per settled render, throttled, coalesced while one is in
// flight, silent without a photo, and cleared when the photo closes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUE_BINS } from "../src/harmony";
import { rgbHueToRybHueSpline } from "../src/ryb";
import { hueTurn, linearSrgbToJch, linearToSrgb } from "../src/ucs";
import { CAPTURE_THROTTLE_MS, sampleFromRgba, startSampler, type SamplerDeps } from "../src/capture";
import type { ScopeSample } from "../src/store";
import type { DevelopParams, DevelopStoreState, StoreApi } from "../src/safelight";

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const srgb8 = (v: number) => Math.round(linearToSrgb(v) * 255);

function rgba(...pixels: [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    out[i * 4] = srgb8(r);
    out[i * 4 + 1] = srgb8(g);
    out[i * 4 + 2] = srgb8(b);
    out[i * 4 + 3] = 255;
  });
  return out;
}

describe("sampleFromRgba", () => {
  it("decodes sRGB and places each pixel on the RYB wheel with its chroma", () => {
    const s = sampleFromRgba(rgba([1, 0, 0], [0.18, 0.18, 0.18], [0, 0, 1], [0, 0, 0]), 2, 2);
    expect(s.count).toBe(4);
    expect(s.width).toBe(2);
    expect(s.height).toBe(2);
    expect(s.points.length).toBe(8);
    // Points are stored as float32.
    expect(close(s.points[0], 0, 1e-6)).toBe(true);
    expect(close(s.points[1], 1, 1e-6)).toBe(true);
    expect(s.points[3]).toBe(0);
    expect(close(s.points[4], rgbHueToRybHueSpline(2 / 3), 1e-6)).toBe(true);
    expect(close(s.points[5], 1, 1e-6)).toBe(true);
    expect(s.points[7]).toBe(0);
  });

  it("builds the chroma-weighted UCS hue histogram from the same pixels, skipping neutrals", () => {
    const s = sampleFromRgba(rgba([0.6, 0.12, 0.12], [0.18, 0.18, 0.18], [0.1, 0.1, 0.6], [0, 0, 0]), 4, 1);
    expect(s.histogram.length).toBe(HUE_BINS);
    const [, cRed, hRed] = linearSrgbToJch([0.6, 0.12, 0.12]);
    const [, cBlue, hBlue] = linearSrgbToJch([0.1, 0.1, 0.6]);
    let total = 0;
    for (const v of s.histogram) total += v;
    // 8-bit quantisation of the input moves each chroma by well under a percent.
    expect(close(total, cRed + cBlue, 0.01 * (cRed + cBlue))).toBe(true);
    expect(s.histogram[Math.floor(hueTurn(hRed) * HUE_BINS) % HUE_BINS]).toBeGreaterThan(0);
    expect(s.histogram[Math.floor(hueTurn(hBlue) * HUE_BINS) % HUE_BINS]).toBeGreaterThan(0);
  });
});

function fakeDevelop(state: Partial<DevelopStoreState>): StoreApi<DevelopStoreState> {
  let s = state as DevelopStoreState;
  const listeners = new Set<(a: DevelopStoreState, b: DevelopStoreState) => void>();
  const hook = ((selector?: (x: DevelopStoreState) => unknown) => (selector ? selector(s) : s)) as StoreApi<DevelopStoreState>;
  hook.getState = () => s;
  hook.setState = (partial) => {
    const prev = s;
    s = { ...s, ...(typeof partial === "function" ? partial(s) : partial) };
    for (const l of listeners) l(s, prev);
  };
  hook.subscribe = (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return hook;
}

const PARAMS = { exposure: 0 } as unknown as DevelopParams;

interface Rig {
  deps: SamplerDeps;
  develop: StoreApi<DevelopStoreState>;
  captures: DevelopParams[];
  published: (ScopeSample | null)[];
  resolveCapture(): void;
}

function rig(state: Partial<DevelopStoreState>): Rig {
  const develop = fakeDevelop({ params: PARAMS, previewParams: null, paramBag: {}, histogram: null, photoId: null, ...state });
  const captures: DevelopParams[] = [];
  const published: (ScopeSample | null)[] = [];
  let resolvers: (() => void)[] = [];
  const deps: SamplerDeps = {
    develop,
    capture: (params) =>
      new Promise<ImageBitmap>((resolve) => {
        captures.push(params);
        resolvers.push(() => resolve({ width: 2, height: 1, close: () => undefined } as unknown as ImageBitmap));
      }),
    readback: () => ({ data: rgba([1, 0, 0], [0, 0, 1]), width: 2, height: 1 }),
    publish: (sample) => void published.push(sample),
  };
  return {
    deps,
    develop,
    captures,
    published,
    resolveCapture: () => {
      const pending = resolvers;
      resolvers = [];
      for (const r of pending) r();
    },
  };
}

describe("startSampler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("captures the open photo once at start and again when the histogram changes", async () => {
    const r = rig({ photoId: "p1", histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.captures.length).toBe(1);
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.published.length).toBe(1);
    expect(r.published[0]?.count).toBe(2);
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS);
    r.develop.setState({ histogram: { v: 2 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(r.captures.length).toBe(2);
    stop();
  });

  it("renders the preview params when a preview is showing", async () => {
    const preview = { exposure: 1 } as unknown as DevelopParams;
    const r = rig({ photoId: "p1", histogram: { v: 1 }, previewParams: preview });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.captures[0]).toBe(preview);
    stop();
  });

  it("coalesces changes inside the throttle window into one later capture", async () => {
    const r = rig({ photoId: "p1", histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(0);
    r.develop.setState({ histogram: { v: 2 } });
    r.develop.setState({ histogram: { v: 3 } });
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS / 2);
    expect(r.captures.length).toBe(1);
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS);
    expect(r.captures.length).toBe(2);
    stop();
  });

  it("waits for a capture in flight and then captures exactly once more", async () => {
    const r = rig({ photoId: "p1", histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.captures.length).toBe(1);
    r.develop.setState({ histogram: { v: 2 } });
    r.develop.setState({ histogram: { v: 3 } });
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.captures.length).toBe(1);
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.captures.length).toBe(2);
    stop();
  });

  it("stays silent without a photo and clears the sample when the photo closes", async () => {
    const r = rig({ photoId: null, histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.captures.length).toBe(0);
    r.develop.setState({ photoId: "p1", histogram: { v: 2 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(r.captures.length).toBe(1);
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(0);
    r.develop.setState({ photoId: null });
    expect(r.published[r.published.length - 1]).toBeNull();
    stop();
  });

  it("drops a result that lands after stop()", async () => {
    const r = rig({ photoId: "p1", histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.published.length).toBe(0);
    r.develop.setState({ histogram: { v: 2 } });
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.captures.length).toBe(1);
  });
});
