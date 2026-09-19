// The RYB (paint) wheel as darktable's vectorscope draws it: RGB hue and RYB
// hue exchanged through natural cubic splines over Gossett's control points
// (src/libs/scopes/vectorscope.c, src/common/color_ryb.h). The harmonizer's
// own hue map (harmony.ts) is the piecewise-linear one darktable's module uses;
// the scope keeps the vectorscope's spline so its plot matches darktable's.

import { hsvHue, hsvToRgb, rgbToHcv, type Vec3 } from "./ucs";

/** Evenly spaced RGB-hue knots. */
export const RYB_X_KNOTS: readonly number[] = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1];
/** RYB hue at each knot (rgb → ryb). */
export const RYB_HUE_KNOTS: readonly number[] = [0, 1 / 3, 0.472217, 0.611105, 0.715271, 5 / 6, 1];
/** RGB hue at each knot (ryb → rgb), darktable's rgb_y_vtx. */
export const RGB_HUE_KNOTS: readonly number[] = [0, 0.083333, 0.166667, 0.383838, 0.586575, 0.833333, 1];

/** A natural cubic spline (zero second derivative at both ends) through
 *  (xs, ys), evaluated with the argument clamped to the knot range. */
export function naturalSpline(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  if (n < 2) return () => ys[0] ?? 0;
  const h = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) h[i] = xs[i + 1] - xs[i];
  const m = new Float64Array(n);
  if (n > 2) {
    const diag = new Float64Array(n - 2);
    const upper = new Float64Array(n - 2);
    const rhs = new Float64Array(n - 2);
    for (let i = 1; i < n - 1; i++) {
      diag[i - 1] = 2 * (h[i - 1] + h[i]);
      upper[i - 1] = h[i];
      rhs[i - 1] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
    }
    for (let i = 1; i < n - 2; i++) {
      const f = h[i] / diag[i - 1];
      diag[i] -= f * upper[i - 1];
      rhs[i] -= f * rhs[i - 1];
    }
    m[n - 2] = rhs[n - 3] / diag[n - 3];
    for (let i = n - 4; i >= 0; i--) m[i + 1] = (rhs[i] - upper[i] * m[i + 2]) / diag[i];
  }
  return (x: number) => {
    const xc = x < xs[0] ? xs[0] : x > xs[n - 1] ? xs[n - 1] : x;
    let i = n - 2;
    for (let k = 0; k < n - 1; k++) {
      if (xc < xs[k + 1]) {
        i = k;
        break;
      }
    }
    const t = xc - xs[i];
    const hi = h[i];
    const u = hi - t;
    return (
      (m[i] * u * u * u + m[i + 1] * t * t * t) / (6 * hi) +
      (ys[i] - (m[i] * hi * hi) / 6) * (u / hi) +
      (ys[i + 1] - (m[i + 1] * hi * hi) / 6) * (t / hi)
    );
  };
}

const toRyb = naturalSpline(RYB_X_KNOTS, RYB_HUE_KNOTS);
const toRgb = naturalSpline(RYB_X_KNOTS, RGB_HUE_KNOTS);

const wrap = (h: number) => h - Math.floor(h);

export function rgbHueToRybHueSpline(h: number): number {
  return toRyb(wrap(h));
}

export function rybHueToRgbHueSpline(h: number): number {
  return toRgb(wrap(h));
}

/** An RGB colour as the RYB triple darktable plots (same chroma and value,
 *  hue remapped). */
export function rgbToRyb(rgb: Vec3): Vec3 {
  const [, C, V] = rgbToHcv(rgb);
  if (C <= 0) return rgb;
  return hsvToRgb(rgbHueToRybHueSpline(hsvHue(rgb)), C / V, V);
}

/** The display colour of an RYB triple (the ring's colours). */
export function rybToRgb(ryb: Vec3): Vec3 {
  const [, C, V] = rgbToHcv(ryb);
  if (C <= 0) return ryb;
  return hsvToRgb(rybHueToRgbHueSpline(hsvHue(ryb)), C / V, V);
}
