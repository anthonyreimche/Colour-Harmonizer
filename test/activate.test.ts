// Activation contract against a stand-in API: what activate() registers under
// the extension id, that a bag with stale GPU values is re-derived live, and
// that deactivate() tears everything down. The panel itself is walked in
// panel.test.ts.

import { afterEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../src/index";
import { DEFAULT_PARAMS } from "../src/harmony";
import { HarmonyPanel } from "../src/Panel";
import { HARMONIZE_ID, HARMONIZE_UNIFORMS, KEY, SMOOTH_ID, SMOOTH_UNIFORMS, deriveAll } from "../src/params";
import { store } from "../src/store";
import { fakeApi } from "./support/fake-api";

describe("activate", () => {
  afterEach(() => deactivate());

  it("registers both stages, the panel, the picker slot and the scope settings", () => {
    const { api, registered } = fakeApi();
    activate(api);
    expect(registered.stages.map((s) => s.id)).toEqual([HARMONIZE_ID, SMOOTH_ID]);
    expect(registered.panels.map((p) => p.id)).toEqual(["colour-harmony.panel"]);
    expect(registered.panels[0].title).toBe("Colour Harmony");
    expect(registered.panels[0].defaultDock).toMatchObject({ module: "develop", direction: "right" });
    expect(typeof registered.panels[0].onReset).toBe("function");
    expect(registered.slots).toMatchObject([{ id: "colour-harmony.picker", slot: "develop-canvas-overlay" }]);
    expect(registered.settings.length).toBe(1);
    expect(registered.settings[0].fields.map((f) => f.key).sort()).toEqual(["dim", "guideWidth", "scale"]);
  });

  it("offers the panel in masks, owning every key it writes for both stages", () => {
    const { api, registered } = fakeApi();
    activate(api);
    const mask = registered.panels[0].mask;
    expect(mask?.component).toBe(HarmonyPanel);
    // Smoothing on, so the smoothing stage's keys carry values too.
    const written = Object.keys(deriveAll({ ...DEFAULT_PARAMS, pullStrength: 0.5, smoothing: 1 }));
    expect(written.length).toBe(HARMONIZE_UNIFORMS.length + SMOOTH_UNIFORMS.length);
    expect([...(mask?.owns ?? [])].sort()).toEqual(written.sort());
  });

  it("resets the photo's harmony to darktable's defaults from the dock header", () => {
    const { api, registered, develop } = fakeApi();
    const commits: string[] = [];
    develop.setState({ commitEdit: async (label: string) => void commits.push(label) });
    activate(api);
    develop.setState({ paramBag: deriveAll({ ...DEFAULT_PARAMS, pullStrength: 0.7 }) });
    registered.panels[0].onReset?.();
    expect(develop.getState().paramBag[KEY.pullStrength]).toBe(0);
    expect(commits.length).toBe(1);
  });

  it("re-derives the GPU values when a loaded bag's nodes disagree with its rule keys", () => {
    const { api, registered, develop } = fakeApi();
    activate(api);
    const stale = { ...deriveAll(DEFAULT_PARAMS), [KEY.anchorHue]: 0.6 };
    develop.setState({ paramBag: stale });
    expect(registered.patches.length).toBe(1);
    expect(registered.patches[0]).toEqual(deriveAll({ ...DEFAULT_PARAMS, anchorHue: 0.6 }));
    develop.setState({ paramBag: deriveAll({ ...DEFAULT_PARAMS, anchorHue: 0.6 }) });
    expect(registered.patches.length).toBe(1);
  });

  it("clears the picker, drops the stages and the slot, and stops listening on deactivate", () => {
    const { api, registered, develop } = fakeApi();
    activate(api);
    store().getState().setPicking("anchor");
    deactivate();
    expect(store().getState().picking).toBeNull();
    expect(registered.unregisteredStages).toEqual([HARMONIZE_ID, SMOOTH_ID]);
    expect(registered.unregisteredSlots).toEqual(["colour-harmony.picker"]);
    develop.setState({ paramBag: { ...deriveAll(DEFAULT_PARAMS), [KEY.anchorHue]: 0.6 } });
    expect(registered.patches.length).toBe(0);
  });
});
