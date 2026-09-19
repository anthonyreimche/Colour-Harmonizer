// darktable's color harmonizer model (src/iop/colorharmonizer.c, darktable
// 5.6, GPL-3.0-or-later): harmony rules on the RYB wheel, the RYB ↔ UCS hue
// lookups, node placement, the Gaussian pull toward the nearest node, the fused
// per-pixel correction, and the rule/anchor inference from a hue histogram.
// The rule geometry is the vectorscope's (src/common/color_harmony.h), so the
// guide sectors drawn in the panel and the nodes the GPU pulls toward are the
// same angles.

import {
  hueTurn,
  jchToLinearSrgb,
  linearSrgbToJch,
  linearToSrgb,
  rgbToHcv,
  srgbToLinear,
  turnToRadians,
  type Vec3,
} from "./ucs";

export const MAX_NODES = 4;
export const HUE_BINS = 360;
export const CUSTOM_RULE = 9;
/** Resolution of the RYB ↔ UCS lookup tables (0.5° steps). */
export const LUT_STEPS = 720;
/** The swatch lightness darktable renders hues at (≈ Y 0.29). */
export const SWATCH_J = 0.65;
/** How far inside the gamut boundary the swatch chroma sits. */
export const SWATCH_CHROMA_FRACTION = 0.85;

export interface Rule {
  id: number;
  label: string;
  /** Sector centres as offsets from the anchor, in turns of the RYB wheel. */
  sectors: readonly number[];
  /** Vectorscope guide radius per sector (0..1, linear scale). */
  lengths: readonly number[];
}

const twelfths = (...n: number[]) => n.map((v) => v / 12);

export const RULES: readonly Rule[] = [
  { id: 0, label: "Monochromatic", sectors: twelfths(0), lengths: [0.8] },
  { id: 1, label: "Analogous", sectors: twelfths(-1, 0, 1), lengths: [0.5, 0.8, 0.5] },
  { id: 2, label: "Analogous complementary", sectors: twelfths(-1, 0, 1, 6), lengths: [0.5, 0.8, 0.5, 0.5] },
  { id: 3, label: "Complementary", sectors: twelfths(0, 6), lengths: [0.8, 0.5] },
  { id: 4, label: "Split complementary", sectors: twelfths(0, 5, 7), lengths: [0.8, 0.5, 0.5] },
  { id: 5, label: "Dyad", sectors: twelfths(-1, 1), lengths: [0.8, 0.8] },
  { id: 6, label: "Triad", sectors: twelfths(0, 4, 8), lengths: [0.8, 0.5, 0.5] },
  { id: 7, label: "Tetrad", sectors: twelfths(-1, 1, 5, 7), lengths: [0.8, 0.8, 0.5, 0.5] },
  { id: 8, label: "Square", sectors: twelfths(0, 3, 6, 9), lengths: [0.8, 0.5, 0.5, 0.5] },
  { id: CUSTOM_RULE, label: "Custom", sectors: [], lengths: [] },
];

export interface HarmonyParams {
  rule: number;
  /** UCS hue turn in [0, 1). */
  anchorHue: number;
  /** UCS hue turns, one per custom node slot. */
  customHues: readonly number[];
  /** Active custom nodes, 2..4. */
  customNodes: number;
  /** Saturation multiplier per node, 0..2. */
  nodeSat: readonly number[];
  pullStrength: number;
  pullWidth: number;
  neutralProtection: number;
  smoothing: number;
}

export const DEFAULT_PARAMS: Readonly<HarmonyParams> = Object.freeze({
  rule: 3,
  anchorHue: 0.1,
  customHues: Object.freeze([0, 0.25, 0.5, 0.75]) as readonly number[],
  customNodes: 4,
  nodeSat: Object.freeze([1, 1, 1, 1]) as readonly number[],
  pullStrength: 0,
  pullWidth: 1,
  neutralProtection: 0.5,
  smoothing: 0,
});

