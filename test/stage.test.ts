// The two GPU stages as contracts: which keys they declare with which
// defaults (the bag bridge and the panel rely on them), that the GLSL is
// formatted from the model's constants, that the fused block is gated exactly
// as designed, and a static per-draw texture-fetch budget on the real pass
// GLSL — the class of cost the CPU reference never sees.

import { describe, expect, it } from "vitest";
import {
  CUSTOM_RULE,
  DEFAULT_PARAMS,
  applyCorrection,
  harmonyNodes,
  pixelCorrection,
  wrapHue,
  type HarmonyParams,
} from "../src/harmony";
import {
  HARMONIZE_ID,
  HARMONIZE_UNIFORMS,
  SMOOTH_ID,
  SMOOTH_UNIFORMS,
  stagePrefix4,
} from "../src/params";
import {
  BLUR_ITERATIONS,
  BLUR_VARIANCE_SCALE,
  REFERENCE_LONG_EDGE,
  allStages,
  blurSigma,
  glslLiteral,
  harmonizeStage,
  smoothStage,
} from "../src/stage";
import { L_WHITE, SRGB_TO_XYZ_D65, UCS_UV_X_FACTORS, hueTurn, linearSrgbToJch, type Vec3 } from "../src/ucs";
import { fetchBudget } from "./support/fetch-budget";
import { atVersion } from "./support/process-version";

describe("glslLiteral", () => {
  it("always carries a decimal point, exponents included", () => {
    expect(glslLiteral(0.5)).toBe("0.5000000000");
    expect(glslLiteral(4096)).toBe("4096.000000");
    expect(glslLiteral(1.17549435e-38)).toMatch(/^1\.17549435\d*e-38$/);
    expect(glslLiteral(-0.98)).toBe("-0.9800000000");
  });
});

describe("harmonize stage", () => {
  const stage = harmonizeStage();

  it("declares the panel's keys and the derived nodes with darktable's defaults", () => {
    expect(stage.id).toBe(HARMONIZE_ID);
    expect(stage.phase).toBe("scene-linear");
    expect(stage.priority).toBe(80);
    expect(stage.presetScope).toBe("global");
    expect(stage.uniforms.map((u) => u.key)).toEqual([...HARMONIZE_UNIFORMS]);
    const byKey = Object.fromEntries(stage.uniforms.map((u) => [u.key, u]));
    expect(byKey.rule.default).toBe(3);
    expect(byKey.anchorHue.default).toBe(0.1);
    expect(byKey.customHues.default).toEqual([0, 0.25, 0.5, 0.75]);
    expect(byKey.customNodes.default).toBe(4);
    expect(byKey.nodeSat.default).toEqual([1, 1, 1, 1]);
    expect(byKey.pullStrength.default).toBe(0);
    expect(byKey.pullWidth.default).toBe(1);
    expect(byKey.neutralProtection.default).toBe(0.5);
    expect(byKey.smoothing.default).toBe(0);
    const { nodes, count } = harmonyNodes(DEFAULT_PARAMS);
    expect(byKey.nodes.default).toEqual([...nodes, 0, 0].slice(0, 4));
    expect(byKey.nodeCount.default).toBe(count);
    expect(byKey.pullStrength.range).toEqual({ min: 0, max: 1, step: 0.01 });
    expect(byKey.pullWidth.range).toEqual({ min: 0.25, max: 4, step: 0.01 });
    expect(byKey.neutralProtection.range).toEqual({ min: 0, max: 1, step: 0.01 });
    expect(byKey.smoothing.range).toEqual({ min: 0, max: 2, step: 0.01 });
    expect(byKey.nodes.glslType).toBe("vec4");
    expect(byKey.nodeSat.glslType).toBe("vec4");
    expect(byKey.customHues.glslType).toBe("vec4");
  });

  it("runs again inside masks", () => {
    expect(stage.mask).toEqual({ maskable: true });
  });

  it("has no passes and gates its block on smoothing off and a live effect", () => {
    expect(stage.passes).toBeUndefined();
    expect(stage.glsl).toMatch(/if \(smoothing <= 0\.0 && \(pullStrength > 0\.0 \|\| any\(notEqual\(nodeSat, vec4\(1\.0\)\)\)\)\)/);
    expect(stage.glsl).toContain("lin = ");
  });

  it("formats the GLSL from the model's constants", () => {
    const helpers = stage.helpers ?? "";
    expect(helpers).toContain(glslLiteral(L_WHITE));
    expect(helpers).toContain(glslLiteral(UCS_UV_X_FACTORS[0]));
    expect(helpers).toContain(glslLiteral(SRGB_TO_XYZ_D65[0]));
    expect(helpers).toContain(glslLiteral(0.03));
  });
});

