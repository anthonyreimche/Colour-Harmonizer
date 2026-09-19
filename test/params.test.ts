// The bridge between the panel's params and the develop param bag: what is
// persisted, what the GPU reads, and the rule that keeps the smoothing stage's
// keys at zero (the host runs a stage's prepass whenever any of its keys is
// non-zero) until smoothing is on and the effect is non-trivial.

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, harmonyNodes, type HarmonyParams } from "../src/harmony";
import {
  HARMONIZE_ID,
  KEY,
  SMOOTH_ID,
  SMOOTH_KEY,
  deriveAll,
  readParams,
  rederivePatch,
  resetPatch,
  smoothActive,
} from "../src/params";

const SAMPLE: HarmonyParams = {
  rule: 6,
  anchorHue: 0.37,
  customHues: [0.1, 0.2, 0.3, 0.4],
  customNodes: 3,
  nodeSat: [1.2, 0.8, 1, 1],
  pullStrength: 0.4,
  pullWidth: 1.5,
  neutralProtection: 0.3,
  smoothing: 0,
};

const SMOOTH_KEYS = Object.values(SMOOTH_KEY);

const allZero = (patch: Record<string, unknown>) =>
  SMOOTH_KEYS.every((k) => {
    const v = patch[k];
    return v === 0 || (Array.isArray(v) && v.every((x) => x === 0));
  });

describe("stage ids", () => {
  it("qualifies every key under its stage id", () => {
    expect(HARMONIZE_ID.startsWith("colour-harmony.harmonize")).toBe(true);
    expect(SMOOTH_ID.startsWith("colour-harmony.smooth")).toBe(true);
    for (const k of Object.values(KEY)) expect(k.startsWith(`${HARMONIZE_ID}.`)).toBe(true);
    for (const k of SMOOTH_KEYS) expect(k.startsWith(`${SMOOTH_ID}.`)).toBe(true);
  });
});

describe("readParams", () => {
  it("reads darktable's defaults from an empty bag", () => {
    expect(readParams({})).toEqual(DEFAULT_PARAMS);
  });

  it("falls back per key on foreign values and clamps out-of-range ones", () => {
    const p = readParams({
      [KEY.pullStrength]: "loud",
      [KEY.nodeSat]: [1, 2],
      [KEY.customHues]: [0.1, "x", 0.3, 0.4],
      [KEY.rule]: 42,
      [KEY.customNodes]: 7,
      [KEY.anchorHue]: Number.NaN,
      [KEY.pullWidth]: 0.9,
    });
    expect(p.pullStrength).toBe(DEFAULT_PARAMS.pullStrength);
    expect(p.nodeSat).toEqual(DEFAULT_PARAMS.nodeSat);
    expect(p.customHues).toEqual(DEFAULT_PARAMS.customHues);
    expect(p.rule).toBe(9);
    expect(p.customNodes).toBe(4);
    expect(p.anchorHue).toBe(DEFAULT_PARAMS.anchorHue);
    expect(p.pullWidth).toBe(0.9);
    expect(readParams({ [KEY.rule]: -3, [KEY.customNodes]: 1 })).toMatchObject({ rule: 0, customNodes: 2 });
  });

  it("round-trips through deriveAll", () => {
    expect(readParams(deriveAll(SAMPLE))).toEqual(SAMPLE);
  });
});

describe("deriveAll", () => {
  it("writes the nodes the GPU reads next to the params, padded to a vec4", () => {
    const patch = deriveAll(SAMPLE);
    const { nodes, count } = harmonyNodes(SAMPLE);
    expect(patch[KEY.nodeCount]).toBe(count);
    expect(patch[KEY.nodes]).toEqual([...nodes, 0]);
    expect(patch[KEY.nodeSat]).toEqual(SAMPLE.nodeSat);
  });

  it("keeps the smoothing stage at zero while smoothing is off or the effect is nil", () => {
    expect(allZero(deriveAll(DEFAULT_PARAMS))).toBe(true);
    expect(allZero(deriveAll(SAMPLE))).toBe(true);
    expect(allZero(deriveAll({ ...DEFAULT_PARAMS, smoothing: 1 }))).toBe(true);
    expect(smoothActive({ ...DEFAULT_PARAMS, smoothing: 1 })).toBe(false);
  });

  it("drives the smoothing stage once smoothing is on and something is pulled", () => {
    const p = { ...SAMPLE, smoothing: 0.5, pullWidth: 2 };
    expect(smoothActive(p)).toBe(true);
    const patch = deriveAll(p);
    const { nodes, count } = harmonyNodes(p);
    expect(patch[SMOOTH_KEY.on]).toBe(1);
    expect(patch[SMOOTH_KEY.nodes]).toEqual([...nodes, 0]);
    expect(patch[SMOOTH_KEY.nodeCount]).toBe(count);
    expect(patch[SMOOTH_KEY.nodeSat]).toEqual(p.nodeSat);
    expect(patch[SMOOTH_KEY.pullWidth]).toBe(2);
    expect(patch[SMOOTH_KEY.blur]).toBe(0.5 * 2);
    expect(patch[SMOOTH_KEY.pullStrength]).toBe(p.pullStrength);
    expect(patch[SMOOTH_KEY.neutralProtection]).toBe(p.neutralProtection);
    const sat = deriveAll({ ...DEFAULT_PARAMS, smoothing: 1, nodeSat: [1, 0.5, 1, 1] });
    expect(sat[SMOOTH_KEY.on]).toBe(1);
    expect(sat[SMOOTH_KEY.blur]).toBe(1);
  });

  it("resets to darktable's defaults", () => {
    expect(readParams(resetPatch())).toEqual(DEFAULT_PARAMS);
    expect(allZero(resetPatch())).toBe(true);
  });
});

describe("rederivePatch", () => {
  it("leaves a bag with no harmony keys, or a freshly derived one, alone", () => {
    expect(rederivePatch({})).toBeNull();
    expect(rederivePatch({ "other-ext.stage.amount": 3 })).toBeNull();
    expect(rederivePatch(deriveAll(SAMPLE))).toBeNull();
    expect(rederivePatch(deriveAll({ ...SAMPLE, smoothing: 1 }))).toBeNull();
  });

  it("re-derives when a bag carries the rule keys without the GPU nodes", () => {
    const bag = deriveAll(SAMPLE);
    delete bag[KEY.nodes];
    delete bag[KEY.nodeCount];
    expect(rederivePatch(bag)).toEqual(deriveAll(SAMPLE));
  });

  it("re-derives when the nodes no longer match the anchor", () => {
    const bag = { ...deriveAll(SAMPLE), [KEY.anchorHue]: 0.8 };
    const patch = rederivePatch(bag);
    expect(patch).not.toBeNull();
    expect(patch![KEY.nodes]).toEqual([...harmonyNodes({ ...SAMPLE, anchorHue: 0.8 }).nodes, 0]);
  });

  it("re-derives when the smoothing stage disagrees with the params", () => {
    const bag = { ...deriveAll({ ...SAMPLE, smoothing: 1 }), [SMOOTH_KEY.on]: 0 };
    expect(rederivePatch(bag)).toEqual(deriveAll({ ...SAMPLE, smoothing: 1 }));
  });
});