export interface HarmonyNodes {
  /** UCS hue turns. */
  nodes: number[];
  count: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function wrapHue(h: number): number {
  h = h % 1;
  return h < 0 ? h + 1 : h;
}

/** Absolute RYB sector centres (turns) of a rule at an integer rotation. */
export function sectorAngles(rule: number, rotationDeg: number): number[] {
  const r = RULES[rule];
  if (!r || r.sectors.length === 0) return [];
  const anchor = rotationDeg / 360;
  return r.sectors.map((offset) => {
    const a = offset + anchor;
    return a - Math.floor(a);
  });
}

// ── RYB ↔ UCS ────────────────────────────────────────────────────────────────

const RYB_X_KNOTS = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1];
const RYB_Y_KNOTS = [0, 1 / 3, 0.472217, 0.611105, 0.715271, 5 / 6, 1];

/** RGB (HSV) hue → RYB hue, Gossett's control points interpolated linearly
 *  (darktable's dt_rgb_hue_to_ryb_hue). */
export function rgbHueToRybHue(h: number): number {
  const hc = h - Math.floor(h);
  let i = 0;
  while (i < 5 && hc >= RYB_X_KNOTS[i + 1]) i++;
  const t = (hc - RYB_X_KNOTS[i]) / (RYB_X_KNOTS[i + 1] - RYB_X_KNOTS[i]);
  return RYB_Y_KNOTS[i] + t * (RYB_Y_KNOTS[i + 1] - RYB_Y_KNOTS[i]);
}

function jchToSrgbGamma(jch: Vec3): Vec3 {
  const lin = jchToLinearSrgb(jch);
  return [linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2])];
}

/** Largest chroma at SWATCH_J that stays inside [0, 1] sRGB for a UCS hue. */
export function findMaxChroma(hue: number): number {
  const H = turnToRadians(hue);
  let lo = 0;
  let hi = 2;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) * 0.5;
    const s = jchToSrgbGamma([SWATCH_J, mid, H]);
    if (s[0] >= 0 && s[1] >= 0 && s[2] >= 0 && s[0] <= 1 && s[1] <= 1 && s[2] <= 1) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** A UCS hue at a given chroma as a clamped display sRGB swatch (0..1, gamma
 *  encoded), at the swatch lightness. */
export function swatchColor(hue: number, chroma: number): Vec3 {
  const s = jchToSrgbGamma([SWATCH_J, chroma, turnToRadians(hue)]);
  return [clamp(s[0], 0, 1), clamp(s[1], 0, 1), clamp(s[2], 0, 1)];
}

/** A UCS hue as a display sRGB swatch colour (0..1, gamma encoded). */
export function hueToSrgb(hue: number): Vec3 {
  return swatchColor(hue, findMaxChroma(hue) * SWATCH_CHROMA_FRACTION);
}

/** UCS hue → RYB hue through the swatch colour's HSV hue. */
export function ucsHueToRybHue(hue: number): number {
  const s = hueToSrgb(hue);
  const [h] = rgbToHcv([srgbToLinear(s[0]), srgbToLinear(s[1]), srgbToLinear(s[2])]);
  return rgbHueToRybHue(h);
}

function hueLerp(a: number, b: number, t: number): number {
  if (b - a > 0.5) b -= 1;
  else if (a - b > 0.5) a -= 1;
  const r = a + t * (b - a);
  return r < 0 ? r + 1 : r;
}

function buildHueLuts(): { forward: Float64Array; inverse: Float64Array } {
  const forward = new Float64Array(LUT_STEPS);
  for (let i = 0; i < LUT_STEPS; i++) forward[i] = ucsHueToRybHue(i / LUT_STEPS);
  const inverse = new Float64Array(LUT_STEPS);
  for (let j = 0; j < LUT_STEPS; j++) {
    const target = j / LUT_STEPS;
    let bestDist = 1;
    let bestUcs = 0;
    for (let i = 0; i < LUT_STEPS; i++) {
      let d = Math.abs(forward[i] - target);
      if (d > 0.5) d = 1 - d;
      if (d < bestDist) {
        bestDist = d;
        bestUcs = i / LUT_STEPS;
      }
    }
    inverse[j] = bestUcs;
  }
  return { forward, inverse };
}

