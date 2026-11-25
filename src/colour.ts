// The colour fields' model. A field works in RYB degrees, the unit the hue
// sliders show; the stored hue is a darktable UCS turn (harmony.ts converts).

import { DEFAULT_PARAMS, hueToSrgb, rybToUcs, ucsToRyb } from "./harmony";
import { deriveAll } from "./params";
import type { Rgb } from "./safelight";
import { hueTurn, linearSrgbToJch, srgbToLinear } from "./ucs";

/** darktable's neutral floor for a usable hue. */
const MIN_CHROMA = 0.01;

/** The colour the hue sliders' track shows at an RYB degree. */
export function rybDegToSrgb(deg: number): Rgb {
  const [r, g, b] = hueToSrgb(rybToUcs(deg / 360));
  return [r, g, b];
}

/** A display sRGB colour's hue as an RYB degree, read through UCS as the
 *  scope does. A neutral has none, so it keeps `fallback`. */
export function rgbToRybDeg(rgb: Rgb, fallback: number): number {
  const [, C, H] = linearSrgbToJch([srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])]);
  return C > MIN_CHROMA ? ucsToRyb(hueTurn(H)) * 360 : fallback;
}

/** The harmonizer and its smoothing stage left out, for an eyedropper sample
 *  of the colour they receive. */
export const PICK_BAG: Record<string, unknown> = deriveAll({ ...DEFAULT_PARAMS, pullStrength: 0, nodeSat: [1, 1, 1, 1] });
