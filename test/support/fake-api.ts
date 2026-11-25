// A stand-in for the slice of the Safelight API the extension touches: stores
// that behave like the host's zustand ones, the registrations activate()
// makes, and the param scope a panel edits — the photo's bag, or a mask's once
// inMask() is called, as inside the Masking panel's Adjust tab. createElement
// builds plain element records and the UI kit's components are bare markers,
// so a component that holds no React hooks of its own can be called as a
// function and its element tree walked.

import type {
  DevelopStoreState,
  PanelContribution,
  ParamScope,
  ProcessingStageContribution,
  SafelightAPI,
  SettingsContribution,
  SlotContribution,
  StateCreator,
  StoreApi,
} from "../../src/safelight";

export function fakeStore<T extends object>(init: StateCreator<T> | T): StoreApi<T> {
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

/** What the stand-in createElement returns. */
export interface FakeElement {
  type: unknown;
  props: Record<string, unknown>;
  children: unknown[];
}

/** The host's components, as markers an element's type is matched against. */
export const UI = {
  Slider: function Slider() {
    return null;
  },
  Panel: function Panel() {
    return null;
  },
  ColourField: function ColourField() {
    return null;
  },
  Button: function Button() {
    return null;
  },
  Select: function Select() {
    return null;
  },
  Row: function Row() {
    return null;
  },
  Stack: function Stack() {
    return null;
  },
};

export interface Registered {
  stages: ProcessingStageContribution[];
  panels: PanelContribution[];
  slots: SlotContribution[];
  settings: SettingsContribution[];
  unregisteredStages: string[];
  unregisteredSlots: string[];
  /** Every setDynParams patch, i.e. every write to the photo's bag. */
  patches: Record<string, unknown>[];
}

export interface MaskState {
  bag: Record<string, unknown>;
}

export interface Rig {
  api: SafelightAPI;
  registered: Registered;
  develop: StoreApi<DevelopStoreState>;
  /** Commit labels in order; a mask's are prefixed "mask: ". */
  commits: string[];
  /** Puts what renders from here on inside a mask holding `bag`, as the core's
   *  Masking panel does; returns the mask's store. */
  inMask(bag?: Record<string, unknown>): StoreApi<MaskState>;
}

export function fakeApi(bag: Record<string, unknown> = {}): Rig {
  const registered: Registered = {
    stages: [],
    panels: [],
    slots: [],
    settings: [],
    unregisteredStages: [],
    unregisteredSlots: [],
    patches: [],
  };
  const commits: string[] = [];
  const develop = fakeStore<DevelopStoreState>({
    photoId: null,
    paramBag: bag,
    histogram: null,
    previewParams: null,
    setDynParams: (patch) => {
      registered.patches.push(patch);
      develop.setState((s) => ({ paramBag: { ...s.paramBag, ...patch } }));
    },
    commitEdit: async (label: string) => void commits.push(label),
  } as Partial<DevelopStoreState> as DevelopStoreState);

  const photoScope: ParamScope = {
    maskId: null,
    getParam: (key) => develop.getState().paramBag[key],
    getParams: () => develop.getState().paramBag,
    setParams: (patch) => develop.getState().setDynParams(patch),
    commit: (label) => void develop.getState().commitEdit(label),
  };
  let mask: StoreApi<MaskState> | null = null;
  const maskScope = (m: StoreApi<MaskState>): ParamScope => ({
    maskId: "mask-1",
    getParam: (key) => m.getState().bag[key],
    getParams: () => m.getState().bag,
    setParams: (patch) => m.setState((s) => ({ bag: { ...s.bag, ...patch } })),
    commit: (label) => void commits.push(`mask: ${label}`),
  });

  const values = new Map<string, unknown>();
  const api = {
    version: 1,
    extensionId: "colour-harmony",
    react: {
      createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): FakeElement => ({
        type,
        props: props ?? {},
        children,
      }),
      useEffect: (effect: () => void) => void effect(),
      useState: <T,>(init: T) => [init, () => undefined],
      useRef: <T,>(current: T) => ({ current }),
    },
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
    components: { Slider: UI.Slider, Panel: UI.Panel },
    ui: { Button: UI.Button, Select: UI.Select, Row: UI.Row, Stack: UI.Stack, ColourField: UI.ColourField, tokens: { border: "#444", surface0: "surface-token", textMuted: "muted-token" } },
    stores: { create: fakeStore, useDevelopStore: develop },
    develop: {
      useParamScope: () => (mask ? maskScope(mask) : photoScope),
    },
  } as unknown as SafelightAPI;

  const inMask = (maskBag: Record<string, unknown> = {}) => {
    mask = fakeStore<MaskState>({ bag: maskBag });
    return mask;
  };
  return { api, registered, develop, commits, inMask };
}
