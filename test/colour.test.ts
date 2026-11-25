// The colour field's model: the RYB wheel in degrees, drawn as the hue
// slider's track draws it and read back through darktable UCS.

import { describe, expect, it } from "vitest";
import { PICK_BAG, rgbToRybDeg, rybDegToSrgb } from "../src/colour";
import { effectActive, hueToSrgb, rybToUcs } from "../src/harmony";
import { SMOOTH_KEY, readParams } from "../src/params";

describe("rybDegToSrgb", () => {
  it("is the colour the hue track shows at that degree", () => {
    for (const deg of [0, 45, 120, 200, 300, 359]) {
      expect(rybDegToSrgb(deg)).toEqual(hueToSrgb(rybToUcs(deg / 360)));
    }
  });
});

describe("rgbToRybDeg", () => {
  it("reads a colour's UCS hue back as RYB degrees", () => {
    for (const deg of [10, 60, 130, 210, 290]) {
      const back = rgbToRybDeg(rybDegToSrgb(deg), 0);
      const d = Math.abs(back - deg);
      expect(Math.min(d, 360 - d)).toBeLessThan(0.5);
    }
  });

  it("ignores a colour's chroma and lightness, only its hue counts", () => {
    const [r, g, b] = rybDegToSrgb(75);
    const dim = rgbToRybDeg([r * 0.6, g * 0.6, b * 0.6], 0);
    expect(Math.abs(dim - rgbToRybDeg([r, g, b], 0))).toBeLessThan(3);
  });

  it("keeps the fallback for a neutral, which has no hue", () => {
    expect(rgbToRybDeg([0.5, 0.5, 0.5], 123)).toBe(123);
    expect(rgbToRybDeg([0, 0, 0], 77)).toBe(77);
  });
});

describe("PICK_BAG", () => {
  it("leaves the harmonizer and its smoothing stage off for a capture", () => {
    expect(effectActive(readParams(PICK_BAG))).toBe(false);
    expect(PICK_BAG[SMOOTH_KEY.on]).toBe(0);
  });
});
