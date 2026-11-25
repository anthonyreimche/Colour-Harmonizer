// The panel in the dock and in a mask's Adjust tab. HarmonyPanel holds no
// React hooks of its own (its store reads are the stand-in's selectors), so it
// is called as a plain function over the stand-in createElement and its
// element tree is walked: which tools it shows, and where its edits land.

import { describe, expect, it } from "vitest";
import { rybDegToSrgb, PICK_BAG } from "../src/colour";
import { CUSTOM_RULE, DEFAULT_PARAMS, rybToUcs } from "../src/harmony";
import { HarmonyPanel } from "../src/Panel";
import { deriveAll, readParams } from "../src/params";
import { initRuntime } from "../src/runtime";
import type { ColourFieldProps, SelectProps, SliderProps } from "../src/safelight";
import { HarmonyScope } from "../src/ScopeView";
import { initStore } from "../src/store";
import { UI, fakeApi, type FakeElement, type Rig } from "./support/fake-api";

const isElement = (node: unknown): node is FakeElement =>
  typeof node === "object" && node !== null && "type" in node && "children" in node;

/** Every element in a tree, depth first. */
function elements(node: unknown): FakeElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isElement(node)) return [];
  return [node, ...elements(node.children)];
}

function mount(rig: Rig): FakeElement[] {
  initRuntime(rig.api);
  initStore();
  return elements(HarmonyPanel());
}

const ofType = (tree: FakeElement[], type: unknown) => tree.filter((e) => e.type === type);
const buttons = (tree: FakeElement[], text: string) =>
  ofType(tree, UI.Button).filter((e) => e.children.includes(text) || elements(e.children).some((c) => c.children.includes(text)));
const sliderProps = (e: FakeElement) => e.props as unknown as SliderProps;

function field(tree: FakeElement[], label: string): ColourFieldProps {
  const found = ofType(tree, UI.ColourField).find((e) => e.props.label === label);
  if (!found) throw new Error(`no "${label}" colour field`);
  return found.props as unknown as ColourFieldProps;
}

function slider(tree: FakeElement[], label: string): SliderProps {
  const found = ofType(tree, UI.Slider).find((e) => e.props.label === label);
  if (!found) throw new Error(`no "${label}" slider`);
  return sliderProps(found);
}

const CUSTOM_THREE = { ...DEFAULT_PARAMS, rule: CUSTOM_RULE, customNodes: 3 };

describe("HarmonyPanel in the dock", () => {
  it("shows the scope and Infer, and no Pick buttons: the colour fields carry the eyedropper", () => {
    for (const p of [DEFAULT_PARAMS, CUSTOM_THREE]) {
      const tree = mount(fakeApi(deriveAll(p)));
      expect(ofType(tree, HarmonyScope)).toHaveLength(1);
      expect(buttons(tree, "Infer")).toHaveLength(1);
      expect(buttons(tree, "Pick")).toEqual([]);
    }
  });

  it("puts a hue-only colour field above the Anchor hue slider, and one per custom node above its Hue slider", () => {
    const anchor = ofType(mount(fakeApi(deriveAll(DEFAULT_PARAMS))), UI.ColourField);
    expect(anchor.map((e) => e.props.label)).toEqual(["Anchor colour"]);
    const custom = ofType(mount(fakeApi(deriveAll(CUSTOM_THREE))), UI.ColourField);
    expect(custom.map((e) => e.props.label)).toEqual(["Colour 1", "Colour 2", "Colour 3"]);
    for (const e of [...anchor, ...custom]) {
      expect("saturation" in e.props).toBe(false);
      expect("lightness" in e.props).toBe(false);
    }
  });

  it("shows the stored hue in RYB degrees, as the slider beside it does", () => {
    const tree = mount(fakeApi(deriveAll({ ...DEFAULT_PARAMS, anchorHue: 0.3 })));
    expect(field(tree, "Anchor colour").hue).toBeCloseTo(slider(tree, "Anchor hue").value, 9);
  });

  it("draws the track's colour and reads a picked colour back into RYB degrees", () => {
    const f = field(mount(fakeApi(deriveAll(DEFAULT_PARAMS))), "Anchor colour");
    expect(f.toRgb?.(120, 100, 50)).toEqual(rybDegToSrgb(120));
    const back = f.fromRgb?.(rybDegToSrgb(120));
    expect(back?.hue).toBeCloseTo(120, 0);
  });

  it("samples the photo with the harmonizer off, so the pick is the colour it receives", () => {
    const f = field(mount(fakeApi(deriveAll(DEFAULT_PARAMS))), "Anchor colour");
    expect(f.pick).toEqual({ paramBag: PICK_BAG });
  });

  it("writes a field's drag as one undo step: live to the bag, one commit with the slider's label", () => {
    const rig = fakeApi(deriveAll(CUSTOM_THREE));
    const tree = mount(rig);
    const f = field(tree, "Colour 2");
    f.onChange({ hue: 200 });
    f.onChange({ hue: 210 });
    expect(rig.commits).toEqual([]);
    f.onCommit?.();
    const next = readParams(rig.develop.getState().paramBag);
    expect(next.customHues[1]).toBeCloseTo(rybToUcs(210 / 360), 9);
    expect(next.customHues[0]).toBe(CUSTOM_THREE.customHues[0]);
    expect(rig.commits).toEqual(["Colour Harmony hue 2"]);
  });

  it("writes the anchor field to anchorHue", () => {
    const rig = fakeApi(deriveAll(DEFAULT_PARAMS));
    const f = field(mount(rig), "Anchor colour");
    f.onChange({ hue: 90 });
    f.onCommit?.();
    expect(readParams(rig.develop.getState().paramBag).anchorHue).toBeCloseTo(rybToUcs(0.25), 9);
    expect(rig.commits).toEqual(["Colour Harmony anchor hue"]);
  });

  it("writes a drag to the photo's bag through deriveAll and commits on release", () => {
    const rig = fakeApi();
    const pull = slider(mount(rig), "Pull strength");
    pull.onChange(0.6);
    pull.onCommit?.();
    expect(rig.develop.getState().paramBag).toEqual(deriveAll({ ...DEFAULT_PARAMS, pullStrength: 0.6 }));
    expect(rig.commits).toEqual(["Colour Harmony pull strength"]);
  });
});