describe("smooth stage", () => {
  const stage = smoothStage();

  it("runs after the fused stage with every key at zero by default", () => {
    expect(stage.id).toBe(SMOOTH_ID);
    expect(stage.phase).toBe("scene-linear");
    expect(stage.priority).toBe(81);
    const inlineKeys = stage.uniforms.map((u) => u.key);
    const passKeys = (stage.passes ?? []).flatMap((p) => (p.uniforms ?? []).map((u) => u.key));
    expect([...passKeys, ...inlineKeys].sort()).toEqual([...SMOOTH_UNIFORMS].sort());
    for (const u of [...stage.uniforms, ...(stage.passes ?? []).flatMap((p) => p.uniforms ?? [])]) {
      expect(u.default).toEqual(u.glslType === "vec4" ? [0, 0, 0, 0] : 0);
    }
    expect(inlineKeys).toEqual(["pullStrength", "neutralProtection", "on"]);
  });

  it("runs again inside masks, passes and all", () => {
    expect(stage.mask).toEqual({ maskable: true });
  });

  it("maps corrections in one draw and blurs them in four separable à trous levels", () => {
    const passes = stage.passes ?? [];
    expect(passes.length).toBe(2);
    expect(passes[0].iterations ?? 1).toBe(1);
    expect(passes[1].iterations).toBe(BLUR_ITERATIONS);
    expect(BLUR_ITERATIONS).toBe(8);
    expect(BLUR_VARIANCE_SCALE).toBeCloseTo(Math.sqrt(85), 12);
    expect(REFERENCE_LONG_EDGE).toBe(4096);
    expect(passes[1].glsl).toContain(glslLiteral(BLUR_VARIANCE_SCALE));
    expect(passes[1].glsl).toContain(glslLiteral(REFERENCE_LONG_EDGE));
    expect(passes[1].glsl).toContain("8.0 *");
    expect(passes[1].glsl).toContain("1.5");
    expect(stage.glsl).toMatch(/if \(on > 0\.5\)/);
    expect(stage.glsl).toContain("stageResult.x");
    expect(stage.glsl).toContain("stageResult.y");
  });

  // White balance and every earlier scene-linear stage run before this one, so
  // a map read from the decoded source asks for the shift the pixel had before
  // them, and the inline applies it to the pixel as it is now.
  it("pulls a white-balanced pixel onto its node", () => {
    const source: Vec3 = [0.32, 0.2, 0.1];
    const current: Vec3 = [source[0] * 0.55, source[1], source[2] * 1.9];
    const node = wrapHue(hueTurn(linearSrgbToJch(current)[2]) + 0.03);
    const p: HarmonyParams = {
      ...DEFAULT_PARAMS,
      rule: CUSTOM_RULE,
      customHues: [node, node, 0, 0],
      customNodes: 2,
      pullStrength: 1,
      neutralProtection: 0,
      smoothing: 1,
    };
    const mapped = stage.reads === "current" ? current : source;
    const out = applyCorrection(current, pixelCorrection(mapped, p, harmonyNodes(p)), p);
    let miss = Math.abs(hueTurn(linearSrgbToJch(out)[2]) - node);
    if (miss > 0.5) miss = 1 - miss;
    expect(miss).toBeLessThan(1e-3);
  });

  it("stays within the per-draw texture-fetch budget", () => {
    const passes = stage.passes ?? [];
    for (const version of [1, 2]) {
      const map = fetchBudget(atVersion(passes[0].glsl, version), passes[0].helpers ?? "");
      const blur = fetchBudget(atVersion(passes[1].glsl, version), passes[1].helpers ?? "");
      expect(map).toBe(1);
      expect(blur).toBe(5);
      expect(map * (passes[0].iterations ?? 1) + blur * (passes[1].iterations ?? 1)).toBeLessThanOrEqual(41);
    }
  });
});

