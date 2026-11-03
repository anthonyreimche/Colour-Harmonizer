// The stages on the real renderer. Run via `npm run test:gpu` (test/gpu/run.cjs
// copies this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//
//  • both stages compile and link on a real GLSL ES 3.00 driver, with the
//    host's uniform and helper namespacing;
//  • the defaults are a bit-exact no-op, smoothing on or off, through the
//    host's idle gate;
//  • the fused path equals darktable's fused process() (harmonizePixel) for
//    several rules, strengths and saturations;
//  • the smoothing path — map pass, eight blur draws, half-float targets, the
//    inline — equals a CPU à trous reference, and leaves regions far from a
//    hue boundary as the fused path renders them;
//  • inside a mask, each stage's copy applies the mask's values where the mask
//    covers and leaves every other pixel bit-exact, the smoothing copy running
//    its own map and blur passes.
//
// The timings it prints are SwiftShader (CPU) numbers, only useful relative to
// each other.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS,
  applyCorrection,
  harmonizePixel,
  harmonyNodes,
  pixelCorrection,
  type HarmonyParams,
} from "@ch/harmony";
import { deriveAll } from "@ch/params";
import { BLUR_LEVELS, BLUR_VARIANCE_SCALE, allStages, blurSigma } from "@ch/stage";
import { hsvToRgb, hueTurn, linearSrgbToJch, type Vec3 } from "@ch/ucs";
import { atrousBlur } from "@ch-test/support/blur";
import { CURRENT_PROCESS_VERSION, defaultMaskAdjustments, type Mask } from "@/catalog/types";
import type { ProcessingStageContribution } from "@/extensions/types";
import {
  LINEAR_PROBE_PIPELINE,
  OPEN_PROBE,
  type Frame,
  builtinStages,
  floatImage,
  identityParams,
  toHalf,
  withRenderer,
} from "@/rendering/webgl/webgl.test-support";

const W = 256;
const H = 256;
const N = W * H;

// ── Scenes ───────────────────────────────────────────────────────────────────

/** Hue by column, chroma by row, mid-dark: every rule finds colours to pull.
 *  Saturation stops at 0.7 so a full-strength pull keeps most results inside
 *  the probe pipeline's [0, 1]. */
function sweepScene(): Float64Array {
  const img = new Float64Array(N * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = hsvToRgb(x / W, 0.15 + (0.55 * y) / H, 0.45);
      const i = (y * W + x) * 3;
      img[i] = r;
      img[i + 1] = g;
      img[i + 2] = b;
    }
  }
  return img;
}

/** Two hues meeting at a vertical boundary: what smoothing acts on. */
function splitScene(): Float64Array {
  const img = new Float64Array(N * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = hsvToRgb(x < W / 2 ? 0.05 : 0.55, 0.6, 0.45);
      const i = (y * W + x) * 3;
      img[i] = r;
      img[i + 1] = g;
      img[i + 2] = b;
    }
  }
  return img;
}

/** Channels past white and colours outside sRGB, with strongly negative
 *  channels, by quarter, and a grey ramp: what process version 2 hands a
 *  scene-linear stage. */
function wideScene(): Float64Array {
  const img = new Float64Array(N * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const v = y / (H - 1);
      const rgb =
        y < H / 4
          ? [0.5 + 3.5 * u, 0.3 + 2.2 * u, 0.2 + 1.4 * u]
          : y < H / 2
            ? [0.2 + 1.2 * u, -0.05 - 0.45 * v, 0.1 + 0.9 * u]
            : y < (3 * H) / 4
              ? [-0.2 - 0.3 * u, 0.4 + 0.8 * v, -0.1 - 0.4 * v]
              : [0.05 + 0.8 * u, 0.05 + 0.8 * u, 0.05 + 0.8 * u];
      img.set(rgb, (y * W + x) * 3);
    }
  }
  return img;
}

const toImage = (src: Float64Array) =>
  floatImage(W, H, (x, y) => {
    const i = (y * W + x) * 3;
    return [src[i], src[i + 1], src[i + 2]];
  });

// ── References ───────────────────────────────────────────────────────────────

function fusedReference(src: Float64Array, p: HarmonyParams, version: number): Float64Array {
  const harmony = harmonyNodes(p);
  const out = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) {
    const [r, g, b] = harmonizePixel([src[i * 3], src[i * 3 + 1], src[i * 3 + 2]], p, harmony, version);
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}

