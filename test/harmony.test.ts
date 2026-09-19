// The harmony model against darktable's colorharmonizer.c, via the vectors its
// C produced (test/reference). The RYB↔UCS lookup is built through a float
// bisection in darktable and a double one here, so a swatch or a table entry
// may sit one bisection step apart; the tolerances below are measured
// differences plus margin, all far below a degree of hue.

import { describe, expect, it } from "vitest";
import vectors from "./reference/vectors.json";
import {
  CUSTOM_RULE,
  DEFAULT_PARAMS,
  HUE_BINS,
  MAX_NODES,
  RULES,
  findMaxChroma,
  harmonizePixel,
  harmonyNodes,
  hueHistogram,
  hueToSrgb,
  inferHarmony,
  rotationOf,
  rybToUcs,
  scoreHarmony,
  sectorAngles,
  swatchColor,
  switchRule,
  ucsHueToRybHue,
  ucsToRyb,
  weightedHueShift,
  wrapHue,
  type HarmonyParams,
} from "../src/harmony";
import { hueTurn, linearSrgbToJch } from "../src/ucs";

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const hueClose = (a: number, b: number, tol: number) => {
  let d = Math.abs(a - b);
  if (d > 0.5) d = 1 - d;
  return d <= tol;
};

function paramsOf(set: (typeof vectors.paramSets)[number]): HarmonyParams {
  return {
    ...DEFAULT_PARAMS,
    rule: set.rule,
    anchorHue: set.anchor,
    pullStrength: set.pull,
    neutralProtection: set.neutral,
    pullWidth: set.width,
    customHues: set.customHues,
    customNodes: set.customNodes,
    nodeSat: set.nodeSat,
  };
}

describe("rules", () => {
  it("lists darktable's ten rules in its order with their node counts", () => {
    expect(RULES.map((r) => r.label)).toEqual([
      "Monochromatic",
      "Analogous",
      "Analogous complementary",
      "Complementary",
      "Split complementary",
      "Dyad",
      "Triad",
      "Tetrad",
      "Square",
      "Custom",
    ]);
    expect(RULES.map((r) => r.sectors.length)).toEqual([1, 3, 4, 2, 3, 2, 3, 4, 4, 0]);
    expect(CUSTOM_RULE).toBe(9);
    expect(MAX_NODES).toBe(4);
  });

  it("rotates the sector table by an integer RYB rotation", () => {
    const triad = sectorAngles(6, 90);
    expect(triad.length).toBe(3);
    expect(close(triad[0], 0.25, 1e-9)).toBe(true);
    expect(close(triad[1], 0.25 + 4 / 12, 1e-9)).toBe(true);
    expect(close(triad[2], 0.25 + 8 / 12, 1e-9)).toBe(true);
    const tetrad = sectorAngles(7, 0);
    expect(close(tetrad[0], 11 / 12, 1e-9)).toBe(true);
    expect(sectorAngles(CUSTOM_RULE, 30)).toEqual([]);
  });
});

describe("RYB ↔ UCS", () => {
  it("finds darktable's gamut-safe chroma and swatch colour per hue", () => {
    for (const s of vectors.swatches) {
      expect(close(findMaxChroma(s.hue), s.maxChroma, 2e-4)).toBe(true);
      const rgb = hueToSrgb(s.hue);
      for (let c = 0; c < 3; c++) expect(close(rgb[c], s.srgb[c], 2e-3)).toBe(true);
      expect(hueClose(ucsHueToRybHue(s.hue), s.rybHue, 1e-3)).toBe(true);
    }
  });

  it("renders a hue at a given chroma as a clamped swatch, grey at chroma 0", () => {
    const grey = swatchColor(0.3, 0);
    expect(close(grey[0], grey[1], 1e-3)).toBe(true);
    expect(close(grey[1], grey[2], 1e-3)).toBe(true);
    const vivid = swatchColor(0.3, findMaxChroma(0.3) * 0.85);
    const ref = hueToSrgb(0.3);
    for (let c = 0; c < 3; c++) expect(close(vivid[c], ref[c], 1e-9)).toBe(true);
    for (const v of swatchColor(0.3, 5)) expect(v >= 0 && v <= 1).toBe(true);
  });

  it("reproduces both 720-entry lookup tables", () => {
    for (let i = 0; i < 720; i++) {
      const t = i / 720;
      expect(hueClose(ucsToRyb(t), vectors.lut.ucsToRyb[i], 1e-3)).toBe(true);
      expect(hueClose(rybToUcs(t), vectors.lut.rybToUcs[i], 1 / 720 + 1e-3)).toBe(true);
    }
  });

  it("interpolates between table entries on the circle", () => {
    const a = ucsToRyb(0.5);
    const b = ucsToRyb(0.5 + 1 / 720);
    expect(hueClose(ucsToRyb(0.5 + 0.5 / 720), (a + b) / 2, 1e-9)).toBe(true);
    expect(hueClose(ucsToRyb(1), ucsToRyb(0), 1e-9)).toBe(true);
  });
});

