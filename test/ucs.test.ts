// darktable UCS 22 and its neighbours against vectors darktable's own C
// produced (test/reference). The C runs in float32 and this in float64, so
// agreement is judged at a few 1e-5 — far below anything the GPU's half-float
// targets can resolve, but tight enough that a wrong constant or a swapped
// factor fails.

import { describe, expect, it } from "vitest";
import vectors from "./reference/vectors.json";
import {
  D65_XY,
  L_WHITE,
  hsvHue,
  hueTurn,
  jchToLinearSrgb,
  linearSrgbToJch,
  linearToSrgb,
  rgbToHcv,
  srgbToLinear,
  turnToRadians,
  xyzToXyY,
} from "../src/ucs";

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const relTol = (v: number, rel: number, abs: number) => Math.abs(v) * rel + abs;

describe("darktable UCS", () => {
  it("has darktable's L_white", () => {
    expect(close(L_WHITE, vectors.lWhite, 1e-6)).toBe(true);
  });

  it("matches darktable's JCH for every reference colour", () => {
    for (const v of vectors.ucs) {
      const [J, C, H] = linearSrgbToJch([v.rgb[0], v.rgb[1], v.rgb[2]]);
      expect(close(J, v.jch[0], relTol(v.jch[0], 2e-5, 1e-6))).toBe(true);
      expect(close(C, v.jch[1], relTol(v.jch[1], 5e-5, 1e-6))).toBe(true);
      // A neutral's hue is numerical noise in both implementations.
      if (v.jch[1] > 1e-4) expect(close(H, v.jch[2], 1e-4)).toBe(true);
    }
  });

  it("inverts JCH back to the linear colour, including HDR values", () => {
    for (const v of vectors.ucs) {
      const back = jchToLinearSrgb(linearSrgbToJch([v.rgb[0], v.rgb[1], v.rgb[2]]));
      for (let c = 0; c < 3; c++) {
        expect(close(back[c], v.rgb[c], relTol(v.rgb[c], 1e-4, 1e-5))).toBe(true);
        expect(close(back[c], v.back[c], relTol(v.back[c], 1e-4, 1e-5))).toBe(true);
      }
    }
  });

  it("maps black to J = 0, C = 0 and a zero XYZ to the D65 chromaticity", () => {
    const [J, C] = linearSrgbToJch([0, 0, 0]);
    expect(J).toBe(0);
    expect(C).toBe(0);
    const [x, y, Y] = xyzToXyY([0, 0, 0]);
    expect(x).toBe(D65_XY[0]);
    expect(y).toBe(D65_XY[1]);
    expect(Y).toBe(0);
  });

  it("converts the hue angle to a turn and back", () => {
    expect(hueTurn(-Math.PI)).toBe(0);
    expect(close(hueTurn(0), 0.5, 1e-12)).toBe(true);
    expect(close(turnToRadians(hueTurn(1.3)), 1.3, 1e-12)).toBe(true);
  });
});

describe("HSV helpers (darktable's)", () => {
  it("places the primaries at thirds of the hue circle", () => {
    expect(hsvHue([1, 0, 0])).toBe(0);
    expect(close(hsvHue([0, 1, 0]), 1 / 3, 1e-12)).toBe(true);
    expect(close(hsvHue([0, 0, 1]), 2 / 3, 1e-12)).toBe(true);
    expect(close(hsvHue([1, 0, 0.5]), 11 / 12, 1e-12)).toBe(true);
  });

  it("reads a grey as chroma 0, hue 0", () => {
    expect(rgbToHcv([0.18, 0.18, 0.18])).toEqual([0, 0, 0.18]);
    expect(rgbToHcv([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("round-trips the sRGB transfer function", () => {
    expect(close(srgbToLinear(linearToSrgb(0.5)), 0.5, 1e-12)).toBe(true);
    expect(close(srgbToLinear(0.04045), 0.04045 / 12.92, 1e-12)).toBe(true);
  });
});
