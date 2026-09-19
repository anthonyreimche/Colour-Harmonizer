// The vectorscope's pure model: darktable's RYB hue splines, the log radius,
// where a colour lands on the RYB plot, the guide sectors with their overlap
// clamp, the wheel's rotation steps, and the density mapping.

import { describe, expect, it } from "vitest";
import {
  RGB_HUE_KNOTS,
  RYB_HUE_KNOTS,
  RYB_X_KNOTS,
  naturalSpline,
  rgbHueToRybHueSpline,
  rybHueToRgbHueSpline,
} from "../src/ryb";
import {
  GUIDE_WIDTHS,
  LOG_BASE,
  baseLog,
  customSectors,
  cycle,
  densityIntensity,
  densityScale,
  guideSectors,
  hueRingColors,
  scopePoint,
  wheelStep,
} from "../src/scope";
import { RULES } from "../src/harmony";

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

describe("natural cubic spline", () => {
  it("passes through its knots and is natural at the ends", () => {
    const f = naturalSpline([0, 1, 2], [0, 1, 0]);
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    expect(f(2)).toBe(0);
    // With M0 = M2 = 0 the middle second derivative is −3: f(x) = −x³/2 + 3x/2 on [0, 1].
    expect(close(f(0.5), 0.6875, 1e-12)).toBe(true);
    expect(close(f(1.5), 0.6875, 1e-12)).toBe(true);
  });

  it("interpolates linearly with two knots", () => {
    const f = naturalSpline([0, 2], [1, 3]);
    expect(close(f(0.5), 1.5, 1e-12)).toBe(true);
  });
});

