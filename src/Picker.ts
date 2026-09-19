// The on-image hue picker (darktable's eyedropper on the anchor and custom
// hue sliders, point form). While a target is armed, a click-through overlay
// over the Develop canvas captures one plain left click, maps it to image UV
// through the overlay rect (interface-scale aware), samples a 5×5 patch from
// an off-screen capture of the live view — core's white-balance eyedropper
// rule — and writes the patch's UCS hue to the anchor or the custom node.
// Esc disarms; core's Ctrl/⌘/Space passthrough keeps pan and zoom working.

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { api, h } from "./runtime";
import { deriveAll, readParams } from "./params";
import type { OverlayRect } from "./safelight";
import { store, type PickTarget } from "./store";
import { hueTurn, linearSrgbToJch, srgbToLinear } from "./ucs";

const PATCH = 5;
/** darktable's neutral floor for a usable hue. */
const MIN_CHROMA = 0.01;

export interface ClientBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Uv {
  x: number;
  y: number;
}

/** Client point → image UV through the displayed image rect. `clientWidth /
 *  box.width` is the interface scale (the body zoom), so a zoomed UI still
 *  lands on the pixel under the pointer. Null outside the image. */
export function pointToUv(
  clientX: number,
  clientY: number,
  box: ClientBox,
  clientWidth: number,
  rect: OverlayRect | null,
): Uv | null {
  if (!rect || box.width <= 0 || box.height <= 0 || rect.w <= 0 || rect.h <= 0) return null;
  const scale = clientWidth / box.width;
  const lx = (clientX - box.left) * scale;
  const ly = (clientY - box.top) * scale;
  const x = (lx - rect.x) / rect.w;
  const y = (ly - rect.y) / rect.h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** The UCS hue turn of the PATCH×PATCH box around (px, py) of an 8-bit sRGB
 *  frame, averaged in linear light; null for a neutral patch. */
export function hueOfPatch(data: Uint8ClampedArray, width: number, height: number, px: number, py: number): number | null {
  const half = PATCH >> 1;
  const x0 = Math.max(0, px - half);
  const y0 = Math.max(0, py - half);
  const x1 = Math.min(width - 1, px + half);
  const y1 = Math.min(height - 1, py + half);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = (y * width + x) * 4;
      r += srgbToLinear(data[o] / 255);
      g += srgbToLinear(data[o + 1] / 255);
      b += srgbToLinear(data[o + 2] / 255);
      n++;
    }
  }
  if (n === 0) return null;
  const [, C, H] = linearSrgbToJch([r / n, g / n, b / n]);
  return C > MIN_CHROMA ? hueTurn(H) : null;
}

function applyPick(target: PickTarget, hue: number): void {
  const dev = api().stores.useDevelopStore.getState();
  const p = readParams(dev.paramBag);
  const next =
    target === "anchor"
      ? { ...p, anchorHue: hue }
      : { ...p, customHues: p.customHues.map((v, i) => (i === target ? hue : v)) };
  dev.setDynParams(deriveAll(next));
  void dev.commitEdit("Colour Harmony pick");
  store().getState().setPicking(null);
}

async function pickAt(
  clientX: number,
  clientY: number,
  el: HTMLElement | null,
  rect: OverlayRect | null,
  target: PickTarget,
): Promise<void> {
  try {
    if (!el) return;
    const uv = pointToUv(clientX, clientY, el.getBoundingClientRect(), el.clientWidth, rect);
    if (!uv) return;
    const dev = api().stores.useDevelopStore.getState();
    const bitmap = await api().develop.captureFrame(dev.previewParams ?? dev.params);
    const w = bitmap.width;
    const hgt = bitmap.height;
    if (w < 2 || hgt < 2) {
      bitmap.close();
      return;
    }
    const canvas = new OffscreenCanvas(w, hgt);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      bitmap.close();
      return;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const px = Math.min(w - 1, Math.max(0, Math.round(uv.x * w)));
    const py = Math.min(hgt - 1, Math.max(0, Math.round(uv.y * hgt)));
    const half = PATCH >> 1;
    const x0 = Math.max(0, px - half);
    const y0 = Math.max(0, py - half);
    const bw = Math.min(w - 1, px + half) - x0 + 1;
    const bh = Math.min(hgt - 1, py + half) - y0 + 1;
    const box = ctx.getImageData(x0, y0, bw, bh).data;
    const hue = hueOfPatch(box, bw, bh, px - x0, py - y0);
    if (hue !== null) applyPick(target, hue);
  } catch (err) {
    console.warn("[colour-harmony] hue pick failed:", err);
  }
}

export function PickerOverlay() {
  const { useEffect, useRef } = api().react;
  const picking = store()((s) => s.picking);
  const overlay = api().develop.useDevelopOverlay();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (picking === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") store().getState().setPicking(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  if (picking === null) return null;
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "auto",
    cursor: api().cursors.resolve("pick"),
  };
  return h("div", {
    ref,
    style,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      void pickAt(e.clientX, e.clientY, ref.current, overlay.rect, picking);
    },
  });
}
