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
//    hue boundary as the fused path renders them.
//
// The timings it prints are SwiftShader (CPU) numbers, only useful relative to
// each other.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS,
  chromaCutoff,
  harmonizePixel,
  harmonyNodes,
  weightedHueShift,
  wrapHue,
  type HarmonyParams,
} from "@ch/harmony";
import { deriveAll } from "@ch/params";
import { BLUR_LEVELS, BLUR_VARIANCE_SCALE, REFERENCE_LONG_EDGE, allStages } from "@ch/stage";
import { hsvToRgb, hueTurn, jchToLinearSrgb, linearSrgbToJch, turnToRadians } from "@ch/ucs";
import { atrousBlur } from "@ch-test/support/blur";
import {
  LINEAR_PROBE_PIPELINE,
  type Frame,
  builtinStages,
  floatImage,
  identityParams,
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

const toImage = (src: Float64Array) =>
  floatImage(W, H, (x, y) => {
    const i = (y * W + x) * 3;
    return [src[i], src[i + 1], src[i + 2]];
  });

// ── References ───────────────────────────────────────────────────────────────

function fusedReference(src: Float64Array, p: HarmonyParams): Float64Array {
  const harmony = harmonyNodes(p);
  const out = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) {
    const [r, g, b] = harmonizePixel([src[i * 3], src[i * 3 + 1], src[i * 3 + 2]], p, harmony);
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
function smoothedReference(src: Float64Array, p: HarmonyParams): Float64Array {
  const { nodes } = harmonyNodes(p);
  const field = new Float64Array(N * 2);
  for (let i = 0; i < N; i++) {
    const [, , Hh] = linearSrgbToJch([Math.max(src[i * 3], 0), Math.max(src[i * 3 + 1], 0), Math.max(src[i * 3 + 2], 0)]);
    const { shift, winner, weight } = weightedHueShift(hueTurn(Hh), nodes, p.pullWidth);
    field[i * 2] = shift;
    field[i * 2 + 1] = (p.nodeSat[winner] - 1) * weight;
  }
  const blurred = atrousBlur(field, W, H, 2, 1, BLUR_LEVELS);
  const cutoff = chromaCutoff(p.neutralProtection);
  const out = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) {
    const [J, C, Hh] = linearSrgbToJch([Math.max(src[i * 3], 0), Math.max(src[i * 3 + 1], 0), Math.max(src[i * 3 + 2], 0)]);
    const cw = C / (C + cutoff + 1e-5);
    const hue = wrapHue(hueTurn(Hh) + blurred[i * 2] * p.pullStrength * cw);
    const chroma = Math.max(C * (1 + blurred[i * 2 + 1] * cw), 0);
    const [r, g, b] = jchToLinearSrgb([J, chroma, turnToRadians(hue)]);
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

function expectBitExact(a: Frame | null, b: Frame | null): void {
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  for (let i = 0; i < a!.data.length; i++) expect(a!.data[i]).toBe(b!.data[i]);
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

/** Smoothing chosen so the à trous unit dilation is exactly one texel. */
function smoothingForUnitDilation(): number {
  const scale = Math.max(1.5, (8 * Math.max(W, H)) / REFERENCE_LONG_EDGE);
  return BLUR_VARIANCE_SCALE / scale;
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
        const s = compare(on!, off!, fusedReference(SWEEP, p), SWEEP, (px) => keep[px] === 1);
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
    const p: HarmonyParams = { ...DEFAULT_PARAMS, pullStrength: 1, smoothing: smoothingForUnitDilation() };
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

    const s = compare(frames.smooth!, frames.off!, smoothedReference(SPLIT, p), SPLIT);
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
});
