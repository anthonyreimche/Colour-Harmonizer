// CPU reference of the smoothing stage's blur: the separable B3 spline
// [1,4,6,4,1]/16 over BLUR_LEVELS à trous levels with dilations
// s·1, s·2, s·4, s·8 (integer texels here), edges clamped like the GPU's
// CLAMP_TO_EDGE targets. Used by the GPU spec to predict the smoothed result
// and by the unit tests to pin the level design.

export const B3_WEIGHTS = [0.0625, 0.25, 0.375, 0.25, 0.0625];

/** One separable pass over an interleaved `channels`-wide field. */
export function b3Pass(
  src: Float64Array,
  width: number,
  height: number,
  channels: number,
  dilation: number,
  horizontal: boolean,
): Float64Array {
  const out = new Float64Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        let acc = 0;
        for (let k = -2; k <= 2; k++) {
          const sx = horizontal ? Math.min(width - 1, Math.max(0, x + k * dilation)) : x;
          const sy = horizontal ? y : Math.min(height - 1, Math.max(0, y + k * dilation));
          acc += B3_WEIGHTS[k + 2] * src[(sy * width + sx) * channels + c];
        }
        out[(y * width + x) * channels + c] = acc;
      }
    }
  }
  return out;
}

/** The whole chain: for each level, a horizontal then a vertical pass at
 *  dilation `unit · 2^level`. */
export function atrousBlur(
  src: Float64Array,
  width: number,
  height: number,
  channels: number,
  unit: number,
  levels: number,
): Float64Array {
  let field = src;
  for (let level = 0; level < levels; level++) {
    const dilation = unit * 2 ** level;
    field = b3Pass(field, width, height, channels, dilation, true);
    field = b3Pass(field, width, height, channels, dilation, false);
  }
  return field;
}
