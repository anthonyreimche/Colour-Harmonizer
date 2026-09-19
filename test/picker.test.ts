// The on-image hue picker's pure parts: mapping a click to image UV through
// the overlay rect under interface scaling, and the 5×5 patch average that
// becomes the picked UCS hue (core's white-balance eyedropper rule).

import { describe, expect, it } from "vitest";
import { hueOfPatch, pointToUv } from "../src/Picker";
import { hueTurn, linearSrgbToJch, linearToSrgb } from "../src/ucs";

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

describe("pointToUv", () => {
  const rect = { x: 100, y: 50, w: 400, h: 200 };

  it("maps a client point inside the displayed image to 0..1", () => {
    const uv = pointToUv(300, 150, { left: 0, top: 0, width: 800, height: 600 }, 800, rect);
    expect(uv).toEqual({ x: 0.5, y: 0.5 });
  });

  it("divides by the interface scale so a zoomed UI still lands on the pixel", () => {
    // Layout 800 px wide but drawn at 1000 client px (interface scale 1.25).
    const uv = pointToUv(375, 187.5, { left: 0, top: 0, width: 1000, height: 750 }, 800, rect);
    expect(uv).toEqual({ x: 0.5, y: 0.5 });
  });

  it("returns null outside the image", () => {
    expect(pointToUv(10, 10, { left: 0, top: 0, width: 800, height: 600 }, 800, rect)).toBeNull();
    expect(pointToUv(300, 150, { left: 0, top: 0, width: 800, height: 600 }, 800, null)).toBeNull();
  });
});

describe("hueOfPatch", () => {
  const srgb8 = (v: number) => Math.round(linearToSrgb(v) * 255);

  function frame(w: number, h: number, at: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = at(x, y);
        const o = (y * w + x) * 4;
        data[o] = srgb8(r);
        data[o + 1] = srgb8(g);
        data[o + 2] = srgb8(b);
        data[o + 3] = 255;
      }
    }
    return data;
  }

  it("averages a 5×5 box in linear light and returns the UCS hue turn", () => {
    const data = frame(9, 9, () => [0.6, 0.12, 0.12]);
    const [, , H] = linearSrgbToJch([0.6, 0.12, 0.12]);
    expect(close(hueOfPatch(data, 9, 9, 4, 4) ?? -1, hueTurn(H), 2e-3)).toBe(true);
  });

  it("clips the box at the frame edge and rejects a neutral patch", () => {
    const data = frame(9, 9, (x) => (x < 2 ? [0.1, 0.1, 0.6] : [0.18, 0.18, 0.18]));
    const [, , H] = linearSrgbToJch([0.1, 0.1, 0.6]);
    expect(close(hueOfPatch(data, 9, 9, 0, 0) ?? -1, hueTurn(H), 0.05)).toBe(true);
    expect(hueOfPatch(data, 9, 9, 8, 8)).toBeNull();
  });
});
