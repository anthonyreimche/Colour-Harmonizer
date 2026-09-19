// The GPU side: darktable's color harmonizer as two stages in the host's
// scene-linear phase.
//
// `harmonize` is darktable's fused single pass — RGB → UCS JCH → pull toward
// the nearest node → RGB — as one inline block, entered only while smoothing
// is off and the effect is non-trivial, so the defaults are a bit-exact no-op.
//
// `smooth` is darktable's two-pass path: a map pass writes each pixel's
// correction (hue shift, saturation delta) to a float target, a blur pass
// smooths that field spatially, and the inline applies the blurred correction
// to the pixel's own JCH. darktable blurs with a recursive Gaussian; here four
// à trous levels of the separable B3 spline [1,4,6,4,1]/16 (dilations s, 2s,
// 4s, 8s) approximate it at five fetches per draw. Their variances add up to
// 85·s², so s = σ / √85, with σ darktable's `smoothing · max(1.5, 8 · scale) ·
// max(1, pullWidth)` pixels against a 4096-px reference long edge, so Develop,
// thumbnails and export agree. Every key under this stage is zero while it
// idles — the host's condition for skipping a prepass — and `on` gates the
// inline (the host binds the raw source as stageResult while it idles).
//
// The map pass sees the source before the user's white-balance tweak and any
// earlier scene-linear stage (a property of the prepass framework); the field
// is smoothed spatially anyway, so this only nudges where a zone edge falls.
// Signed corrections need the host's float ping-pong targets
// (EXT_color_buffer_float, every desktop GPU); the 8-bit fallback clips them.
//
// The constants are formatted from ucs.ts / harmony.ts, so the shader and the
// CPU reference cannot drift apart.

import { DEFAULT_PARAMS, MAX_NODES, harmonyNodes } from "./harmony";
import { HARMONIZE_ID, HARMONIZE_UNIFORMS, SMOOTH_ID, type HarmonizeUniform } from "./params";
import type { ProcessingStageContribution, StagePass, UniformDeclaration } from "./safelight";
import {
  D65_XY,
  FLT_MIN,
  L_WHITE,
  SRGB_TO_XYZ_D65,
  UCS_CHROMA_INVERSE_EXPONENT,
  UCS_CHROMA_L_EXPONENT,
  UCS_CHROMA_M_EXPONENT,
  UCS_CHROMA_SCALE,
  UCS_L_STAR_EXPONENT,
  UCS_L_STAR_INVERSE_EXPONENT,
  UCS_L_STAR_OFFSET,
  UCS_L_STAR_RANGE,
  UCS_L_STAR_UPPER_LIMIT,
  UCS_UV_FACTORS,
  UCS_UV_HALF,
  UCS_UV_OFFSETS,
  UCS_UV_PRIME,
  UCS_UV_UNPRIME,
  UCS_UV_X_FACTORS,
  UCS_UV_Y_FACTORS,
  UCS_XY_OFFSETS,
  UCS_XY_U_FACTORS,
  UCS_XY_V_FACTORS,
  XYZ_TO_SRGB_D65,
} from "./ucs";

export const BLUR_LEVELS = 4;
/** Two draws (horizontal, vertical) per level. */
export const BLUR_ITERATIONS = 2 * BLUR_LEVELS;
/** √(1 + 4 + 16 + 64): the B3 spline's unit variance summed over the levels. */
export const BLUR_VARIANCE_SCALE = Math.sqrt((4 ** BLUR_LEVELS - 1) / 3);
export const REFERENCE_LONG_EDGE = 4096;

/** A GLSL float literal at full single precision, always with a decimal
 *  point (GLSL ES never promotes an integer literal to float). */
export function glslLiteral(v: number): string {
  const s = v.toPrecision(10);
  if (!s.includes("e")) return s.includes(".") ? s : `${s}.0`;
  const [mantissa, exponent] = s.split("e");
  return `${mantissa.includes(".") ? mantissa : `${mantissa}.0`}e${exponent}`;
}

const lit = glslLiteral;
const vec3 = (v: readonly number[]) => `vec3(${v.map(lit).join(", ")})`;
const vec2 = (v: readonly number[]) => `vec2(${v.map(lit).join(", ")})`;
/** A row-major 3×3 as a GLSL mat3 constructor (column-major arguments). */
const mat3 = (m: readonly number[]) => `mat3(${[0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => lit(m[i])).join(", ")})`;

