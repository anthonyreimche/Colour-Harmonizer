// The two GPU stages as contracts: which keys they declare with which
// defaults (the bag bridge and the panel rely on them), that the GLSL is
// formatted from the model's constants, that the fused block is gated exactly
// as designed, and a static per-draw texture-fetch budget on the real pass
// GLSL — the class of cost the CPU reference never sees.

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, harmonyNodes } from "../src/harmony";
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
  glslLiteral,
  harmonizeStage,
  smoothStage,
} from "../src/stage";
import { L_WHITE, SRGB_TO_XYZ_D65, UCS_UV_X_FACTORS } from "../src/ucs";
import { fetchBudget } from "./support/fetch-budget";

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

  it("stays within the per-draw texture-fetch budget", () => {
    const passes = stage.passes ?? [];
    const map = fetchBudget(passes[0].glsl, passes[0].helpers ?? "");
    const blur = fetchBudget(passes[1].glsl, passes[1].helpers ?? "");
    expect(map).toBe(1);
    expect(blur).toBe(5);
    expect(map * (passes[0].iterations ?? 1) + blur * (passes[1].iterations ?? 1)).toBeLessThanOrEqual(41);
  });
});

describe("allStages", () => {
  it("returns the fused stage then the smoothing stage with distinct name prefixes", () => {
    expect(allStages().map((s) => s.id)).toEqual([HARMONIZE_ID, SMOOTH_ID]);
    expect(stagePrefix4(HARMONIZE_ID)).not.toBe(stagePrefix4(SMOOTH_ID));
  });
});