const LUT = buildHueLuts();

function lookup(table: Float64Array, t: number): number {
  const pos = wrapHue(t) * LUT_STEPS;
  const i0 = Math.trunc(pos) % LUT_STEPS;
  const i1 = (i0 + 1) % LUT_STEPS;
  return hueLerp(table[i0], table[i1], pos - Math.trunc(pos));
}

export function ucsToRyb(ucsTurn: number): number {
  return lookup(LUT.forward, ucsTurn);
}

export function rybToUcs(rybTurn: number): number {
  return lookup(LUT.inverse, rybTurn);
}

// ── Nodes and the pull ───────────────────────────────────────────────────────

/** The anchor's integer RYB rotation, 0..359. */
export function rotationOf(p: HarmonyParams): number {
  return Math.round(ucsToRyb(p.anchorHue) * 360) % 360;
}

export function harmonyNodes(p: HarmonyParams): HarmonyNodes {
  if (p.rule === CUSTOM_RULE) {
    const count = clamp(Math.round(p.customNodes), 1, MAX_NODES);
    const nodes: number[] = [];
    for (let i = 0; i < count; i++) nodes.push(p.customHues[i] ?? 0);
    return { nodes, count };
  }
  const nodes = sectorAngles(p.rule, rotationOf(p)).map(rybToUcs);
  return { nodes, count: nodes.length };
}

/** Change the rule; entering custom from a predefined rule seeds the custom
 *  nodes from the rule's current nodes (darktable's
 *  _init_custom_nodes_from_rule), a single node doubled to reach the minimum
 *  of two. */
export function switchRule(p: HarmonyParams, rule: number): HarmonyParams {
  if (rule !== CUSTOM_RULE || p.rule === CUSTOM_RULE) return { ...p, rule };
  const { nodes, count } = harmonyNodes(p);
  const customHues = [...p.customHues];
  for (let i = 0; i < count && i < MAX_NODES; i++) customHues[i] = nodes[i];
  if (count < 2) customHues[1] = customHues[0];
  return { ...p, rule, customHues, customNodes: clamp(count, 2, MAX_NODES) };
}

export interface HueShift {
  /** Signed shift toward the winning node, already weighted (turns). */
  shift: number;
  winner: number;
  weight: number;
}

export function weightedHueShift(hue: number, nodes: readonly number[], pullWidth: number): HueShift {
  const n = nodes.length;
  if (n <= 0) return { shift: 0, winner: 0, weight: 0 };
  const sigma = (pullWidth * 0.5) / n;
  const inv2s2 = 1 / (2 * sigma * sigma);
  let maxW = 0;
  let winner = 0;
  let diffWinning = 0;
  for (let i = 0; i < n; i++) {
    let d = Math.abs(hue - nodes[i]);
    if (d > 0.5) d = 1 - d;
    const w = Math.exp(-d * d * inv2s2);
    let diff = nodes[i] - hue;
    if (diff > 0.5) diff -= 1;
    else if (diff < -0.5) diff += 1;
    if (w > maxW) {
      maxW = w;
      winner = i;
      diffWinning = diff;
    }
  }
  return { shift: diffWinning * maxW, winner, weight: maxW };
}

/** Chroma at which neutral protection halves the correction. */
export function chromaCutoff(neutralProtection: number): number {
  return neutralProtection * neutralProtection * neutralProtection * 0.03;
}

/** Whether the module changes anything at all: pull strength off and every
 *  node saturation at 1 is darktable's identity, and the GPU skips the block. */