// ── UCS + the pull, shared by both stages (namespaced per stage by the host) ─

// Functions only: the host splices both stages' helpers into one fragment
// shader and namespaces function names, so a global constant would be
// declared twice. L_white is inlined as a literal.
const HELPERS = `
float chLStar(float Y) {
  float yh = pow(max(Y, 0.0), ${lit(UCS_L_STAR_EXPONENT)});
  return ${lit(UCS_L_STAR_RANGE)} * yh / (yh + ${lit(UCS_L_STAR_OFFSET)});
}
float chYOfLStar(float L) {
  return pow(${lit(UCS_L_STAR_OFFSET)} * L / (${lit(UCS_L_STAR_RANGE)} - L), ${lit(UCS_L_STAR_INVERSE_EXPONENT)});
}
float chSafeDiv(float d) { return d >= 0.0 ? max(${lit(FLT_MIN)}, d) : min(-${lit(FLT_MIN)}, d); }
vec3 chXyY(vec3 xyz) {
  xyz = max(xyz, 0.0);
  float s = xyz.x + xyz.y + xyz.z;
  return s > 0.0 ? vec3(xyz.xy / s, xyz.y) : vec3(${lit(D65_XY[0])}, ${lit(D65_XY[1])}, xyz.y);
}
vec3 chXyz(vec3 xyY) {
  if (xyY.y == 0.0) return vec3(0.0);
  return vec3(xyY.z * xyY.x / xyY.y, xyY.z, xyY.z * (1.0 - xyY.x - xyY.y) / xyY.y);
}
// Scene-linear RGB -> (J, C, hue turn in [0, 1)).
vec3 chJch(vec3 lin) {
  const mat3 toXyz = ${mat3(SRGB_TO_XYZ_D65)};
  vec3 xyY = chXyY(toXyz * lin);
  vec3 uvd = ${vec3(UCS_UV_X_FACTORS)} * xyY.x + ${vec3(UCS_UV_Y_FACTORS)} * xyY.y + ${vec3(UCS_UV_OFFSETS)};
  vec2 uv = uvd.xy / chSafeDiv(uvd.z);
  vec2 uvs = ${vec2(UCS_UV_FACTORS)} * uv / (abs(uv) + ${vec2(UCS_UV_HALF)});
  vec2 p = vec2(${lit(UCS_UV_PRIME[0])} * uvs.x + ${lit(UCS_UV_PRIME[1])} * uvs.y,
                ${lit(UCS_UV_PRIME[2])} * uvs.x + ${lit(UCS_UV_PRIME[3])} * uvs.y);
  float L = chLStar(xyY.z);
  float C = ${lit(UCS_CHROMA_SCALE)} * pow(L, ${lit(UCS_CHROMA_L_EXPONENT)}) * pow(dot(p, p), ${lit(UCS_CHROMA_M_EXPONENT)}) / ${lit(L_WHITE)};
  float hue = (atan(p.y, p.x) + ${lit(Math.PI)}) / ${lit(2 * Math.PI)};
  return vec3(L / ${lit(L_WHITE)}, C, hue);
}
// (J, C, hue turn) -> scene-linear RGB.
vec3 chRgb(vec3 jch) {
  const mat3 toRgb = ${mat3(XYZ_TO_SRGB_D65)};
  float L = clamp(jch.x * ${lit(L_WHITE)}, 0.0, ${lit(UCS_L_STAR_UPPER_LIMIT)});
  float M = L != 0.0
    ? pow(jch.y * ${lit(L_WHITE)} / (${lit(UCS_CHROMA_SCALE)} * pow(L, ${lit(UCS_CHROMA_L_EXPONENT)})), ${lit(UCS_CHROMA_INVERSE_EXPONENT)})
    : 0.0;
  float H = jch.z * ${lit(2 * Math.PI)} - ${lit(Math.PI)};
  vec2 p = M * vec2(cos(H), sin(H));
  vec2 uvs = vec2(${lit(UCS_UV_UNPRIME[0])} * p.x + ${lit(UCS_UV_UNPRIME[1])} * p.y,
                  ${lit(UCS_UV_UNPRIME[2])} * p.x + ${lit(UCS_UV_UNPRIME[3])} * p.y);
  vec2 uv = -${vec2(UCS_UV_HALF)} * uvs / (abs(uvs) - ${vec2(UCS_UV_FACTORS)});
  vec3 xyD = ${vec3(UCS_XY_U_FACTORS)} * uv.x + ${vec3(UCS_XY_V_FACTORS)} * uv.y + ${vec3(UCS_XY_OFFSETS)};
  vec3 xyY = vec3(xyD.xy / chSafeDiv(xyD.z), chYOfLStar(L));
  return toRgb * chXyz(xyY);
}
float chAt(vec4 v, int i) { return i == 0 ? v.x : (i == 1 ? v.y : (i == 2 ? v.z : v.w)); }
float chWrap(float h) { return h - floor(h); }
// Pull toward the nearest node: (weighted hue shift, its Gaussian weight, winner).
// Parameter names stay clear of the uniform keys the host rewrites (nodes, …).
vec3 chPull(float hue, vec4 nodeHues, int n, float zoneWidth) {
  if (n <= 0) return vec3(0.0);
  float sigma = zoneWidth * 0.5 / float(n);
  float inv2s2 = 1.0 / (2.0 * sigma * sigma);
  float maxW = 0.0;
  float diffW = 0.0;
  int win = 0;
  for (int i = 0; i < ${MAX_NODES}; i++) {
    if (i >= n) break;
    float node = chAt(nodeHues, i);
    float d = abs(hue - node);
    if (d > 0.5) d = 1.0 - d;
    float w = exp(-d * d * inv2s2);
    float diff = node - hue;
    if (diff > 0.5) diff -= 1.0; else if (diff < -0.5) diff += 1.0;
    if (w > maxW) { maxW = w; win = i; diffW = diff; }
  }
  return vec3(diffW * maxW, maxW, float(win));
}
// Apply a (hue shift, saturation delta) correction to a pixel's JCH.
vec3 chFinish(vec3 jch, float hueShift, float satDelta, float pull, float neutral) {
  float cutoff = neutral * neutral * neutral * ${lit(0.03)};
  float cw = jch.y / (jch.y + cutoff + ${lit(1e-5)});
  float hue = chWrap(jch.z + hueShift * pull * cw);
  float C = max(jch.y * (1.0 + satDelta * cw), 0.0);
  return chRgb(vec3(jch.x, C, hue));
}
`;

