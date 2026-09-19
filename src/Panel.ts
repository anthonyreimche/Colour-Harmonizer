// The Develop panel: darktable's color harmonizer controls in its order —
// the scope on top, then rule + Infer, anchor hue (or the custom node rows),
// the node swatches, pull strength / width, neutral protection, smoothing,
// and a collapsed Saturation section with one slider per node. Sliders write
// the bag live through deriveAll and commit on release; the select and the
// buttons commit at once. Generic controls come from api.ui; text stays
// selectable.

import type { CSSProperties } from "react";
import {
  CUSTOM_RULE,
  DEFAULT_PARAMS,
  MAX_NODES,
  RULES,
  findMaxChroma,
  harmonyNodes,
  hueToSrgb,
  inferHarmony,
  rybToUcs,
  swatchColor,
  switchRule,
  ucsToRyb,
  type HarmonyParams,
} from "./harmony";
import { deriveAll, readParams } from "./params";
import { api, h } from "./runtime";
import { HarmonyScope } from "./ScopeView";
import { store, type PickTarget } from "./store";

const HUE_STOPS = 24;
const SAT_STOPS = 8;
/** darktable's swatch chroma, 85 % of the gamut edge. */
const SWATCH_FRACTION = 0.85;

const css = (rgb: readonly number[]) =>
  `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;

let hueTrack: string | null = null;
/** The anchor and custom hue sliders' track: the RYB wheel in degrees. */
function hueTrackCss(): string {
  if (hueTrack) return hueTrack;
  const stops: string[] = [];
  for (let i = 0; i <= HUE_STOPS; i++) {
    const t = i / HUE_STOPS;
    stops.push(`${css(hueToSrgb(rybToUcs(t)))} ${(t * 100).toFixed(2)}%`);
  }
  hueTrack = `linear-gradient(to right, ${stops.join(", ")})`;
  return hueTrack;
}

const satTracks = new Map<number, string>();
/** A saturation slider's track (darktable's _paint_sat_slider): grey to the
 *  swatch chroma over the first half, on to the gamut edge over the second. */
function satTrackCss(hue: number): string {
  const key = Math.round(hue * 1000);
  const cached = satTracks.get(key);
  if (cached) return cached;
  const edge = findMaxChroma(hue);
  const swatch = edge * SWATCH_FRACTION;
  const stops: string[] = [];
  for (let i = 0; i <= SAT_STOPS; i++) {
    const s = i / SAT_STOPS;
    const chroma = s <= 0.5 ? s * 2 * swatch : swatch + (s - 0.5) * 2 * (edge - swatch);
    stops.push(`${css(swatchColor(hue, chroma))} ${(s * 100).toFixed(2)}%`);
  }
  const track = `linear-gradient(to right, ${stops.join(", ")})`;
  satTracks.set(key, track);
  return track;
}

const DEFAULT_ANCHOR_DEG = ucsToRyb(DEFAULT_PARAMS.anchorHue) * 360;

const HINT: CSSProperties = { fontSize: "10px", color: "var(--color-text-muted)", lineHeight: 1.4 };

export function HarmonyPanel() {
  const { Slider, Panel } = api().components;
  const { Button, Select, Row, Stack, tokens } = api().ui;
  const dev = api().stores.useDevelopStore;
  const paramBag = dev((s) => s.paramBag);
  const sample = store()((s) => s.sample);
  const picking = store()((s) => s.picking);

  const p = readParams(paramBag);
  const isCustom = p.rule === CUSTOM_RULE;
  const harmony = harmonyNodes(p);
  // Slider drags outrun React's renders, so each change starts from the
  // store's current bag rather than this render's snapshot.
  const live = (): HarmonyParams => readParams(dev.getState().paramBag);
  const apply = (next: HarmonyParams) => dev.getState().setDynParams(deriveAll(next));
  const commit = (what: string) => void dev.getState().commitEdit(`Colour Harmony ${what}`);

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    defaultValue: number,
    update: (current: HarmonyParams, v: number) => HarmonyParams,
    trackBackground?: string,
  ) =>
    h(Slider, {
      key: label,
      label,
      value,
      min,
      max,
      step,
      defaultValue,
      trackBackground,
      onChange: (v: number) => apply(update(live(), v)),
      onCommit: () => commit(label.toLowerCase()),
    });

  const swatch = (hue: number, key: string) =>
    h("div", {
      key,
      style: {
        width: 22,
        height: 22,
        flex: "0 0 auto",
        borderRadius: 4,
        background: css(hueToSrgb(hue)),
        border: `1px solid ${tokens.border}`,
      },
    });

  const pickButton = (target: PickTarget) =>
    h(
      Button,
      {
        key: `pick-${String(target)}`,
        size: "sm",
        active: picking === target,
        title: "Pick the hue from the image (Esc cancels)",
        onClick: () => store().getState().setPicking(picking === target ? null : target),
      },
      "Pick",
    );

  const infer = () => {
    const s = store().getState().sample;
    if (!s) return;
    const r = inferHarmony(s.histogram);
    apply({ ...live(), rule: r.rule, anchorHue: r.anchor });
    commit("infer");
  };

  const ruleRow = h(
    Row,
    { key: "rule", gap: 6 },
    h(
      "div",
      { style: { flex: "1 1 auto", minWidth: 0 } },
      h(Select, {
        value: String(p.rule),
        ariaLabel: "Harmony rule",
        options: RULES.map((r) => ({ value: String(r.id), label: r.label })),
        onChange: (v: string) => {
          apply(switchRule(live(), Number(v)));
          commit("rule");
        },
      }),
    ),
    h(
      Button,
      {
        size: "sm",
        disabled: !sample,
        title:
          "Infer from the image: score every rule and anchor against the image's hue distribution and pick the palette it already covers best",
        onClick: infer,
      },
      "Infer",
    ),
  );

  const hueSlider = (label: string, hue: number, defaultDeg: number, update: (current: HarmonyParams, ucs: number) => HarmonyParams) =>
    slider(label, ucsToRyb(hue) * 360, 0, 360, 0.5, defaultDeg, (current, deg) => update(current, rybToUcs(deg / 360)), hueTrackCss());

  const anchorRow = isCustom
    ? null
    : h(
        Row,
        { key: "anchor", gap: 6, align: "flex-end" },
        h(
          "div",
          { style: { flex: "1 1 auto", minWidth: 0 } },
          hueSlider("Anchor hue", p.anchorHue, DEFAULT_ANCHOR_DEG, (current, ucs) => ({ ...current, anchorHue: ucs })),
        ),
        pickButton("anchor"),
      );

  const customRows = isCustom
    ? [
        slider("Nodes", p.customNodes, 2, MAX_NODES, 1, DEFAULT_PARAMS.customNodes, (current, v) => ({
          ...current,
          customNodes: Math.round(v),
        })),
        ...p.customHues.slice(0, p.customNodes).map((hue, i) =>
          h(
            Row,
            { key: `custom-${i}`, gap: 6, align: "flex-end" },
            swatch(hue, `swatch-${i}`),
            h(
              "div",
              { style: { flex: "1 1 auto", minWidth: 0 } },
              hueSlider(`Hue ${i + 1}`, hue, DEFAULT_PARAMS.customHues[i] * 360, (current, ucs) => ({
                ...current,
                customHues: current.customHues.map((v, k) => (k === i ? ucs : v)),
              })),
            ),
            pickButton(i as PickTarget),
          ),
        ),
      ]
    : null;

  const swatchRow = isCustom
    ? null
    : h(
        Row,
        { key: "swatches", gap: 6 },
        ...harmony.nodes.map((hue, i) => swatch(hue, `node-${i}`)),
        h("span", { style: { ...HINT, marginLeft: "auto" } }, `${harmony.count} node${harmony.count === 1 ? "" : "s"}`),
      );

  const effectSliders = [
    slider("Pull strength", p.pullStrength, 0, 1, 0.01, DEFAULT_PARAMS.pullStrength, (c, v) => ({ ...c, pullStrength: v })),
    slider("Pull width", p.pullWidth, 0.25, 4, 0.01, DEFAULT_PARAMS.pullWidth, (c, v) => ({ ...c, pullWidth: v })),
    slider("Neutral protection", p.neutralProtection, 0, 1, 0.01, DEFAULT_PARAMS.neutralProtection, (c, v) => ({
      ...c,
      neutralProtection: v,
    })),
    slider("Smoothing", p.smoothing, 0, 2, 0.01, DEFAULT_PARAMS.smoothing, (c, v) => ({ ...c, smoothing: v })),
  ];

  const saturation = h(
    Panel,
    { key: "saturation", title: "Saturation", defaultOpen: false },
    h(
      Stack,
      { gap: 1 },
      ...harmony.nodes.map((hue, i) =>
        slider(
          `Hue ${i + 1} saturation`,
          Math.round(p.nodeSat[i] * 100),
          0,
          200,
          1,
          100,
          (c, v) => ({ ...c, nodeSat: c.nodeSat.map((s, k) => (k === i ? v / 100 : s)) }),
          satTrackCss(hue),
        ),
      ),
    ),
  );

  return h(
    Stack,
    { gap: 6, style: { padding: "6px 8px 8px" } },
    h(HarmonyScope, { key: "scope" }),
    ruleRow,
    anchorRow,
    ...(customRows ?? []),
    swatchRow,
    h("div", { key: "effect", style: { display: "flex", flexDirection: "column", gap: "1px" } }, ...effectSliders),
    saturation,
  );
}
