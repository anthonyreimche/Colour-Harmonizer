// The panel in the dock and in a mask's Adjust tab. HarmonyPanel holds no
// React hooks of its own (its store reads are the stand-in's selectors), so it
// is called as a plain function over the stand-in createElement and its
// element tree is walked: which tools it shows, and where its edits land.

import { describe, expect, it } from "vitest";
import { CUSTOM_RULE, DEFAULT_PARAMS } from "../src/harmony";
import { HarmonyPanel } from "../src/Panel";
import { deriveAll } from "../src/params";
import { initRuntime } from "../src/runtime";
import type { SelectProps, SliderProps } from "../src/safelight";
import { HarmonyScope } from "../src/ScopeView";
import { initStore, store } from "../src/store";
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
const buttons = (tree: FakeElement[], text: string) => ofType(tree, UI.Button).filter((e) => e.children.includes(text));
const sliderProps = (e: FakeElement) => e.props as unknown as SliderProps;

function slider(tree: FakeElement[], label: string): SliderProps {
  const found = ofType(tree, UI.Slider).find((e) => e.props.label === label);
  if (!found) throw new Error(`no "${label}" slider`);
  return sliderProps(found);
}

const CUSTOM_THREE = { ...DEFAULT_PARAMS, rule: CUSTOM_RULE, customNodes: 3 };

describe("HarmonyPanel in the dock", () => {
  it("shows the scope, Infer and a picker per hue", () => {
    const tree = mount(fakeApi(deriveAll(DEFAULT_PARAMS)));
    expect(ofType(tree, HarmonyScope)).toHaveLength(1);
    expect(buttons(tree, "Infer")).toHaveLength(1);
    expect(buttons(tree, "Pick")).toHaveLength(1);
    expect(buttons(mount(fakeApi(deriveAll(CUSTOM_THREE))), "Pick")).toHaveLength(3);
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

  it("leaves out the scope, Infer and the pickers, for a rule and for custom nodes", () => {
    for (const p of [DEFAULT_PARAMS, CUSTOM_THREE]) {
      const rig = fakeApi();
      rig.inMask(deriveAll(p));
      const tree = mount(rig);
      expect(ofType(tree, HarmonyScope)).toEqual([]);
      expect(buttons(tree, "Infer")).toEqual([]);
      expect(buttons(tree, "Pick")).toEqual([]);
    }
    // The custom node rows themselves stay.
    const rig = fakeApi();
    rig.inMask(deriveAll(CUSTOM_THREE));
    expect(ofType(mount(rig), UI.Slider).map((e) => e.props.label)).toEqual(expect.arrayContaining(["Hue 1", "Hue 2", "Hue 3"]));
  });

  it("arms no canvas tool and writes nothing to the photo, whatever it is given", () => {
    const rig = fakeApi();
    rig.inMask(deriveAll(CUSTOM_THREE));
    const tree = mount(rig);
    for (const b of ofType(tree, UI.Button)) (b.props.onClick as (() => void) | undefined)?.();
    for (const s of ofType(tree, UI.Slider).map(sliderProps)) {
      s.onChange(s.max ?? 1);
      s.onCommit?.();
    }
    for (const s of ofType(tree, UI.Select)) (s.props as unknown as SelectProps).onChange("6");
    expect(store().getState().picking).toBeNull();
    expect(rig.registered.patches).toEqual([]);
    expect(rig.develop.getState().paramBag).toEqual({});
  });
});