export function effectActive(p: HarmonyParams): boolean {
  return p.pullStrength > 0 || p.nodeSat.some((s) => s !== 1);
}

/** darktable's fused process() for one scene-linear pixel. */
export function harmonizePixel(rgb: Vec3, p: HarmonyParams, harmony: HarmonyNodes): Vec3 {
  if (!effectActive(p)) return rgb;
  const cutoff = chromaCutoff(p.neutralProtection);
  const [J, C, H] = linearSrgbToJch([Math.max(rgb[0], 0), Math.max(rgb[1], 0), Math.max(rgb[2], 0)]);
  const hue = hueTurn(H);
  const { shift, winner, weight } = weightedHueShift(hue, harmony.nodes, p.pullWidth);
  const satDelta = ((p.nodeSat[winner] ?? 1) - 1) * weight;
  const chromaWeight = C / (C + cutoff + 1e-5);
  const newHue = wrapHue(hue + shift * p.pullStrength * chromaWeight);
  const newC = Math.max(C * (1 + satDelta * chromaWeight), 0);
  return jchToLinearSrgb([J, newC, turnToRadians(newHue)]);
}

// ── Inference ────────────────────────────────────────────────────────────────

/** Chroma-weighted UCS hue histogram of scene-linear RGB triplets; pixels with
 *  chroma ≤ 0.01 (neutrals) are skipped. */
export function hueHistogram(rgb: Float32Array, count: number): Float32Array {
  const histo = new Float32Array(HUE_BINS);
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const [, C, H] = linearSrgbToJch([Math.max(rgb[o], 0), Math.max(rgb[o + 1], 0), Math.max(rgb[o + 2], 0)]);
    if (C > 0.01) histo[Math.floor(hueTurn(H) * HUE_BINS) % HUE_BINS] += C;
  }
  return histo;
}

/** Fraction of the histogram's chromatic energy inside a rule's attraction
 *  zones at width 1. */
export function scoreHarmony(histo: ArrayLike<number>, rule: number, anchor: number): number {
  const { nodes, count } = harmonyNodes({ ...DEFAULT_PARAMS, rule, anchorHue: anchor });
  if (count <= 0) return 0;
  const sigma = 0.5 / count;
  const inv2s2 = 1 / (2 * sigma * sigma);
  let total = 0;
  let covered = 0;
  for (let b = 0; b < histo.length; b++) {
    const v = histo[b];
    if (v <= 0) continue;
    const h = (b + 0.5) / histo.length;
    let maxW = 0;
    for (let i = 0; i < count; i++) {
      let d = Math.abs(h - nodes[i]);
      if (d > 0.5) d = 1 - d;
      const w = Math.exp(-d * d * inv2s2);
      if (w > maxW) maxW = w;
    }
    covered += v * maxW;
    total += v;
  }
  return total > 1e-6 ? covered / total : 0;
}

export interface Inference {
  rule: number;
  anchor: number;
}

/** The predefined rule and 1° anchor that already cover the most chromatic
 *  energy, after three circular box-smoothing passes. */
export function inferHarmony(histo: ArrayLike<number>): Inference {
  const n = histo.length;
  let smooth = Float32Array.from(histo);
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(n);
    for (let b = 0; b < n; b++) {
      tmp[b] = (smooth[(b - 1 + n) % n] + smooth[b] + smooth[(b + 1) % n]) * (1 / 3);
    }
    smooth = tmp;
  }
  let best: Inference = { rule: 3, anchor: 0 };
  let bestScore = -1;
  for (let rule = 0; rule < CUSTOM_RULE; rule++) {
    for (let a = 0; a < 360; a++) {
      const anchor = a / 360;
      const score = scoreHarmony(smooth, rule, anchor);
      if (score > bestScore) {
        bestScore = score;
        best = { rule, anchor };
      }
    }
  }
  return best;
}