// Version 1 edits keep the look they were made with: the moved colour replaces
// the pixel, and the blur is sized against a 4096 px long edge.
describe("process versions", () => {
  const stage = smoothStage();
  const blur = (stage.passes ?? [])[1]?.glsl ?? "";

  it("replaces the pixel with the moved colour on version 1 and adds the change from version 2", () => {
    for (const helpers of [stage.helpers ?? "", harmonizeStage().helpers ?? ""]) {
      const v1 = atVersion(helpers, 1);
      const v2 = atVersion(helpers, 2);
      expect(v1).toContain("return chRgb(vec3(jch.x, C, hue));");
      expect(v1).not.toMatch(/return rgb \+/);
      expect(v2).toContain("return rgb + chRgb(vec3(jch.x, C, hue)) - chRgb(jch);");
      expect(atVersion(helpers, 3)).toBe(v2);
    }
  });

  // From version 2 the map reads the image as edited; a version 1 photo's
  // stage reads the decode, as those edits were made, with no split draw and
  // a prepass that upstream edits leave alone.
  it("maps the image as edited from version 2 only", () => {
    expect(stage.reads).toBe("current");
    expect(stage.readsCurrentFrom).toBe(2);
    const map = (stage.passes ?? [])[0];
    expect(atVersion(map.glsl, 1)).toBe(atVersion(map.glsl, 2));
    expect(map.glsl).toMatch(/chJch\(max\(c, 0\.0\)\)/);
  });

  it("keeps version 1's blur radius and sizes it in source pixels from version 2", () => {
    const v1 = atVersion(blur, 1);
    expect(v1).toContain(`float sigma = blur * max(${glslLiteral(1.5)}, 8.0 * longEdge / ${glslLiteral(REFERENCE_LONG_EDGE)});`);
    expect(v1).not.toContain("uSourceSize");
    const v2 = atVersion(blur, 2);
    expect(v2).toContain("uSourceSize");
    expect(v2).not.toContain(glslLiteral(REFERENCE_LONG_EDGE));
  });

  // darktable's σ is smoothing · max(1.5, 8 · scale) pixels of the buffer it
  // processes, scale being that buffer's size over the full image's.
  it("blurs the same number of source pixels whatever the photo's size, from version 2", () => {
    for (const source of [256, 1024, 4096, 6000, 9504]) {
      const pass = Math.min(source, 4096);
      expect((blurSigma(1, pass, source, 2) * source) / pass).toBeCloseTo(8, 9);
      expect((blurSigma(0.5, pass, source, 2) * source) / pass).toBeCloseTo(4, 9);
    }
    expect(blurSigma(1, 256, 6000, 2)).toBe(1.5);
  });

  it("keeps version 1's 4096 px reference", () => {
    expect(blurSigma(1, 256, 256, 1)).toBe(1.5);
    expect(blurSigma(1, 4096, 6000, 1)).toBe(8);
    expect(blurSigma(2, 2048, 2048, 1)).toBe(8);
  });
});

describe("allStages", () => {
  it("returns the fused stage then the smoothing stage with distinct name prefixes", () => {
    expect(allStages().map((s) => s.id)).toEqual([HARMONIZE_ID, SMOOTH_ID]);
    expect(stagePrefix4(HARMONIZE_ID)).not.toBe(stagePrefix4(SMOOTH_ID));
  });

  // The host gives a mask's copy its own copy of helpers that name one of the
  // stage's uniforms, comments included (it matches by word); helpers clear of
  // them are shared, so each mask adds no helper code to the program.
  it("keeps the helpers clear of every uniform name, so a mask's copy shares them", () => {
    for (const s of allStages()) {
      const keys = [...s.uniforms, ...(s.passes ?? []).flatMap((p) => p.uniforms ?? [])].map((u) => u.key);
      for (const key of keys) expect(s.helpers ?? "").not.toMatch(new RegExp(`\\b${key}\\b`));
    }
  });
});