describe("RYB hue splines", () => {
  it("reproduce darktable's control points and stay monotone", () => {
    // A hue of 1 is the hue 0 again, so the last knot is only reachable raw.
    for (let k = 0; k < 6; k++) {
      expect(close(rgbHueToRybHueSpline(k / 6), RYB_HUE_KNOTS[k], 1e-12)).toBe(true);
      expect(close(rybHueToRgbHueSpline(k / 6), RGB_HUE_KNOTS[k], 1e-12)).toBe(true);
    }
    expect(close(naturalSpline(RYB_X_KNOTS, RYB_HUE_KNOTS)(1), 1, 1e-12)).toBe(true);
    expect(RGB_HUE_KNOTS).toEqual([0, 0.083333, 0.166667, 0.383838, 0.586575, 0.833333, 1]);
    let prev = -1;
    for (let i = 0; i < 600; i++) {
      const v = rgbHueToRybHueSpline(i / 600);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("wrap the hue before interpolating", () => {
    expect(close(rgbHueToRybHueSpline(1.25), rgbHueToRybHueSpline(0.25), 1e-12)).toBe(true);
  });
});

describe("scope points", () => {
  it("puts pure red at angle 0 on the unit ring and greys at the origin", () => {
    const [x, y] = scopePoint([1, 0, 0], "linear");
    expect(close(x, 1, 1e-12)).toBe(true);
    expect(close(y, 0, 1e-12)).toBe(true);
    expect(scopePoint([0.18, 0.18, 0.18], "linear")).toEqual([0, 0]);
    expect(scopePoint([0, 0, 0], "log")).toEqual([0, 0]);
  });

  it("places yellow at the RYB wheel's yellow (a third of a turn), not RGB's sixth", () => {
    const [x, y] = scopePoint([1, 1, 0], "linear");
    const angle = Math.atan2(y, x) / (2 * Math.PI);
    expect(close(angle, 1 / 3, 1e-9)).toBe(true);
  });

  it("uses the chroma (max − min) as the radius and compresses it logarithmically", () => {
    const [x] = scopePoint([0.6, 0.1, 0.1], "linear");
    expect(close(x, 0.5, 1e-12)).toBe(true);
    const [lx] = scopePoint([0.6, 0.1, 0.1], "log");
    expect(close(lx, baseLog(0.5, 1), 1e-12)).toBe(true);
    expect(LOG_BASE).toBe(30);
    expect(close(baseLog(1, 1), 1, 1e-12)).toBe(true);
    expect(close(baseLog(0.5, 1), Math.log1p(29 * 0.5) / Math.log(30), 1e-12)).toBe(true);
    expect(baseLog(0, 1)).toBe(0);
  });
});

describe("guide sectors", () => {
  it("spans half the guide width to each side and rotates with the anchor", () => {
    const rule = RULES[3];
    const s = guideSectors(rule.sectors, rule.lengths, GUIDE_WIDTHS.normal, 0.25);
    expect(s.length).toBe(2);
    expect(close(s[0].a0, 0.25 - 0.5 / 12, 1e-12)).toBe(true);
    expect(close(s[0].a1, 0.25 + 0.5 / 12, 1e-12)).toBe(true);
    expect(s[0].radius).toBe(0.8);
    expect(close(s[1].a0, 0.75 - 0.5 / 12, 1e-12)).toBe(true);
    expect(s[1].radius).toBe(0.5);
  });

  it("clamps neighbouring sectors to half their gap so they never overlap", () => {
    const rule = RULES[1];
    const s = guideSectors(rule.sectors, rule.lengths, GUIDE_WIDTHS.large, 0);
    expect(close(s[0].a1, -1 / 12 + 0.5 / 12, 1e-12)).toBe(true);
    expect(close(s[1].a0, -0.5 / 12, 1e-12)).toBe(true);
    expect(close(s[1].a1, 0.5 / 12, 1e-12)).toBe(true);
    expect(close(s[0].a0, -1 / 12 - 0.75 / 12, 1e-12)).toBe(true);
    expect(close(s[2].a1, 1 / 12 + 0.75 / 12, 1e-12)).toBe(true);
  });

  it("gives custom nodes fixed sectors at the anchor radius", () => {
    const s = customSectors([0.1, 0.6], GUIDE_WIDTHS.narrow);
    expect(s.length).toBe(2);
    expect(close(s[1].a0, 0.6 - 0.25 / 12, 1e-12)).toBe(true);
    expect(close(s[1].a1, 0.6 + 0.25 / 12, 1e-12)).toBe(true);
    expect(s[0].radius).toBe(0.8);
  });

  it("has darktable's four widths", () => {
    expect(GUIDE_WIDTHS).toEqual({ normal: 0.5 / 12, large: 0.75 / 12, narrow: 0.25 / 12, line: 0 });
  });
});

describe("wheel", () => {
  it("snaps coarse steps to 15° and fine steps to 1°, wrapping at 360", () => {
    expect(wheelStep("coarse", 7, 1)).toBe(15);
    expect(wheelStep("coarse", 8, 1)).toBe(30);
    expect(wheelStep("coarse", 0, -1)).toBe(345);
    expect(wheelStep("coarse", 350, 1)).toBe(0);
    expect(wheelStep("fine", 359, 1)).toBe(0);
    expect(wheelStep("fine", 0, -1)).toBe(359);
  });

  it("cycles a list both ways", () => {
    expect(cycle(4, 3, 1)).toBe(0);
    expect(cycle(4, 0, -1)).toBe(3);
    expect(cycle(10, 9, 1)).toBe(0);
  });
});

describe("density", () => {
  it("colours the ring from the RYB wheel: red, orange at a sixth, blue at two thirds", () => {
    const ring = hueRingColors(6);
    expect(ring[0]).toEqual([1, 0, 0]);
    expect(ring[1][0]).toBeGreaterThan(0.99);
    expect(ring[1][1]).toBeGreaterThan(0.4);
    expect(ring[1][1]).toBeLessThan(0.6);
    expect(ring[1][2]).toBe(0);
    expect(ring[4][2]).toBeGreaterThan(0.99);
    expect(ring[4][0]).toBe(0);
  });

  it("normalises counts by darktable's 1/30 gain per plotted pixel", () => {
    expect(close(densityScale(256, 65536), (1 / 30) * (256 * 256) / 65536, 1e-12)).toBe(true);
    expect(densityIntensity(0, 1)).toBe(0);
    expect(densityIntensity(5, 1)).toBe(1);
    expect(densityIntensity(0.5, 1)).toBeGreaterThan(0.5);
    expect(densityIntensity(0.5, 1)).toBeLessThan(1);
  });
});
