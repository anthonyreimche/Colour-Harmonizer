// The bridge between the panel's params and the develop param bag. Two things
// live there, under the two stage ids, so the render is right even when the
// panel never mounts (export, loupe, a freshly loaded edit or preset):
//  • the params the PANEL edits (rule, anchor, custom hues, …), which the GPU
//    mostly ignores;
//  • the values the STAGES read — the derived UCS nodes, and the smoothing
//    stage's copy of everything its passes need.
// The host runs a stage's prepass whenever any key under its id is non-zero,
// which is why the smoothing stage's keys are written as zeros until smoothing
// is on and the effect is non-trivial.

import {
  CUSTOM_RULE,
  DEFAULT_PARAMS,
  MAX_NODES,
  effectActive,
  harmonyNodes,
  type HarmonyParams,
} from "./harmony";

export const EXT_ID = "colour-harmony";

/** The host prefixes a stage's GLSL names with a 4-char hash of its id
 *  (shader-compiler.ts hashStageId); sibling ids that collide redefine each
 *  other's uniforms. Mirrored here so an id can be salted until unique. */
export function stagePrefix4(stageId: string): string {
  let h = 0;
  for (let i = 0; i < stageId.length; i++) h = ((h << 5) - h + stageId.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 4);
}

function uniqueIds(bases: string[]): string[] {
  const seen = new Set<string>();
  return bases.map((base) => {
    let id = base;
    for (let salt = 1; seen.has(stagePrefix4(id)) && salt < 1000; salt++) id = `${base}-${salt}`;
    seen.add(stagePrefix4(id));
    return id;
  });
}

const [harmonizeId, smoothId] = uniqueIds([`${EXT_ID}.harmonize`, `${EXT_ID}.smooth`]);
export const HARMONIZE_ID = harmonizeId;
export const SMOOTH_ID = smoothId;

const qualify = <K extends string>(stageId: string, keys: readonly K[]): Record<K, string> => {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = `${stageId}.${k}`;
  return out;
};

export const HARMONIZE_UNIFORMS = [
  "rule",
  "anchorHue",
  "customHues",
  "customNodes",
  "nodeSat",
  "pullStrength",
  "pullWidth",
  "neutralProtection",
  "smoothing",
  "nodes",
  "nodeCount",
] as const;
export type HarmonizeUniform = (typeof HARMONIZE_UNIFORMS)[number];
export const KEY = qualify(HARMONIZE_ID, HARMONIZE_UNIFORMS);

export const SMOOTH_UNIFORMS = [
  "nodes",
  "nodeCount",
  "nodeSat",
  "pullWidth",
  "blur",
  "pullStrength",
  "neutralProtection",
  "on",
] as const;
export type SmoothUniform = (typeof SMOOTH_UNIFORMS)[number];
export const SMOOTH_KEY = qualify(SMOOTH_ID, SMOOTH_UNIFORMS);

export type Bag = Record<string, unknown>;
export type Patch = Record<string, number | number[]>;

export const MIN_CUSTOM_NODES = 2;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function num(bag: Bag, key: string, fallback: number): number {
  const v = bag[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function vec4(bag: Bag, key: string, fallback: readonly number[]): number[] {
  const v = bag[key];
  return Array.isArray(v) && v.length === MAX_NODES && v.every((x) => typeof x === "number" && Number.isFinite(x))
    ? [...(v as number[])]
    : [...fallback];
}

/** The panel's params from a bag, darktable's defaults for anything missing
 *  or foreign; the rule and node count are clamped to their ranges. */
export function readParams(bag: Bag): HarmonyParams {
  const d = DEFAULT_PARAMS;
  return {
    rule: clamp(Math.round(num(bag, KEY.rule, d.rule)), 0, CUSTOM_RULE),
    anchorHue: num(bag, KEY.anchorHue, d.anchorHue),
    customHues: vec4(bag, KEY.customHues, d.customHues),
    customNodes: clamp(Math.round(num(bag, KEY.customNodes, d.customNodes)), MIN_CUSTOM_NODES, MAX_NODES),
    nodeSat: vec4(bag, KEY.nodeSat, d.nodeSat),
    pullStrength: num(bag, KEY.pullStrength, d.pullStrength),
    pullWidth: num(bag, KEY.pullWidth, d.pullWidth),
    neutralProtection: num(bag, KEY.neutralProtection, d.neutralProtection),
    smoothing: num(bag, KEY.smoothing, d.smoothing),
  };
}

/** The smoothing stage runs only when it has a blur to apply and a
 *  correction to blur. */
export function smoothActive(p: HarmonyParams): boolean {
  return p.smoothing > 0 && effectActive(p);
}

const ZERO4 = [0, 0, 0, 0];

function padNodes(nodes: readonly number[]): number[] {
  const out = [...ZERO4];
  for (let i = 0; i < nodes.length && i < MAX_NODES; i++) out[i] = nodes[i];
  return out;
}

/** Everything to persist and drive the GPU for a param set. */
export function deriveAll(p: HarmonyParams): Patch {
  const { nodes, count } = harmonyNodes(p);
  const padded = padNodes(nodes);
  const out: Patch = {
    [KEY.rule]: p.rule,
    [KEY.anchorHue]: p.anchorHue,
    [KEY.customHues]: [...p.customHues],
    [KEY.customNodes]: p.customNodes,
    [KEY.nodeSat]: [...p.nodeSat],
    [KEY.pullStrength]: p.pullStrength,
    [KEY.pullWidth]: p.pullWidth,
    [KEY.neutralProtection]: p.neutralProtection,
    [KEY.smoothing]: p.smoothing,
    [KEY.nodes]: padded,
    [KEY.nodeCount]: count,
  };
  const on = smoothActive(p);
  out[SMOOTH_KEY.nodes] = on ? [...padded] : [...ZERO4];
  out[SMOOTH_KEY.nodeCount] = on ? count : 0;
  out[SMOOTH_KEY.nodeSat] = on ? [...p.nodeSat] : [...ZERO4];
  out[SMOOTH_KEY.pullWidth] = on ? p.pullWidth : 0;
  out[SMOOTH_KEY.blur] = on ? p.smoothing * Math.max(1, p.pullWidth) : 0;
  out[SMOOTH_KEY.pullStrength] = on ? p.pullStrength : 0;
  out[SMOOTH_KEY.neutralProtection] = on ? p.neutralProtection : 0;
  out[SMOOTH_KEY.on] = on ? 1 : 0;
  return out;
}

export function resetPatch(): Patch {
  return deriveAll(DEFAULT_PARAMS);
}

const same = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => x === b[i])
    : a === b;

/** A bag that carries the panel's params but stale or missing GPU values (a
 *  preset that took only some fields, an edit from a release with other
 *  derived keys) gets them re-derived. Returns the full patch to write, or
 *  null when the bag holds no harmony edit or is already consistent. */
export function rederivePatch(bag: Bag): Patch | null {
  const userKeys = HARMONIZE_UNIFORMS.filter((k) => k !== "nodes" && k !== "nodeCount").map((k) => KEY[k]);
  if (!userKeys.some((k) => k in bag)) return null;
  const expected = deriveAll(readParams(bag));
  const derivedKeys = [KEY.nodes, KEY.nodeCount, ...Object.values(SMOOTH_KEY)];
  return derivedKeys.every((k) => same(bag[k], expected[k])) ? null : expected;
}
