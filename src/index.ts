// Colour Harmony — Safelight extension (GPL-3.0-or-later).
//
// A port of darktable's color harmonizer: hues pulled toward a harmony palette
// in darktable UCS, with darktable's RYB vectorscope and harmony guides drawn
// in the panel from the live render. Registers two scene-linear GPU stages
// (stage.ts), the Develop panel (Panel.ts), the on-image hue picker overlay
// (Picker.ts) and the scope's display settings.

import { HarmonyPanel } from "./Panel";
import { PickerOverlay } from "./Picker";
import { EXT_ID, rederivePatch, resetPatch } from "./params";
import { api, initRuntime } from "./runtime";
import type { DevelopStoreState, SafelightAPI } from "./safelight";
import { DEFAULT_DIM } from "./scope";
import { GUIDE_WIDTH_ORDER, SETTING } from "./ScopeView";
import { allStages } from "./stage";
import { initStore, store } from "./store";

const PANEL_ID = `${EXT_ID}.panel`;
const PICKER_ID = `${EXT_ID}.picker`;

let unsubscribe: (() => void) | null = null;

function reset(): void {
  const dev = api().stores.useDevelopStore.getState();
  dev.setDynParams(resetPatch());
  void dev.commitEdit("Colour Harmony reset");
}

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  initStore();

  // At the defaults neither stage's block is entered and the smoothing
  // stage's keys are all zero, so an untouched photo renders unchanged.
  for (const stage of allStages()) host.registerProcessingStage(stage);

  host.registerPanel({
    id: PANEL_ID,
    title: "Colour Harmony",
    component: HarmonyPanel,
    defaultDock: { module: "develop", direction: "right", order: 7, width: 268 },
    onReset: reset,
  });

  host.registerSlot({
    id: PICKER_ID,
    slot: "develop-canvas-overlay",
    component: PickerOverlay,
    order: 60,
  });

  host.registerSettings({
    title: "Colour Harmony",
    keywords: ["vectorscope", "harmony", "guides"],
    fields: [
      {
        key: SETTING.scale,
        label: "Vectorscope scale",
        type: "select",
        default: "log",
        options: [
          { value: "log", label: "Logarithmic" },
          { value: "linear", label: "Linear" },
        ],
      },
      {
        key: SETTING.guideWidth,
        label: "Guide width",
        hint: "Shift+scroll on the scope cycles this too.",
        type: "select",
        default: "normal",
        options: GUIDE_WIDTH_ORDER.map((w) => ({ value: w, label: w[0].toUpperCase() + w.slice(1) })),
      },
      {
        key: SETTING.dim,
        label: "Dim outside guides",
        hint: "How much of the plot shows outside the harmony sectors (darktable: 0.7).",
        type: "number",
        default: DEFAULT_DIM,
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  });

  // A bag whose GPU values disagree with its rule keys (a preset that carried
  // only some fields, an edit from another release) is re-derived live; the
  // edit itself is rewritten by the next commit, as any other change would be.
  unsubscribe = host.stores.useDevelopStore.subscribe((state: DevelopStoreState, prev: DevelopStoreState) => {
    if (state.paramBag === prev.paramBag) return;
    const patch = rederivePatch(state.paramBag);
    if (patch) state.setDynParams(patch);
  });
}

export function deactivate(): void {
  unsubscribe?.();
  unsubscribe = null;
  // The host sweeps this extension's registrations on disable or uninstall;
  // dropping them explicitly keeps a re-enable clean.
  try {
    store().getState().setPicking(null);
    const host = api();
    for (const stage of allStages()) host.unregisterProcessingStage(stage.id);
    host.unregisterSlot(PICKER_ID);
  } catch {
    /* activate() never ran — nothing to tear down */
  }
}
