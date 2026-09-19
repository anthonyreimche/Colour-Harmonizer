# Colour Harmony for SafeLight

A [SafeLight](https://github.com/anthonyreimche/SafeLight) extension that ports
[**darktable**](https://www.darktable.org/)'s *color harmonizer* (new in darktable
5.6) into SafeLight's Develop module, together with the tool darktable designed
it around: the **RYB vectorscope with colour harmony guides**, drawn in the
panel from the live render. If you came from darktable and want to pull a
photo's colours toward a complementary, triadic or custom palette, this is that
module, with the same controls, the same wording and the same maths.

## What it does

Every colour is taken to darktable UCS 22 — a perceptual hue / chroma / lightness
model — and its hue is **pulled toward the nearest node** of a harmony rule. A
rule places one to four nodes on the RYB (paint) wheel from an **anchor hue**:

| Rule | Nodes (RYB degrees from the anchor) |
|---|---|
| Monochromatic | 0 |
| Analogous | −30, 0, +30 |
| Analogous complementary | −30, 0, +30, 180 |
| Complementary | 0, 180 |
| Split complementary | 0, 150, 210 |
| Dyad | −30, +30 |
| Triad | 0, 120, 240 |
| Tetrad | −30, +30, 150, 210 |
| Square | 0, 90, 180, 270 |
| Custom | 2–4 nodes you place yourself |

The pull is Gaussian in hue distance — strongest at a node, fading toward the
midpoint between nodes — so a colour already on the palette does not move and a
colour halfway between two nodes moves least. Neutrals are protected by their
low chroma. Each node also carries a **saturation** multiplier for the colours
it attracts. Settings persist per photo, take part in undo and presets, and
render identically in Develop, thumbnails and export. At the defaults the stages
are a bit-exact no-op.

## Controls

darktable's, in darktable's order:

- **The scope** (top): the vectorscope of the current render with the guide
  sectors for the current rule. **Scroll** rotates the harmony 15° on the RYB
  wheel (snapped), **Ctrl+scroll** 1°, **Shift+scroll** cycles the guide width
  (normal / large / narrow / line), **Alt+scroll** cycles the rule; custom nodes
  rotate as a group. One gesture is one undo entry.
- **Rule** and **Infer**: Infer scores every predefined rule at every 1° anchor
  against a chroma-weighted histogram of the image's hues and picks the
  combination that already covers the most chromatic energy — the palette that
  needs the least correction.
- **Anchor hue** (RYB degrees, hue-coloured track) with **Pick**: click a spot in
  the image to anchor the palette on it (a 5×5 patch is averaged; Esc cancels).
- **Custom**: a **Nodes** count and one row per node — swatch, hue slider, Pick.
  Switching to Custom seeds the nodes from the rule you were on.
- The **swatches** of the current nodes.
- **Pull strength** (0 leaves colours alone), **Pull width** (below 1 only hues
  close to a node move; at 1 each node's influence tapers toward the midpoint
  between nodes; above 1 the zones overlap and everything drifts), **Neutral
  protection** (shields greys, pastels and muted tones; the cutoff chroma grows
  as the cube of the slider), **Smoothing** (a spatial blur of the correction,
  for a softer, painterly transition; 0 keeps every detail).
- **Saturation** (collapsed): one slider per node, 0–200 %, on a grey-to-vivid
  track for that node's hue.
- **Reset** from the panel's dock header menu.

Preferences ▸ Extensions ▸ Colour Harmony holds the scope's display settings:
logarithmic or linear radius (darktable's default is logarithmic), the guide
width, and how much of the plot shows outside the guides (darktable's 0.7).

## The math

Faithful to `src/iop/colorharmonizer.c` and `src/common/color_harmony.h`:

- **UCS.** Scene-linear RGB → XYZ D65 → xyY → darktable UCS 22 `J C H`
  (`colorspaces_inline_conversions.h`, every constant verbatim), the hue as a
  turn `(H + π) / 2π`.
- **Nodes.** The anchor's UCS hue becomes an integer RYB rotation through
  darktable's 720-entry lookup (`UCS hue → sRGB at J = 0.65 and 85 % of the
  gamut chroma → linear → HSV hue → Gossett RYB hue`, inverted by nearest
  match); the rule's sector table is rotated there and each node is taken back
  to UCS. The processing nodes and the scope's sectors are the same angles.
- **Pull.** With `σ = pullWidth · 0.5 / n`, each node weighs
  `w = exp(−d² / 2σ²)` in hue distance; the nearest node wins and the shift is
  `(node − hue) · w`. The chroma weight is `C / (C + neutral³ · 0.03)`; the new
  hue is `hue + shift · pullStrength · chromaWeight` and the new chroma
  `C · (1 + (sat − 1) · w · chromaWeight)`, then back to RGB.
- **Smoothing.** darktable computes the per-pixel correction `(shift, sat delta)`
  as a field, blurs it with a Gaussian of `σ = smoothing · max(1.5, 8 · scale) ·
  max(1, pullWidth)` pixels, and applies the blurred field to each pixel's own
  `J C H`.
- **Infer.** Three circular box passes over the 360-bin histogram, then the
  coverage score `Σ histo · max_w / Σ histo` for 9 rules × 360 anchors.

One note on darktable's own comment that the Gaussian "tapers to ~14 % at the
midpoint between nodes": at width 1 the midpoint sits one σ from each node,
so the weight there is `exp(−½)`, about 61 %. The code, not the comment, is
what this port reproduces.

### How it maps onto SafeLight

Two stages in SafeLight's scene-linear phase:

- **`colour-harmony.harmonize`** is darktable's fused single pass as one inline
  block, entered only while smoothing is off and something is pulled. It
  carries every parameter the panel edits plus the derived UCS nodes, so the
  render is right when the panel never mounts (export, a freshly loaded edit or
  preset).
- **`colour-harmony.smooth`** is darktable's two-pass path on the prepass
  framework: a map draw writes the correction field to a float target, eight
  blur draws smooth it, the inline applies it. SafeLight runs a stage's prepass
  whenever any of its keys is non-zero, so this stage's keys are written as
  zeros until smoothing is on and the effect is non-trivial — that is what makes
  smoothing free when it is off. Dragging pull strength or neutral protection is
  a prepass cache hit (they apply after the blur, as in darktable).

The blur is four à trous levels of the separable B3 spline `[1,4,6,4,1]/16`
(dilations s, 2s, 4s, 8s; their variances add up to 85·s², so `s = σ / √85`) at
five fetches per draw, 41 per pixel per frame. darktable's `8 · scale` term is
anchored to a 4096-px reference long edge, so Develop, thumbnails and export
agree.

The scope, Infer and the picker read a ≤192-px capture of the live view after
each settled render (`api.develop.captureFrame`, throttled to 150 ms and
coalesced), only while the panel is mounted.

Differences from darktable to be aware of:

- SafeLight's working space has sRGB primaries, so RGB reaches XYZ D65 through
  one matrix; darktable goes work profile → XYZ D50 → CAT16 → D65. The
  difference is a fraction of a percent in XYZ.
- Smoothing uses the iterated B3 spline, a close approximation of darktable's
  recursive Gaussian, and its map pass sees the source before the user's
  white-balance tweak and any earlier scene-linear stage (a property of the
  prepass framework). The field is smoothed spatially anyway.
- The scope, the histogram and the picker are display-referred (darktable's
  vectorscope is too; its module reads its own pipeline input). Hue survives
  the tone transform closely enough.
- The vectorscope is RYB only and lives in the panel, always in sync with the
  module; darktable's u*v* and AzBz modes and its "sync to vectorscope" toggle
  have no counterpart.
- Signed corrections need SafeLight's float render targets
  (`EXT_color_buffer_float`, present on every desktop GPU); on the 8-bit fallback
  smoothing degrades.

### Tests

`npm test` runs on the CPU against vectors generated from darktable's own C
(`test/reference/darktable_ref.c`, built with gcc by `npm run test:reference`;
the JSON is committed): the UCS conversions, the RYB ↔ UCS lookups, node
placement, the weighted pull, the fused pixel, inference; the bag bridge and
the smoothing gate; the stage contracts and a **per-draw texture-fetch budget**
on the real GLSL; the vectorscope model; the frame sampler's scheduling; the
picker's mapping; the activation contract.

`npm run test:gpu` runs the stages through a SafeLight checkout's WebGL harness
(headless Chromium on SwiftShader): both stages compile, the defaults are a
bit-exact no-op with smoothing on or off, the fused path matches darktable's
answer for four rule / strength / saturation sets to 0.4–0.5 % of the change,
and the smoothing path matches a CPU reference of its blur to 0.8 %. It needs
the SafeLight repository beside this one (or `SAFELIGHT_CORE=<path>`) with its
dev dependencies installed. Pixels within half a degree of the midpoint between
two nodes are left out of the fused comparison: darktable's nearest-node rule
flips there, and the GPU's hue is good to about 0.1°.

## Install

Install from the SafeLight **Extensions** window, or load this folder via
Developer Tools ▸ Extensions during development. A **Colour Harmony** panel
appears in Develop (right dock). Build from source with `npm install && npm run
build` (outputs `dist/index.js`). Needs SafeLight 2.5.4 or later.

## License & credits

**GPL-3.0-or-later.** The algorithm, the colour science and the UI are a
reimplementation of darktable's color harmonizer and RYB vectorscope, which
are GPL-3.0; this extension is licensed under the GPL to respect that. darktable
UCS 22 is © Aurélien Pierre. darktable is © its authors — see
[darktable-org/darktable](https://github.com/darktable-org/darktable). This is
an independent port and is not affiliated with or endorsed by the darktable
project.