// What measures or picks from the whole photo drives the photo's own harmony,
// so a mask's panel leaves it out.
describe("HarmonyPanel styling", () => {
  it("colours the node count and the scope's surface from the ui tokens", () => {
    const rig = fakeApi(deriveAll(DEFAULT_PARAMS));
    const tree = mount(rig);
    const count = tree.find((e) => e.type === "span" && e.children.some((c) => typeof c === "string" && /nodes?$/.test(c)));
    expect((count?.props.style as { color?: string }).color).toBe("muted-token");
    const canvas = elements(HarmonyScope()).find((e) => e.type === "canvas");
    expect((canvas?.props.style as { background?: string }).background).toBe("surface-token");
  });
});

describe("HarmonyPanel in a mask", () => {
  it("shows the mask's harmony, not the photo's", () => {
    const rig = fakeApi(deriveAll({ ...DEFAULT_PARAMS, pullStrength: 0.8 }));
    rig.inMask(deriveAll({ ...DEFAULT_PARAMS, pullStrength: 0.3 }));
    expect(slider(mount(rig), "Pull strength").value).toBe(0.3);
  });

  it("writes every derived key to the mask, each change from the mask's bag as it is now, and commits once", () => {
    const rig = fakeApi();
    const mask = rig.inMask();
    const tree = mount(rig);
    // Two changes off one render: the second starts from the first's write.
    slider(tree, "Pull strength").onChange(0.5);
    const smoothing = slider(tree, "Smoothing");
    smoothing.onChange(1);
    smoothing.onCommit?.();
    expect(mask.getState().bag).toEqual(deriveAll({ ...DEFAULT_PARAMS, pullStrength: 0.5, smoothing: 1 }));
    expect(rig.develop.getState().paramBag).toEqual({});
    expect(rig.commits).toEqual(["mask: Colour Harmony smoothing"]);
  });

  it("leaves out the scope and Infer, for a rule and for custom nodes", () => {
    for (const p of [DEFAULT_PARAMS, CUSTOM_THREE]) {
      const rig = fakeApi();
      rig.inMask(deriveAll(p));
      const tree = mount(rig);
      expect(ofType(tree, HarmonyScope)).toEqual([]);
      expect(buttons(tree, "Infer")).toEqual([]);
    }
    // The custom node rows themselves stay.
    const rig = fakeApi();
    rig.inMask(deriveAll(CUSTOM_THREE));
    expect(ofType(mount(rig), UI.Slider).map((e) => e.props.label)).toEqual(expect.arrayContaining(["Hue 1", "Hue 2", "Hue 3"]));
  });

  it("writes a colour field's change to the mask, not the photo", () => {
    const rig = fakeApi();
    const mask = rig.inMask(deriveAll(CUSTOM_THREE));
    const f = field(mount(rig), "Colour 1");
    f.onChange({ hue: 45 });
    f.onCommit?.();
    expect(readParams(mask.getState().bag).customHues[0]).toBeCloseTo(rybToUcs(45 / 360), 9);
    expect(rig.develop.getState().paramBag).toEqual({});
    expect(rig.commits).toEqual(["mask: Colour Harmony hue 1"]);
  });

  it("writes nothing to the photo, whatever it is given", () => {
    const rig = fakeApi();
    rig.inMask(deriveAll(CUSTOM_THREE));
    const tree = mount(rig);
    for (const b of ofType(tree, UI.Button)) (b.props.onClick as (() => void) | undefined)?.();
    for (const s of ofType(tree, UI.Slider).map(sliderProps)) {
      s.onChange(s.max ?? 1);
      s.onCommit?.();
    }
    for (const s of ofType(tree, UI.Select)) (s.props as unknown as SelectProps).onChange("6");
    expect(rig.registered.patches).toEqual([]);
    expect(rig.develop.getState().paramBag).toEqual({});
  });
});
