// Activation contract against a stand-in API: what activate() registers under
// the extension id, that a bag with stale GPU values is re-derived live, and
// that deactivate() tears everything down. No React render — the components
// are exercised in the app.

import { afterEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../src/index";
import { DEFAULT_PARAMS } from "../src/harmony";
import { HARMONIZE_ID, KEY, SMOOTH_ID, deriveAll } from "../src/params";
import { store } from "../src/store";
import type {
  DevelopStoreState,
  PanelContribution,
  ProcessingStageContribution,
  SafelightAPI,
  SettingsContribution,
  SlotContribution,
  StateCreator,
  StoreApi,
} from "../src/safelight";

function fakeStore<T extends object>(init: StateCreator<T> | T): StoreApi<T> {
  let state: T;
  const listeners = new Set<(s: T, prev: T) => void>();
  const set = (partial: Partial<T> | ((s: T) => Partial<T>)) => {
    const prev = state;
    state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
    for (const l of listeners) l(state, prev);
  };
  const get = () => state;
  state = typeof init === "function" ? (init as StateCreator<T>)(set, get) : init;
  const hook = ((selector?: (s: T) => unknown) => (selector ? selector(state) : state)) as StoreApi<T>;
  hook.getState = get;
  hook.setState = set;
  hook.subscribe = (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return hook;
}

interface Registered {
  stages: ProcessingStageContribution[];
  panels: PanelContribution[];
  slots: SlotContribution[];
  settings: SettingsContribution[];
  unregisteredStages: string[];
  unregisteredSlots: string[];
  patches: Record<string, unknown>[];
}

function fakeApi() {
  const registered: Registered = {
    stages: [],
    panels: [],
    slots: [],
    settings: [],
    unregisteredStages: [],
    unregisteredSlots: [],
    patches: [],
  };
  const develop = fakeStore<DevelopStoreState>({
    photoId: null,
    paramBag: {},
    histogram: null,
    previewParams: null,
    setDynParams: (patch) => {
      registered.patches.push(patch);
      develop.setState((s) => ({ paramBag: { ...s.paramBag, ...patch } }));
    },
  } as Partial<DevelopStoreState> as DevelopStoreState);
  const values = new Map<string, unknown>();
  const api = {
    version: 1,
    extensionId: "colour-harmony",
    registerProcessingStage: (c: ProcessingStageContribution) => void registered.stages.push(c),
    unregisterProcessingStage: (id: string) => void registered.unregisteredStages.push(id),
    registerPanel: (c: PanelContribution) => void registered.panels.push(c),
    registerSlot: (c: SlotContribution) => void registered.slots.push(c),
    unregisterSlot: (id: string) => void registered.unregisteredSlots.push(id),
    registerSettings: (c: SettingsContribution) => void registered.settings.push(c),
    settings: {
      get: <T,>(key: string, fallback: T) => (values.has(key) ? (values.get(key) as T) : fallback),
      set: (key: string, value: unknown) => void values.set(key, value),
      onChange: () => () => undefined,
    },
    stores: { create: fakeStore, useDevelopStore: develop },
  } as unknown as SafelightAPI;
  return { api, registered, develop };
}

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
