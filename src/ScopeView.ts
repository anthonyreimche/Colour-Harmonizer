// The RYB vectorscope with darktable's colour harmony guides, drawn from the
// live sample (capture.ts) on a square canvas at the top of the panel. Its
// wheel is darktable's vectorscope wheel: a notch rotates the harmony 15° on
// the RYB wheel (snapped), Ctrl a degree, Shift cycles the guide width, Alt
// cycles the rule; custom nodes rotate as a group. Changes go to the bag live
// and commit after a short pause, one gesture one undo entry.
//
// The plot sits on the panel's themed surface (var(--color-surface-0)); canvas
// strokes cannot reference CSS variables, so the ink is derived from the
// resolved surface and flips brightness against it. The density is coloured by
// the RYB ring (darktable masks its hue mesh with the graph and lifts it
// toward white); outside the guide sectors it is dimmed by the `dim` setting.

import type { CSSProperties } from "react";
import { startLiveSampler } from "./capture";
import {
  CUSTOM_RULE,
  RULES,
  rotationOf,
  rybToUcs,
  switchRule,
  ucsToRyb,
  wrapHue,
  type HarmonyParams,
} from "./harmony";
import { deriveAll, readParams } from "./params";
import { api, h } from "./runtime";
import {
  DEFAULT_DIM,
  GUIDE_WIDTHS,
  baseLog,
  customSectors,
  cycle,
  densityIntensity,
  densityScale,
  hueRingColors,
  polarToPoint,
  ruleSectors,
  wheelStep,
  type GuideWidth,
  type ScopeScale,
  type Sector,
} from "./scope";
import { store, type ScopeSample } from "./store";

export const SETTING = { scale: "scale", guideWidth: "guideWidth", dim: "dim" } as const;
export const GUIDE_WIDTH_ORDER: readonly GuideWidth[] = ["normal", "large", "narrow", "line"];

const COMMIT_DELAY_MS = 300;
const RING_STOPS = 48;
const RING_WIDTH_PX = 3;
const PLOT_MARGIN_PX = 8;
const VERTEX_RADIUS_PX = 3;
const COLOUR_LUT_SIZE = 360;
/** darktable lifts the plotted hue mesh toward white (hard light, 55 %). */
const DENSITY_WHITE_LIFT = 0.45;
const HINT =
  "Scroll to rotate the harmony by 15° · Ctrl+scroll for 1° · Shift+scroll changes the guide width · Alt+scroll cycles the rule";

export interface ScopePrefs {
  scale: ScopeScale;
  guideWidth: GuideWidth;
  dim: number;
}

export function readPrefs(): ScopePrefs {
  const s = api().settings;
  const scale = s.get<string>(SETTING.scale, "log");
  const width = s.get<string>(SETTING.guideWidth, "normal");
  const dim = s.get<number>(SETTING.dim, DEFAULT_DIM);
  return {
    scale: scale === "linear" ? "linear" : "log",
    guideWidth: (GUIDE_WIDTH_ORDER as readonly string[]).includes(width) ? (width as GuideWidth) : "normal",
    dim: typeof dim === "number" && Number.isFinite(dim) ? Math.min(1, Math.max(0, dim)) : DEFAULT_DIM,
  };
}

const css = (rgb: readonly number[], alpha = 1) =>
  `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${alpha})`;

const RING = hueRingColors(RING_STOPS);
const COLOUR_LUT = hueRingColors(COLOUR_LUT_SIZE);

/** Ink that reads against the resolved surface behind the canvas. */
function inkFor(canvas: HTMLCanvasElement): { ink: string; faint: string } {
  const m = getComputedStyle(canvas).backgroundColor.match(/\d+(?:\.\d+)?/g);
  const dark = m ? (Number(m[0]) + Number(m[1]) + Number(m[2])) / (3 * 255) < 0.5 : true;
  return dark
    ? { ink: "rgba(235, 235, 235, 0.9)", faint: "rgba(235, 235, 235, 0.35)" }
    : { ink: "rgba(25, 25, 25, 0.85)", faint: "rgba(25, 25, 25, 0.35)" };
}

interface DensityLayer {
  canvas: HTMLCanvasElement;
  key: string;
}