// ── Fused stage ──────────────────────────────────────────────────────────────

const HARMONIZE_GLSL = `
{
  if (smoothing <= 0.0 && (pullStrength > 0.0 || any(notEqual(nodeSat, vec4(1.0))))) {
    int n = int(nodeCount + 0.5);
    vec3 jch = chJch(max(lin, 0.0));
    vec3 pull = chPull(jch.z, nodes, n, pullWidth);
    float satDelta = (chAt(nodeSat, int(pull.z)) - 1.0) * pull.y;
    lin = chFinish(jch, pull.x, satDelta, pullStrength, neutralProtection);
  }
}
`;

const RANGE: Partial<Record<HarmonizeUniform, UniformDeclaration["range"]>> = {
  rule: { min: 0, max: 9, step: 1 },
  anchorHue: { min: 0, max: 1, step: 0.001 },
  customNodes: { min: 2, max: 4, step: 1 },
  pullStrength: { min: 0, max: 1, step: 0.01 },
  pullWidth: { min: 0.25, max: 4, step: 0.01 },
  neutralProtection: { min: 0, max: 1, step: 0.01 },
  smoothing: { min: 0, max: 2, step: 0.01 },
};

const LABEL: Record<HarmonizeUniform, string> = {
  rule: "harmony rule",
  anchorHue: "anchor hue",
  customHues: "custom node hues",
  customNodes: "nodes",
  nodeSat: "node saturation",
  pullStrength: "pull strength",
  pullWidth: "pull width",
  neutralProtection: "neutral color protection",
  smoothing: "smoothing",
  nodes: "harmony nodes",
  nodeCount: "node count",
};