describe("harmony nodes", () => {
  it("matches darktable's node positions for every rule and anchor", () => {
    for (const v of vectors.nodes) {
      const p: HarmonyParams = {
        ...DEFAULT_PARAMS,
        rule: v.rule,
        anchorHue: v.anchor,
        customHues: v.customHues ?? DEFAULT_PARAMS.customHues,
        customNodes: v.customNodes ?? DEFAULT_PARAMS.customNodes,
      };
      const { nodes, count } = harmonyNodes(p);
      expect(count).toBe(v.count);
      expect(nodes.length).toBe(v.count);
      for (let i = 0; i < v.count; i++) expect(hueClose(nodes[i], v.nodes[i], 2e-3)).toBe(true);
    }
  });

  it("seeds the custom nodes from the current rule when switching to custom", () => {
    const triad = { ...DEFAULT_PARAMS, rule: 6, anchorHue: 0.37 };
    const custom = switchRule(triad, CUSTOM_RULE);
    expect(custom.rule).toBe(CUSTOM_RULE);
    expect(custom.customNodes).toBe(3);
    expect(custom.customHues.slice(0, 3)).toEqual(harmonyNodes(triad).nodes);
    expect(custom.customHues[3]).toBe(DEFAULT_PARAMS.customHues[3]);
    const mono = switchRule({ ...DEFAULT_PARAMS, rule: 0 }, CUSTOM_RULE);
    expect(mono.customNodes).toBe(2);
    expect(mono.customHues[1]).toBe(mono.customHues[0]);
    // Custom → custom and predefined → predefined keep the custom nodes as they are.
    expect(switchRule(custom, CUSTOM_RULE)).toEqual(custom);
    expect(switchRule(triad, 3)).toEqual({ ...triad, rule: 3 });
  });

  it("derives the anchor's integer RYB rotation", () => {
    const p = { ...DEFAULT_PARAMS, rule: 3, anchorHue: 0.1 };
    const rot = rotationOf(p);
    expect(Number.isInteger(rot)).toBe(true);
    expect(rot).toBeGreaterThanOrEqual(0);
    expect(rot).toBeLessThan(360);
    expect(hueClose(rybToUcs(rot / 360), harmonyNodes(p).nodes[0], 1e-9)).toBe(true);
  });
});

describe("weighted hue shift", () => {
  it("matches darktable for random node sets", () => {
    for (const s of vectors.shifts) {
      const r = weightedHueShift(s.hue, s.nodes, s.width);
      expect(r.winner).toBe(s.winner);
      expect(close(r.weight, s.weight, 1e-6)).toBe(true);
      expect(close(r.shift, s.shift, 1e-6)).toBe(true);
    }
  });

  it("is zero at a node and one sigma down at the midpoint between two at width 1", () => {
    expect(weightedHueShift(0.25, [0.25, 0.75], 1).shift).toBe(0);
    // σ = width · 0.5 / n = 0.25, and the midpoint is 0.25 away: exp(−½).
    const mid = weightedHueShift(0.5, [0.25, 0.75], 1);
    expect(close(mid.weight, Math.exp(-0.5), 1e-12)).toBe(true);
  });

  it("wraps hues into [0, 1)", () => {
    expect(wrapHue(1.25)).toBeCloseTo(0.25, 12);
    expect(wrapHue(-0.25)).toBeCloseTo(0.75, 12);
  });
});

describe("harmonizePixel", () => {
  it("matches darktable's fused process() for every reference pixel", () => {
    for (const px of vectors.pixels) {
      const p = paramsOf(vectors.paramSets[px.set]);
      const out = harmonizePixel([px.rgb[0], px.rgb[1], px.rgb[2]], p, harmonyNodes(p));
      for (let c = 0; c < 3; c++) expect(close(out[c], px.out[c], 1e-3)).toBe(true);
    }
  });

  it("returns the input untouched when pull is 0 and every saturation is 1", () => {
    const rgb = [0.6, 0.12, 0.12] as const;
    expect(harmonizePixel(rgb, DEFAULT_PARAMS, harmonyNodes(DEFAULT_PARAMS))).toEqual(rgb);
  });

  it("moves a saturated colour more than a near-neutral one", () => {
    const p = { ...DEFAULT_PARAMS, pullStrength: 1, anchorHue: 0.5 };
    const n = harmonyNodes(p);
    const sat = harmonizePixel([0.6, 0.12, 0.12], p, n);
    const dull = harmonizePixel([0.2, 0.18, 0.18], p, n);
    const move = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(move(sat, [0.6, 0.12, 0.12])).toBeGreaterThan(move(dull, [0.2, 0.18, 0.18]));
  });
});

describe("inference", () => {
  it("builds a chroma-weighted UCS hue histogram, skipping neutrals", () => {
    const px = new Float32Array([0.6, 0.12, 0.12, 0.18, 0.18, 0.18, 0.1, 0.1, 0.6]);
    const h = hueHistogram(px, 3);
    expect(h.length).toBe(HUE_BINS);
    const [, cRed, hRed] = linearSrgbToJch([0.6, 0.12, 0.12]);
    const [, cBlue, hBlue] = linearSrgbToJch([0.1, 0.1, 0.6]);
    const binRed = Math.floor(hueTurn(hRed) * HUE_BINS) % HUE_BINS;
    const binBlue = Math.floor(hueTurn(hBlue) * HUE_BINS) % HUE_BINS;
    expect(close(h[binRed], cRed, 1e-6)).toBe(true);
    expect(close(h[binBlue], cBlue, 1e-6)).toBe(true);
    let total = 0;
    for (const v of h) total += v;
    expect(close(total, cRed + cBlue, 1e-6)).toBe(true);
  });

  it("picks darktable's rule and anchor for the reference histograms", () => {
    for (const v of vectors.infer) {
      const histo = Float32Array.from(v.histogram);
      const r = inferHarmony(histo);
      expect(r.rule).toBe(v.rule);
      expect(hueClose(r.anchor, v.anchor, 1 / 360 + 1e-6)).toBe(true);
      expect(close(scoreHarmony(histo, v.rule, v.anchor), v.score, 1e-4)).toBe(true);
    }
  });
});