/** The plotted density as an RGBA layer at device resolution, coloured by
 *  the ring hue and lifted toward white with intensity. */
function buildDensity(sample: ScopeSample, scale: ScopeScale, sizePx: number, plotRadiusPx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const bins = new Uint32Array(sizePx * sizePx);
  const c = sizePx / 2;
  for (let i = 0; i < sample.count; i++) {
    const [x, y] = polarToPoint(sample.points[i * 2], sample.points[i * 2 + 1], scale);
    const ix = Math.round(c + x * plotRadiusPx);
    const iy = Math.round(c - y * plotRadiusPx);
    if (ix >= 0 && ix < sizePx && iy >= 0 && iy < sizePx) bins[iy * sizePx + ix]++;
  }
  const gain = densityScale(2 * plotRadiusPx, sample.count);
  const image = ctx.createImageData(sizePx, sizePx);
  const px = image.data;
  for (let iy = 0; iy < sizePx; iy++) {
    for (let ix = 0; ix < sizePx; ix++) {
      const count = bins[iy * sizePx + ix];
      if (count === 0) continue;
      const v = densityIntensity(count, gain);
      const turn = Math.atan2(c - iy, ix - c) / (2 * Math.PI);
      const colour = COLOUR_LUT[Math.floor(wrapHue(turn) * COLOUR_LUT_SIZE) % COLOUR_LUT_SIZE];
      const lift = DENSITY_WHITE_LIFT * v;
      const o = (iy * sizePx + ix) * 4;
      px[o] = Math.round(255 * (colour[0] * (1 - lift) + lift));
      px[o + 1] = Math.round(255 * (colour[1] * (1 - lift) + lift));
      px[o + 2] = Math.round(255 * (colour[2] * (1 - lift) + lift));
      px[o + 3] = Math.round(255 * v);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function sectorsOf(p: HarmonyParams, halfWidth: number): Sector[] {
  if (p.rule === CUSTOM_RULE) {
    return customSectors(p.customHues.slice(0, p.customNodes).map(ucsToRyb), halfWidth);
  }
  return ruleSectors(p.rule, rotationOf(p), halfWidth);
}

function sectorPath(ctx: CanvasRenderingContext2D, sectors: Sector[], cx: number, cy: number, R: number, scale: ScopeScale): void {
  ctx.beginPath();
  for (const s of sectors) {
    const r = R * (scale === "log" ? baseLog(s.radius, 1) : s.radius);
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -s.a0 * 2 * Math.PI, -s.a1 * 2 * Math.PI, true);
    ctx.closePath();
  }
}

/** The wheel's effect on the params (darktable's _vec_eventbox_scroll). */
export function wheelParams(p: HarmonyParams, delta: number, ctrl: boolean, alt: boolean, altDelta: number): HarmonyParams {
  if (alt) return switchRule(p, cycle(RULES.length, p.rule, altDelta));
  if (p.rule === CUSTOM_RULE) {
    const step = ctrl ? 1 / 360 : 15 / 360;
    return {
      ...p,
      customHues: p.customHues.map((hue, i) => (i < p.customNodes ? rybToUcs(wrapHue(ucsToRyb(hue) + delta * step)) : hue)),
    };
  }
  const rotation = wheelStep(ctrl ? "fine" : "coarse", rotationOf(p), delta);
  return { ...p, anchorHue: rybToUcs(rotation / 360) };
}

export function HarmonyScope() {
  const { useEffect, useRef, useState } = api().react;
  const dev = api().stores.useDevelopStore;
  const sample = store()((s) => s.sample);
  const paramBag = dev((s) => s.paramBag);
  const [size, setSize] = useState(240);
  const [prefsEpoch, setPrefsEpoch] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const densityRef = useRef<DensityLayer | null>(null);
  const commitTimer = useRef<number | null>(null);

  useEffect(() => startLiveSampler(), []);
  useEffect(() => api().settings.onChange(() => setPrefsEpoch((e: number) => e + 1)), []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setSize(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const commitSoon = () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      void dev.getState().commitEdit("Colour Harmony");
    }, COMMIT_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (commitTimer.current === null) return;
      window.clearTimeout(commitTimer.current);
      void dev.getState().commitEdit("Colour Harmony");
    },
    [],
  );

  // Attached natively (non-passive) so the dock does not scroll; React's
  // onWheel is passive and cannot preventDefault.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dominant = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : e.deltaY;
      const delta = dominant > 0 ? 1 : dominant < 0 ? -1 : 0;
      if (delta === 0) return;
      if (e.shiftKey) {
        const prefs = readPrefs();
        const next = GUIDE_WIDTH_ORDER[cycle(GUIDE_WIDTH_ORDER.length, GUIDE_WIDTH_ORDER.indexOf(prefs.guideWidth), delta)];
        api().settings.set(SETTING.guideWidth, next);
        setPrefsEpoch((v: number) => v + 1);
        return;
      }
      const selection = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const altDelta = selection > 0 ? 1 : -1;
      const state = dev.getState();
      if (!state.photoId) return;
      state.setDynParams(deriveAll(wheelParams(readParams(state.paramBag), delta, e.ctrlKey, e.altKey, altDelta)));
      commitSoon();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = size;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(W * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, W);

    const prefs = readPrefs();
    const p = readParams(paramBag);
    const { ink, faint } = inkFor(canvas);
    const cx = W / 2;
    const cy = W / 2;
    const R = W / 2 - PLOT_MARGIN_PX;
    if (R <= 4) return;

    // Hue ring and the six RYB vertices. Canvas conic angles run clockwise
    // from +x while the plot's run anticlockwise, hence the mirrored stops.
    const ring = ctx.createConicGradient(0, cx, cy);
    for (let i = 0; i <= RING_STOPS; i++) {
      ring.addColorStop(i / RING_STOPS, css(RING[(RING_STOPS - (i % RING_STOPS)) % RING_STOPS], 0.85));
    }
    ctx.lineWidth = RING_WIDTH_PX;
    ctx.strokeStyle = ring;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx + R * Math.cos(a), cy - R * Math.sin(a), VERTEX_RADIUS_PX, 0, 2 * Math.PI);
      ctx.fillStyle = css(RING[(k * RING_STOPS) / 6]);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = faint;
      ctx.stroke();
    }

    // Density, dimmed outside the guide sectors.
    const halfWidth = GUIDE_WIDTHS[prefs.guideWidth];
    const sectors = sectorsOf(p, halfWidth);
    if (sample) {
      const sizePx = Math.round(W * dpr);
      const key = `${sample.count}|${sample.width}x${sample.height}|${prefs.scale}|${sizePx}`;
      if (!densityRef.current || densityRef.current.key !== key) {
        densityRef.current = { canvas: buildDensity(sample, prefs.scale, sizePx, R * dpr), key };
      }
      const layer = densityRef.current.canvas;
      const dimmed = halfWidth > 0 && sectors.length > 0;
      ctx.save();
      ctx.globalAlpha = dimmed ? prefs.dim : 1;
      ctx.drawImage(layer, 0, 0, W, W);
      ctx.restore();
      if (dimmed) {
        ctx.save();
        sectorPath(ctx, sectors, cx, cy, R, prefs.scale);
        ctx.clip();
        ctx.drawImage(layer, 0, 0, W, W);
        ctx.restore();
      }
    } else {
      densityRef.current = null;
    }

    // Guides.
    if (sectors.length > 0) {
      sectorPath(ctx, sectors, cx, cy, R, prefs.scale);
      ctx.lineWidth = 1;
      ctx.strokeStyle = ink;
      ctx.stroke();
      ctx.font = "11px var(--font-mono), monospace";
      ctx.fillStyle = ink;
      ctx.textBaseline = "bottom";
      const label = RULES[p.rule]?.label ?? "";
      ctx.fillText(p.rule === CUSTOM_RULE ? label : `${rotationOf(p)}°  ${label}`, 6, W - 5);
    }
  }, [sample, paramBag, size, prefsEpoch]);

  const style: CSSProperties = {
    width: size,
    height: size,
    display: "block",
    borderRadius: 4,
    background: "var(--color-surface-0)",
    touchAction: "none",
  };
  return h(
    "div",
    { ref: wrapRef, style: { width: "100%" } },
    h("canvas", { ref: canvasRef, style, title: HINT }),
  );
}