function harmonizeUniforms(): UniformDeclaration[] {
  const d = DEFAULT_PARAMS;
  const { nodes, count } = harmonyNodes(d);
  const padded = [...nodes, 0, 0, 0, 0].slice(0, MAX_NODES);
  const defaults: Record<HarmonizeUniform, number | number[]> = {
    rule: d.rule,
    anchorHue: d.anchorHue,
    customHues: [...d.customHues],
    customNodes: d.customNodes,
    nodeSat: [...d.nodeSat],
    pullStrength: d.pullStrength,
    pullWidth: d.pullWidth,
    neutralProtection: d.neutralProtection,
    smoothing: d.smoothing,
    nodes: padded,
    nodeCount: count,
  };
  return HARMONIZE_UNIFORMS.map((key) => ({
    key,
    glslType: Array.isArray(defaults[key]) ? "vec4" : "float",
    default: defaults[key],
    range: RANGE[key],
    label: LABEL[key],
  }));
}

export function harmonizeStage(): ProcessingStageContribution {
  return {
    id: HARMONIZE_ID,
    name: "Colour Harmony",
    phase: "scene-linear",
    priority: 80,
    glsl: HARMONIZE_GLSL,
    helpers: HELPERS,
    uniforms: harmonizeUniforms(),
    presetScope: "global",
  };
}

// ── Smoothing stage ──────────────────────────────────────────────────────────

const MAP_GLSL = `
{
  int n = int(nodeCount + 0.5);
  vec3 jch = chJch(max(c, 0.0));
  vec3 pull = chPull(jch.z, nodes, n, pullWidth);
  float satDelta = (chAt(nodeSat, int(pull.z)) - 1.0) * pull.y;
  c = vec3(pull.x, satDelta, 0.0);
}
`;

// One separable B3 draw: even iterations run horizontally, odd vertically,
// each pair one à trous level. `c` (the host's centre read) is the middle tap.
const BLUR_GLSL = `
{
  int level = uPassIndex / 2;
  bool horizontal = (uPassIndex - 2 * level) == 0;
  float longEdge = max(1.0 / uTexel.x, 1.0 / uTexel.y);
  float sigma = blur * max(${lit(1.5)}, 8.0 * longEdge / ${lit(REFERENCE_LONG_EDGE)});
  float dil = sigma / ${lit(BLUR_VARIANCE_SCALE)} * exp2(float(level));
  vec2 step = (horizontal ? vec2(uTexel.x, 0.0) : vec2(0.0, uTexel.y)) * dil;
  vec3 acc = 0.375 * c;
  for (int k = 1; k <= 2; k++) {
    float w = k == 1 ? 0.25 : 0.0625;
    acc += w * (readPrev(vUv + float(k) * step) + readPrev(vUv - float(k) * step));
  }
  c = acc;
}
`;

const SMOOTH_GLSL = `
{
  if (on > 0.5) {
    vec3 jch = chJch(max(lin, 0.0));
    lin = chFinish(jch, stageResult.x, stageResult.y, pullStrength, neutralProtection);
  }
}
`;

const zero = (key: string, glslType: "float" | "vec4"): UniformDeclaration => ({
  key,
  glslType,
  default: glslType === "vec4" ? [0, 0, 0, 0] : 0,
});

// A pass program declares only its own uniforms (they are namespaced under the
// stage's key set), so each pass lists exactly what its GLSL reads.
const MAP_UNIFORMS: UniformDeclaration[] = [
  zero("nodes", "vec4"),
  zero("nodeCount", "float"),
  zero("nodeSat", "vec4"),
  zero("pullWidth", "float"),
];

const BLUR_UNIFORMS: UniformDeclaration[] = [zero("blur", "float")];

const SMOOTH_INLINE_UNIFORMS: UniformDeclaration[] = [
  zero("pullStrength", "float"),
  zero("neutralProtection", "float"),
  zero("on", "float"),
];

export function smoothStage(): ProcessingStageContribution {
  const map: StagePass = { glsl: MAP_GLSL, helpers: HELPERS, iterations: 1, uniforms: MAP_UNIFORMS };
  const blur: StagePass = { glsl: BLUR_GLSL, iterations: BLUR_ITERATIONS, uniforms: BLUR_UNIFORMS };
  return {
    id: SMOOTH_ID,
    name: "Colour Harmony · smoothing",
    phase: "scene-linear",
    priority: 81,
    glsl: SMOOTH_GLSL,
    helpers: HELPERS,
    uniforms: SMOOTH_INLINE_UNIFORMS,
    passes: [map, blur],
    presetScope: "global",
  };
}

export function allStages(): ProcessingStageContribution[] {
  return [harmonizeStage(), smoothStage()];
}