/** darktable pulls toward the NEAREST node, so a hue near the midpoint
 *  between two nodes is pulled one way by the float32 GPU and the other by
 *  float64 — a discontinuity of the algorithm itself, not of the port. The
 *  GPU's hue (atan over pow over cancelling UCS terms) is good to about 0.1°
 *  on SwiftShader, so pixels within HUE_TIE of the midpoint between their two
 *  nearest nodes are left out of the comparison and counted. */
const HUE_TIE = 1.5e-3;

function tieMask(src: Float64Array, p: HarmonyParams): { keep: Uint8Array; ties: number } {
  const { nodes } = harmonyNodes(p);
  const keep = new Uint8Array(N).fill(1);
  let ties = 0;
  for (let i = 0; i < N; i++) {
    const [, , Hh] = linearSrgbToJch([Math.max(src[i * 3], 0), Math.max(src[i * 3 + 1], 0), Math.max(src[i * 3 + 2], 0)]);
    const hue = hueTurn(Hh);
    let nearest = 1;
    let second = 1;
    for (const node of nodes) {
      let d = Math.abs(hue - node);
      if (d > 0.5) d = 1 - d;
      if (d < nearest) {
        second = nearest;
        nearest = d;
      } else if (d < second) {
        second = d;
      }
    }
    if (nodes.length > 1 && second - nearest < 2 * HUE_TIE) {
      keep[i] = 0;
      ties++;
    }
  }
  return { keep, ties };
}

/** darktable's two-pass path with the stage's à trous blur (unit dilation 1
 *  texel, so every tap lands on a texel centre and filtering is moot). */
function smoothedReference(src: Float64Array, p: HarmonyParams, version: number): Float64Array {
  const harmony = harmonyNodes(p);
  const pixel = (i: number): Vec3 => [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]];
  const field = new Float64Array(N * 2);
  for (let i = 0; i < N; i++) {
    const { hueShift, satDelta } = pixelCorrection(pixel(i), p, harmony);
    field[i * 2] = hueShift;
    field[i * 2 + 1] = satDelta;
  }
  const blurred = atrousBlur(field, W, H, 2, 1, BLUR_LEVELS);
  const out = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) {
    const [r, g, b] = applyCorrection(pixel(i), { hueShift: blurred[i * 2], satDelta: blurred[i * 2 + 1] }, p, version);
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}

// ── Comparison ───────────────────────────────────────────────────────────────

interface Comparison {
  /** rms of the GPU change against the reference change. */
  rmse: number;
  /** rms of the reference change itself — the scale the error is judged on. */
  changeRms: number;
  max: number;
  /** Share of samples left out because the probe pipeline would clamp them. */
  clipped: number;
  /** Samples whose error exceeds 1 % — a flipped branch, not precision. */
  outliers: number;
  worst: string;
  /** Pixel indices of the first few outliers, for diagnosis. */
  outlierPixels: number[];
}

// The probe pipeline clamps its output to [0, 1]; a saturation boost can push
// a channel out of that range, and such samples are not comparable.
const CLIP_LO = 0.002;
const CLIP_HI = 0.998;

function compare(on: Frame, off: Frame, ref: Float64Array, src: Float64Array, keep?: (p: number) => boolean): Comparison {
  let se = 0;
  let max = 0;
  let change = 0;
  let n = 0;
  let clipped = 0;
  let outliers = 0;
  let worst = "";
  const outlierPixels: number[] = [];
  for (let p = 0; p < N; p++) {
    if (keep && !keep(p)) continue;
    for (let ch = 0; ch < 3; ch++) {
      const out = ref[p * 3 + ch];
      if (out < CLIP_LO || out > CLIP_HI) {
        clipped++;
        continue;
      }
      const g = on.data[p * 4 + ch] - off.data[p * 4 + ch];
      const r = out - src[p * 3 + ch];
      const e = g - r;
      se += e * e;
      change += r * r;
      n++;
      if (Math.abs(e) > 0.01) {
        outliers++;
        if (outlierPixels.length < 8 && !outlierPixels.includes(p)) outlierPixels.push(p);
      }
      if (Math.abs(e) > max) {
        max = Math.abs(e);
        worst = `x=${p % W} y=${Math.floor(p / W)} ch=${ch} src=${src[p * 3 + ch].toFixed(4)} ref=${out.toFixed(4)} gpu=${on.data[p * 4 + ch].toFixed(4)} off=${off.data[p * 4 + ch].toFixed(4)}`;
      }
    }
  }
  return {
    rmse: Math.sqrt(se / Math.max(1, n)),
    changeRms: Math.sqrt(change / Math.max(1, n)),
    max,
    clipped: clipped / (N * 3),
    outliers,
    worst,
    outlierPixels,
  };
}

