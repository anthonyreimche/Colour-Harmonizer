// The RYB vectorscope's model, after darktable's vectorscope.c: where a colour
// lands on the plot, the logarithmic radius, the harmony guide sectors with
// their overlap clamp, the wheel's rotation steps, the ring's colours and the
// density mapping. Pure functions; ScopeView.ts draws them.

import { RULES } from "./harmony";
import { rgbHueToRybHueSpline, rybHueToRgbHueSpline } from "./ryb";
import { hsvToRgb, linearToSrgb, rgbToHcv, type Vec3 } from "./ucs";

export type ScopeScale = "log" | "linear";
export type GuideWidth = "normal" | "large" | "narrow" | "line";

export const LOG_BASE = 30;

/** darktable's sector half-widths, in turns. */
export const GUIDE_WIDTHS: Readonly<Record<GuideWidth, number>> = {
  normal: 0.5 / 12,
  large: 0.75 / 12,
  narrow: 0.25 / 12,
  line: 0,
};

/** The radius custom nodes are drawn at. */
export const CUSTOM_SECTOR_RADIUS = 0.8;
/** darktable's density gain. */
export const DENSITY_GAIN = 1 / 30;
/** Dim applied to the graph outside the guide sectors (darktable's default). */
export const DEFAULT_DIM = 0.7;

export function baseLog(x: number, bound: number): number {
  return (Math.log1p(((LOG_BASE - 1) * x) / bound) / Math.log(LOG_BASE)) * bound;
}

/** A scene-linear colour in plot polar form: RYB hue turn and chroma
 *  (max − min). Neutrals read as [0, 0]. */
export function scopePolar(rgb: Vec3): [number, number] {
  const [h, C] = rgbToHcv(rgb);
  if (C <= 0) return [0, 0];
  return [rgbHueToRybHueSpline(h), C];
}

/** Polar → plot position at the chosen scale, y up. */
export function polarToPoint(hueTurn: number, chroma: number, scale: ScopeScale): [number, number] {
  if (chroma <= 0) return [0, 0];
  const angle = hueTurn * 2 * Math.PI;
  const r = scale === "log" ? baseLog(chroma, 1) : chroma;
  return [Math.cos(angle) * r, Math.sin(angle) * r];
}

/** A scene-linear colour's plot position: RYB hue as the angle, chroma
 *  (max − min) as the radius, y up. Neutrals sit at the origin. */
export function scopePoint(rgb: Vec3, scale: ScopeScale): [number, number] {
  const [hue, chroma] = scopePolar(rgb);
  return polarToPoint(hue, chroma, scale);
}

export interface Sector {
  /** Start and end angles in turns (unwrapped; a1 > a0). */
  a0: number;
  a1: number;
  /** 0..1 of the plot radius, linear scale. */
  radius: number;
}

/** The sectors of a rule's guide: each spans up to `halfWidth` either side of
 *  its centre, clamped to half the gap to its table neighbours so they never
 *  overlap, then rotated by the anchor. */
export function guideSectors(
  offsets: readonly number[],
  lengths: readonly number[],
  halfWidth: number,
  rotationTurn: number,
): Sector[] {
  const n = offsets.length;
  const out: Sector[] = [];
  for (let i = 0; i < n; i++) {
    const before = i > 0 ? Math.min(halfWidth, (offsets[i] - offsets[i - 1]) / 2) : halfWidth;
    const after = i < n - 1 ? Math.min(halfWidth, (offsets[i + 1] - offsets[i]) / 2) : halfWidth;
    out.push({ a0: offsets[i] - before + rotationTurn, a1: offsets[i] + after + rotationTurn, radius: lengths[i] });
  }
  return out;
}

/** Custom nodes: fixed-width sectors at absolute angles, the anchor radius. */
export function customSectors(anglesTurn: readonly number[], halfWidth: number): Sector[] {
  return anglesTurn.map((a) => ({ a0: a - halfWidth, a1: a + halfWidth, radius: CUSTOM_SECTOR_RADIUS }));
}

export function ruleSectors(rule: number, rotationDeg: number, halfWidth: number): Sector[] {
  const r = RULES[rule];
  if (!r) return [];
  return guideSectors(r.sectors, r.lengths, halfWidth, rotationDeg / 360);
}

export type WheelKind = "coarse" | "fine";

/** darktable's wheel: a plain notch snaps to the next 15° multiple, Ctrl
 *  steps a degree; both wrap to 0..359. */
export function wheelStep(kind: WheelKind, rotation: number, delta: number): number {
  const r = kind === "coarse" ? Math.floor((rotation + 7) / 15) * 15 + 15 * delta : rotation + delta;
  return ((r % 360) + 360) % 360;
}

export function cycle(n: number, current: number, delta: number): number {
  return (((current + delta) % n) + n) % n;
}

/** `n` display colours around the RYB ring, starting at red. */
export function hueRingColors(n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) out.push(hsvToRgb(rybHueToRgbHueSpline(i / n), 1, 1));
  return out;
}

/** Count → intensity factor: darktable's gain over the plot's pixel count. */
export function densityScale(diameterPx: number, samples: number): number {
  return (DENSITY_GAIN * diameterPx * diameterPx) / Math.max(1, samples);
}

/** Bin count → 0..1 intensity, display-encoded like darktable's LUT. */
export function densityIntensity(count: number, scale: number): number {
  const v = scale * count;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return linearToSrgb(v);
}