/** For diagnosis: a pixel's CPU hue and its per-node weights. */
function describePixel(src: Float64Array, p: HarmonyParams, px: number): string {
  const { nodes } = harmonyNodes(p);
  const sigma = (p.pullWidth * 0.5) / nodes.length;
  const [, C, Hh] = linearSrgbToJch([Math.max(src[px * 3], 0), Math.max(src[px * 3 + 1], 0), Math.max(src[px * 3 + 2], 0)]);
  const hue = hueTurn(Hh);
  const weights = nodes.map((node) => {
    let d = Math.abs(hue - node);
    if (d > 0.5) d = 1 - d;
    return Math.exp((-d * d) / (2 * sigma * sigma)).toExponential(3);
  });
  return `(${px % W},${Math.floor(px / W)}) hue=${hue.toFixed(6)} C=${C.toFixed(4)} w=[${weights.join(" ")}]`;
}

function expectBitExact(a: Frame | null, b: Frame | null, keep: (p: number) => boolean = () => true): void {
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  for (let p = 0; p < N; p++) {
    if (!keep(p)) continue;
    for (let ch = 0; ch < 4; ch++) expect(a!.data[p * 4 + ch]).toBe(b!.data[p * 4 + ch]);
  }
}

// ── Masks ────────────────────────────────────────────────────────────────────

/** Stage copies run in masks from process version 2 on. */
const MASKED_VERSION = 2;

/** A mask holding `bag`, whose linear gradient steps at u = `at`: it covers
 *  the columns right of the step, fully. The host floors a gradient's squared
 *  length at 1e-6, so this one is 1e-3 long, a quarter pixel here; a shorter
 *  one would ramp over 1e-2, nearly three. */
function stepMask(at: number, bag: Record<string, unknown>): Mask {
  return {
    id: "m",
    name: "Mask",
    visible: true,
    invert: false,
    opacity: 100,
    adj: defaultMaskAdjustments(),
    panels: ["colour-harmony.panel"],
    bag,
    components: [{ id: "step", kind: "linear", mode: "add", invert: false, linear: { x0: at, y0: 0, x1: at + 1e-3, y1: 0 } }],
  };
}

/** Columns clear of the pixel a step at u = `at` straddles, either side. */
const leftOf = (at: number) => (p: number) => p % W < at * W - 1;
const rightOf = (at: number) => (p: number) => p % W > at * W;

interface MaskedFrames {
  off: Frame | null;
  on: Frame | null;
  /** Prepass draws the masked frame took. */
  passDraws: number;
}

/** The photo at the defaults, without and then with `mask`. */
function maskedFrames(image: ReturnType<typeof toImage>, mask: Mask): MaskedFrames {
  return withRenderer({ stages: [...builtinStages(), ...allStages()], pipeline: LINEAR_PROBE_PIPELINE }, (r) => {
    r.setImage(image);
    r.setContributedParams(deriveAll(DEFAULT_PARAMS));
    r.setParams(identityParams({ processVersion: MASKED_VERSION }));
    const off = r.captureFloatFrame();
    r.setParams(identityParams({ processVersion: MASKED_VERSION, masks: [mask] }));
    const before = r.renderDrawCounts.pass;
    const on = r.captureFloatFrame();
    return { off, on, passDraws: r.renderDrawCounts.pass - before };
  });
}

const MAX_ERROR_FRACTION = 0.02;
const MAX_ERROR_FLOOR = 1e-4;

const FUSED_CASES: [string, HarmonyParams][] = [
  ["complementary, full pull", { ...DEFAULT_PARAMS, pullStrength: 1 }],
  [
    "triad, half pull, narrow zones, saturation per node",
    { ...DEFAULT_PARAMS, rule: 6, anchorHue: 0.55, pullStrength: 0.5, pullWidth: 0.6, neutralProtection: 0.2, nodeSat: [1.5, 0.5, 1, 1] },
  ],
  [
    "custom three nodes",
    { ...DEFAULT_PARAMS, rule: 9, customHues: [0.05, 0.4, 0.7, 0], customNodes: 3, pullStrength: 0.7, nodeSat: [0.2, 1.3, 0.9, 1] },
  ],
  ["monochromatic, wide, no neutral protection", { ...DEFAULT_PARAMS, rule: 0, anchorHue: 0.9, pullStrength: 1, pullWidth: 4, neutralProtection: 0 }],
];

/** Smoothing chosen so the à trous unit dilation is exactly one texel. The
 *  scene is its own full-size source, so pass and source edges agree. */
function smoothingForUnitDilation(version: number): number {
  const edge = Math.max(W, H);
  return BLUR_VARIANCE_SCALE / blurSigma(1, edge, edge, version);
}

describe("Colour Harmony stages on the real renderer", () => {
  const SWEEP = sweepScene();
  const SWEEP_IMAGE = toImage(SWEEP);

  it("is a bit-exact no-op at the defaults, with or without smoothing", () => {
    // Renderers share one context and a nested one's dispose() tears down GL
    // state the outer one relies on, so the frames are taken in sequence.
    const bare = withRenderer({ stages: builtinStages(), pipeline: LINEAR_PROBE_PIPELINE }, (r) => {
      r.setImage(SWEEP_IMAGE);
      r.setParams(identityParams());
      return r.captureFloatFrame();
    });
    const idle = withRenderer({ stages: [...builtinStages(), ...allStages()], pipeline: LINEAR_PROBE_PIPELINE }, (r) => {
      r.setImage(SWEEP_IMAGE);
      r.setParams(identityParams());
      r.setContributedParams(deriveAll(DEFAULT_PARAMS));
      const off = r.captureFloatFrame();
      r.setContributedParams(deriveAll({ ...DEFAULT_PARAMS, smoothing: 1 }));
      const smoothIdle = r.captureFloatFrame();
      return { off, smoothIdle };
    });
    expectBitExact(idle.off, bare);
    expectBitExact(idle.smoothIdle, bare);
  });

  it("reproduces darktable's fused correction for every rule and strength", () => {
    withRenderer({ stages: [...builtinStages(), ...allStages()], pipeline: LINEAR_PROBE_PIPELINE }, (renderer) => {
      renderer.setImage(SWEEP_IMAGE);
      renderer.setParams(identityParams());
      renderer.setContributedParams(deriveAll(DEFAULT_PARAMS));
      const off = renderer.captureFloatFrame();
      expect(off).not.toBeNull();
      expect(off!.width).toBe(W);
      expect(off!.height).toBe(H);
      for (const [name, p] of FUSED_CASES) {
        renderer.setContributedParams(deriveAll(p));
        const t0 = performance.now();
        const on = renderer.captureFloatFrame();
        const ms = performance.now() - t0;
        expect(on).not.toBeNull();
        const { keep, ties } = tieMask(SWEEP, p);
        const s = compare(on!, off!, fusedReference(SWEEP, p, 1), SWEEP, (px) => keep[px] === 1);
        console.log(
          `[ch-gpu] ${name}: ${ms.toFixed(0)} ms; darktable change rms ${s.changeRms.toExponential(2)}; ` +
            `error rms ${s.rmse.toExponential(2)} (${((100 * s.rmse) / s.changeRms).toFixed(2)}%), ` +
            `max ${s.max.toExponential(2)}, ${s.outliers} outliers, ${ties} midpoint ties skipped, ` +
            `${(100 * s.clipped).toFixed(2)}% clipped; worst ${s.worst}`,
        );
        for (const px of s.outlierPixels) console.log(`[ch-gpu]   outlier ${describePixel(SWEEP, p, px)}`);
        expect(s.changeRms).toBeGreaterThan(1e-3);
        expect(s.clipped).toBeLessThan(0.05);
        // The mask must stay a sliver: UCS hue bunches the sweep's columns, so
        // allow two percent.
        expect(ties).toBeLessThan(N / 50);
        expect(s.outliers).toBe(0);
        expect(s.rmse).toBeLessThan(Math.max(s.changeRms * MAX_ERROR_FRACTION, MAX_ERROR_FLOOR));
      }
    });
  });

  it("smooths the correction field like the CPU à trous reference", () => {
    const SPLIT = splitScene();
    const p: HarmonyParams = { ...DEFAULT_PARAMS, pullStrength: 1, smoothing: smoothingForUnitDilation(1) };
    const fused: HarmonyParams = { ...p, smoothing: 0 };
    const frames = withRenderer({ stages: [...builtinStages(), ...allStages()], pipeline: LINEAR_PROBE_PIPELINE }, (renderer) => {
      renderer.setImage(toImage(SPLIT));
      renderer.setParams(identityParams());
      renderer.setContributedParams(deriveAll(DEFAULT_PARAMS));
      const off = renderer.captureFloatFrame();
      renderer.setContributedParams(deriveAll(fused));
      const fusedFrame = renderer.captureFloatFrame();
      renderer.setContributedParams(deriveAll(p));
      const t0 = performance.now();
      const smooth = renderer.captureFloatFrame();
      console.log(`[ch-gpu] smoothing (map + ${2 * BLUR_LEVELS} blur draws): ${(performance.now() - t0).toFixed(0)} ms`);
      return { off, fusedFrame, smooth };
    });
    expect(frames.off).not.toBeNull();
    expect(frames.fusedFrame).not.toBeNull();
    expect(frames.smooth).not.toBeNull();

    const s = compare(frames.smooth!, frames.off!, smoothedReference(SPLIT, p, 1), SPLIT);
    console.log(
      `[ch-gpu] smoothing: change rms ${s.changeRms.toExponential(2)}; error rms ${s.rmse.toExponential(2)} ` +
        `(${((100 * s.rmse) / s.changeRms).toFixed(2)}%), max ${s.max.toExponential(2)}`,
    );
    expect(s.changeRms).toBeGreaterThan(1e-3);
    expect(s.rmse).toBeLessThan(Math.max(s.changeRms * 0.03, MAX_ERROR_FLOOR));

    // Far from the boundary the blurred field is constant, so the smoothed
    // render is the fused one; across the boundary they must differ.
    const far = (px: number) => Math.abs((px % W) - W / 2) > 64;
    const near = (px: number) => Math.abs((px % W) - W / 2) < 6;
    let farDiff = 0;
    let farN = 0;
    let nearDiff = 0;
    let nearN = 0;
    for (let px = 0; px < N; px++) {
      for (let ch = 0; ch < 3; ch++) {
        const d = Math.abs(frames.smooth!.data[px * 4 + ch] - frames.fusedFrame!.data[px * 4 + ch]);
        if (far(px)) {
          farDiff += d;
          farN++;
        } else if (near(px)) {
          nearDiff += d;
          nearN++;
        }
      }
    }
    expect(farDiff / farN).toBeLessThan(5e-4);
    expect(nearDiff / nearN).toBeGreaterThan(2e-3);
  });

  it("leaves a mask at the defaults a bit-exact no-op, smoothing on or off", () => {
    for (const p of [DEFAULT_PARAMS, { ...DEFAULT_PARAMS, smoothing: 1 }]) {
      const frames = maskedFrames(SWEEP_IMAGE, stepMask(0, deriveAll(p)));
      expectBitExact(frames.on, frames.off);
      expect(frames.passDraws).toBe(0);
    }
  });

  it("applies a mask's harmony inside the mask, and leaves the rest as the photo's", () => {
    const [name, p] = FUSED_CASES[0];
    const at = 0.5;
    const frames = maskedFrames(SWEEP_IMAGE, stepMask(at, deriveAll(p)));
    expectBitExact(frames.on, frames.off, leftOf(at));
    expect(frames.passDraws).toBe(0);

    const { keep, ties } = tieMask(SWEEP, p);
    const inside = rightOf(at);
    const s = compare(frames.on!, frames.off!, fusedReference(SWEEP, p, MASKED_VERSION), SWEEP, (px) => inside(px) && keep[px] === 1);
    console.log(
      `[ch-gpu] masked ${name}: darktable change rms ${s.changeRms.toExponential(2)}; ` +
        `error rms ${s.rmse.toExponential(2)} (${((100 * s.rmse) / s.changeRms).toFixed(2)}%), ` +
        `max ${s.max.toExponential(2)}, ${s.outliers} outliers, ${ties} midpoint ties skipped; worst ${s.worst}`,
    );
    expect(s.changeRms).toBeGreaterThan(1e-3);
    expect(s.outliers).toBe(0);
    expect(s.rmse).toBeLessThan(Math.max(s.changeRms * MAX_ERROR_FRACTION, MAX_ERROR_FLOOR));
  });

  // On process version 2 nothing upstream clips, so the stages see channels
  // past white and below zero. The scene capture is `lin` as the display
  // transform receives it, signed. A stage at the same phase and priority that
  // floors `lin` at zero is the positive control: it must change the capture,
  // or the scene doesn't reach the stages signed and the test proves nothing.
  // The node sits by the green quarter, so the magenta one is all but out of
  // reach and must keep its negative green. The references start from the
  // frame with the stages idle: what reaches them, which the harness's
  // highlight reconstruction has already rebuilt where a channel nears 1.
  it("adds its correction to values outside [0, 1] on version 2, fused and smoothed", () => {
    const WIDE = wideScene();
    const image = toImage(WIDE);
    const V2 = { processVersion: CURRENT_PROCESS_VERSION };
    const floorsAhead: ProcessingStageContribution = {
      id: "test.floors-ahead",
      name: "Floors ahead",
      phase: "scene-linear",
      priority: 80,
      glsl: "lin = max(lin, 0.0);",
      uniforms: [],
    };
    const scene = (stages: ProcessingStageContribution[], bags: Record<string, unknown>[]): Frame[] =>
      withRenderer({ stages: [...builtinStages(), ...stages], pipeline: OPEN_PROBE }, (r) => {
        r.setImage(image);
        r.setParams(identityParams(V2));
        return bags.map((bag) => {
          r.setContributedParams(bag);
          r.render();
          const f = r.readFloatFrame("scene");
          if (!f) throw new Error("readFloatFrame returned null");
          return f;
        });
      });
    const [bare] = scene([], [{}]);
    const [floored] = scene([floorsAhead], [{}]);
    let moved = 0;
    for (let i = 0; i < bare.data.length; i++) if (bare.data[i] !== floored.data[i]) moved++;
    expect(moved).toBeGreaterThan(N * 0.1);

    const fused: HarmonyParams = { ...DEFAULT_PARAMS, rule: 0, anchorHue: 0.85, pullStrength: 1, pullWidth: 0.25, nodeSat: [1.3, 1, 1, 1] };
    const smoothed: HarmonyParams = { ...fused, smoothing: smoothingForUnitDilation(CURRENT_PROCESS_VERSION) };
    const [off, fusedFrame, smoothFrame] = scene(allStages(), [deriveAll(DEFAULT_PARAMS), deriveAll(fused), deriveAll(smoothed)]);
    const input = new Float64Array(N * 3);
    for (let p = 0; p < N; p++) for (let ch = 0; ch < 3; ch++) input[p * 3 + ch] = off.data[p * 4 + ch];
    for (const [name, frame, ref] of [
      ["fused", fusedFrame, fusedReference(input, fused, CURRENT_PROCESS_VERSION)],
      ["smoothed", smoothFrame, smoothedReference(input, smoothed, CURRENT_PROCESS_VERSION)],
    ] as const) {
      let se = 0;
      let change = 0;
      let outliers = 0;
      let negatives = 0;
      let worst = "";
      let max = 0;
      for (let p = 0; p < N; p++) {
        for (let ch = 0; ch < 3; ch++) {
          const i = p * 3 + ch;
          const got = frame.data[p * 4 + ch];
          const e = got - off.data[p * 4 + ch] - (ref[i] - input[i]);
          se += e * e;
          change += (ref[i] - input[i]) ** 2;
          if (Math.abs(e) > 0.01 * Math.max(1, Math.abs(ref[i]))) outliers++;
          if (got < -0.01) negatives++;
          if (Math.abs(e) > max) {
            max = Math.abs(e);
            worst = `x=${p % W} y=${Math.floor(p / W)} ch=${ch} in=${input[i].toFixed(4)} ref=${ref[i].toFixed(4)} gpu=${got.toFixed(4)}`;
          }
        }
      }
      const rmse = Math.sqrt(se / (N * 3));
      const changeRms = Math.sqrt(change / (N * 3));
      console.log(
        `[ch-gpu] over range, ${name}: change rms ${changeRms.toExponential(2)}; error rms ${rmse.toExponential(2)} ` +
          `(${((100 * rmse) / changeRms).toFixed(2)}%), max ${max.toExponential(2)}, ${outliers} outliers, ` +
          `${negatives} values below zero; worst ${worst}`,
      );
      expect(changeRms).toBeGreaterThan(1e-3);
      expect(negatives).toBeGreaterThan(N * 0.25);
      expect(outliers).toBe(0);
      expect(rmse).toBeLessThan(Math.max(changeRms * 0.03, MAX_ERROR_FLOOR));
    }
  });

  // Version 1 photos keep the look they were edited with: the moved colour
  // replaces the pixel, so the UCS round trip floors what it can't carry, and
  // the blur keeps its 4096 px reference. The references start from the frame
  // with the stages idle, which is what reaches them on version 1. The control
  // is version 2's reference from the same input: it must part from version
  // 1's on a tenth of the values, or the scene can't tell the two apart.
  it("keeps version 1's correction outside [0, 1], fused and smoothed", () => {
    const image = toImage(wideScene());
    const fused: HarmonyParams = { ...DEFAULT_PARAMS, rule: 0, anchorHue: 0.85, pullStrength: 1, pullWidth: 0.25, nodeSat: [1.3, 1, 1, 1] };
    const smoothed: HarmonyParams = { ...fused, smoothing: smoothingForUnitDilation(1) };
    const [off, fusedFrame, smoothFrame] = withRenderer({ stages: [...builtinStages(), ...allStages()], pipeline: OPEN_PROBE }, (r) => {
      r.setImage(image);
      r.setParams(identityParams({ processVersion: 1 }));
      return [deriveAll(DEFAULT_PARAMS), deriveAll(fused), deriveAll(smoothed)].map((bag) => {
        r.setContributedParams(bag);
        r.render();
        const f = r.readFloatFrame("scene");
        if (!f) throw new Error("readFloatFrame returned null");
        return f;
      });
    });
    const input = new Float64Array(N * 3);
    for (let p = 0; p < N; p++) for (let ch = 0; ch < 3; ch++) input[p * 3 + ch] = off.data[p * 4 + ch];
    for (const [name, frame, v1, v2] of [
      ["fused", fusedFrame, fusedReference(input, fused, 1), fusedReference(input, fused, 2)],
      ["smoothed", smoothFrame, smoothedReference(input, smoothed, 1), smoothedReference(input, smoothed, 2)],
    ] as const) {
      let se = 0;
      let change = 0;
      let outliers = 0;
      let parted = 0;
      for (let i = 0; i < N * 3; i++) {
        const got = frame.data[Math.floor(i / 3) * 4 + (i % 3)];
        const e = got - v1[i];
        se += e * e;
        change += (v1[i] - input[i]) ** 2;
        if (Math.abs(e) > 0.01 * Math.max(1, Math.abs(v1[i]))) outliers++;
        if (Math.abs(v1[i] - v2[i]) > 0.01 * Math.max(1, Math.abs(v2[i]))) parted++;
      }
      const rmse = Math.sqrt(se / (N * 3));
      const changeRms = Math.sqrt(change / (N * 3));
      console.log(
        `[ch-gpu] version 1, ${name}: change rms ${changeRms.toExponential(2)}; error rms ${rmse.toExponential(2)}, ` +
          `${outliers} outliers; ${parted} values where version 2 differs`,
      );
      expect(parted).toBeGreaterThan(N * 0.3);
      expect(changeRms).toBeGreaterThan(1e-3);
      expect(outliers).toBe(0);
      expect(rmse).toBeLessThan(Math.max(changeRms * 0.03, MAX_ERROR_FLOOR));
    }
  });

  // Version 1 mapped the decode's hue: a colour change upstream of the stage
  // leaves the map as the decode asks for it, applied to the pixel as it now
  // is. The reference built from the tinted image's own map is the control.
  it("maps the decode on version 1, whatever ran before it", () => {
    const SPLIT = splitScene();
    const source = SPLIT.map(toHalf);
    const tint: ProcessingStageContribution = {
      id: "test.tint-ahead",
      name: "Tint ahead",
      phase: "scene-linear",
      priority: 70,
      glsl: "lin *= vec3(0.8, 1.0, 1.25);",
      uniforms: [],
    };
    const p: HarmonyParams = { ...DEFAULT_PARAMS, pullStrength: 1, smoothing: smoothingForUnitDilation(1) };
    const [off, on] = withRenderer({ stages: [...builtinStages(), tint, ...allStages()], pipeline: OPEN_PROBE }, (r) => {
      r.setImage(toImage(SPLIT));
      r.setParams(identityParams({ processVersion: 1 }));
      return [deriveAll(DEFAULT_PARAMS), deriveAll(p)].map((bag) => {
        r.setContributedParams(bag);
        r.render();
        const f = r.readFloatFrame("scene");
        if (!f) throw new Error("readFloatFrame returned null");
        return f;
      });
    });
    const tinted = new Float64Array(N * 3);
    for (let px = 0; px < N; px++) for (let ch = 0; ch < 3; ch++) tinted[px * 3 + ch] = off.data[px * 4 + ch];
    const harmony = harmonyNodes(p);
    const reference = (mapFrom: Float64Array) => {
      const field = new Float64Array(N * 2);
      for (let i = 0; i < N; i++) {
        const { hueShift, satDelta } = pixelCorrection([mapFrom[i * 3], mapFrom[i * 3 + 1], mapFrom[i * 3 + 2]], p, harmony);
        field[i * 2] = hueShift;
        field[i * 2 + 1] = satDelta;
      }
      const blurred = atrousBlur(field, W, H, 2, 1, BLUR_LEVELS);
      const out = new Float64Array(N * 3);
      for (let i = 0; i < N; i++) {
        const rgb = applyCorrection([tinted[i * 3], tinted[i * 3 + 1], tinted[i * 3 + 2]], { hueShift: blurred[i * 2], satDelta: blurred[i * 2 + 1] }, p, 1);
        out.set(rgb, i * 3);
      }
      return out;
    };
    const fromSource = reference(source);
    const fromTinted = reference(tinted);
    const rms = (a: ArrayLike<number>, b: ArrayLike<number>, stride: number) => {
      let se = 0;
      let change = 0;
      for (let i = 0; i < N * 3; i++) {
        se += (a[Math.floor(i / 3) * stride + (i % 3)] - b[i]) ** 2;
        change += (b[i] - tinted[i]) ** 2;
      }
      return { e: Math.sqrt(se / (N * 3)), change: Math.sqrt(change / (N * 3)) };
    };
    const got = rms(on.data, fromSource, 4);
    const control = rms(fromTinted, fromSource, 3);
    console.log(
      `[ch-gpu] version 1 behind a tint: change rms ${got.change.toExponential(2)}; error rms ${got.e.toExponential(2)} ` +
        `against the decode's map, ${control.e.toExponential(2)} between the decode's and the tinted image's maps`,
    );
    expect(got.change).toBeGreaterThan(1e-3);
    expect(control.e).toBeGreaterThan(got.change * 0.1);
    expect(got.e).toBeLessThan(Math.max(got.change * 0.03, MAX_ERROR_FLOOR));
  });

  it("runs the smoothing passes again for a mask, with the mask's values", () => {
    const SPLIT = splitScene();
    const p: HarmonyParams = { ...DEFAULT_PARAMS, pullStrength: 1, smoothing: smoothingForUnitDilation(MASKED_VERSION) };
    // The step sits left of the hue boundary at u = 0.5, so the mask holds the
    // blurred transition from both sides.
    const at = 0.25;
    const frames = maskedFrames(toImage(SPLIT), stepMask(at, deriveAll(p)));
    expectBitExact(frames.on, frames.off, leftOf(at));
    // The photo's own smoothing idles, so every draw is the copy's.
    expect(frames.passDraws).toBe(1 + 2 * BLUR_LEVELS);

    const s = compare(frames.on!, frames.off!, smoothedReference(SPLIT, p, MASKED_VERSION), SPLIT, rightOf(at));
    // Across the hue boundary the smoothed answer parts from the fused one, so
    // there the frame must sit far closer to the first.
    const band = (px: number) => Math.abs((px % W) - W / 2) < 6;
    const near = compare(frames.on!, frames.off!, smoothedReference(SPLIT, p, MASKED_VERSION), SPLIT, band);
    const nearFused = compare(frames.on!, frames.off!, fusedReference(SPLIT, { ...p, smoothing: 0 }, MASKED_VERSION), SPLIT, band);
    console.log(
      `[ch-gpu] masked smoothing: change rms ${s.changeRms.toExponential(2)}; error rms ${s.rmse.toExponential(2)} ` +
        `(${((100 * s.rmse) / s.changeRms).toFixed(2)}%), max ${s.max.toExponential(2)}; across the boundary ` +
        `error rms ${near.rmse.toExponential(2)} against the smoothed reference, ${nearFused.rmse.toExponential(2)} against the fused`,
    );
    expect(s.changeRms).toBeGreaterThan(1e-3);
    expect(s.rmse).toBeLessThan(Math.max(s.changeRms * 0.03, MAX_ERROR_FLOOR));
    expect(near.rmse * 10).toBeLessThan(nearFused.rmse);
  });
});
