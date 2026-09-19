// darktable UCS 22 (JCH) and the conversions around it, transcribed from
// darktable's colorspaces_inline_conversions.h (© Aurélien Pierre / darktable
// developers, GPL-3.0-or-later). Safelight's working space is scene-linear
// with sRGB primaries, so RGB reaches XYZ D65 through one matrix; every
// constant is exported so the GLSL in stage.ts is formatted from the same
// numbers and cannot drift from this CPU reference.

export type Vec3 = readonly [number, number, number];

export const SRGB_TO_XYZ_D65: readonly number[] = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.072175,
  0.0193339, 0.119192, 0.9503041,
];

export const XYZ_TO_SRGB_D65: readonly number[] = [
  3.2404542, -1.5371385, -0.4985314,
  -0.969266, 1.8760108, 0.041556,
  0.0556434, -0.2040259, 1.0572252,
];

export const D65_XY: readonly [number, number] = [0.31271, 0.32902];

export const UCS_L_STAR_RANGE = 2.098883786377;
export const UCS_L_STAR_UPPER_LIMIT = 2.09885;
export const UCS_L_STAR_EXPONENT = 0.631651345306265;
export const UCS_L_STAR_OFFSET = 1.12426773749357;
export const UCS_L_STAR_INVERSE_EXPONENT = 1.5831518565279648;
export const UCS_CHROMA_SCALE = 15.932993652962535;
export const UCS_CHROMA_L_EXPONENT = 0.6523997524738018;
export const UCS_CHROMA_M_EXPONENT = 0.6007557017508491;
export const UCS_CHROMA_INVERSE_EXPONENT = 0.8322850678616855;

export const UCS_UV_X_FACTORS: Vec3 = [-0.783941002840055, 0.745273540913283, 0.318707282433486];
export const UCS_UV_Y_FACTORS: Vec3 = [0.277512987809202, -0.205375866083878, 2.16743692732158];
export const UCS_UV_OFFSETS: Vec3 = [0.153836578598858, -0.165478376301988, 0.291320554395942];
export const UCS_UV_FACTORS: readonly [number, number] = [1.39656225667, 1.4513954287];
export const UCS_UV_HALF: readonly [number, number] = [1.49217352929, 1.52488637914];
/** UV* → UV*' as a row-major 2×2. */
export const UCS_UV_PRIME: readonly number[] = [
  -1.124983854323892, -0.980483721769325,
  1.86323315098672, 1.971853092390862,
];
/** UV*' → UV* as a row-major 2×2 (the inverse, as darktable writes it). */
export const UCS_UV_UNPRIME: readonly number[] = [
  -5.037522385190711, -2.504856328185843,
  4.760029407436461, 2.874012963239247,
];
export const UCS_XY_U_FACTORS: Vec3 = [0.167171472114775, -0.150959086409163, 0.940254742367256];
export const UCS_XY_V_FACTORS: Vec3 = [0.141299802443708, -0.155185060382272, 1.0];
export const UCS_XY_OFFSETS: Vec3 = [-0.00801531300850582, -0.00843312433578007, -0.0256325967652889];

/** float32 FLT_MIN — darktable's divisor floor, kept for the GLSL too. */
export const FLT_MIN = 1.17549435e-38;

export function yToLStar(Y: number): number {
  const yHat = Math.pow(Y, UCS_L_STAR_EXPONENT);
  return (UCS_L_STAR_RANGE * yHat) / (yHat + UCS_L_STAR_OFFSET);
}

export function lStarToY(L: number): number {
  return Math.pow((UCS_L_STAR_OFFSET * L) / (UCS_L_STAR_RANGE - L), UCS_L_STAR_INVERSE_EXPONENT);
}

export const L_WHITE = yToLStar(1);

export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function mat3(m: readonly number[], v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function linearSrgbToXyz(rgb: Vec3): Vec3 {
  return mat3(SRGB_TO_XYZ_D65, rgb);
}

export function xyzToLinearSrgb(xyz: Vec3): Vec3 {
  return mat3(XYZ_TO_SRGB_D65, xyz);
}

export function xyzToXyY(xyz: Vec3): Vec3 {
  const X = Math.max(xyz[0], 0);
  const Y = Math.max(xyz[1], 0);
  const Z = Math.max(xyz[2], 0);
  const sum = X + Y + Z;
  return sum > 0 ? [X / sum, Y / sum, Y] : [D65_XY[0], D65_XY[1], Y];
}

export function xyYToXyz(xyY: Vec3): Vec3 {
  const [x, y, Y] = xyY;
  if (y === 0) return [0, 0, 0];
  return [(Y * x) / y, Y, (Y * (1 - x - y)) / y];
}

function safeDivisor(d: number): number {
  return d >= 0 ? Math.max(FLT_MIN, d) : Math.min(-FLT_MIN, d);
}

function xyYToUvPrime(xyY: Vec3): [number, number] {
  const uvd = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    uvd[c] = UCS_UV_X_FACTORS[c] * xyY[0] + UCS_UV_Y_FACTORS[c] * xyY[1] + UCS_UV_OFFSETS[c];
  }
  const div = safeDivisor(uvd[2]);
  const u = uvd[0] / div;
  const v = uvd[1] / div;
  const uStar = (UCS_UV_FACTORS[0] * u) / (Math.abs(u) + UCS_UV_HALF[0]);
  const vStar = (UCS_UV_FACTORS[1] * v) / (Math.abs(v) + UCS_UV_HALF[1]);
  return [
    UCS_UV_PRIME[0] * uStar + UCS_UV_PRIME[1] * vStar,
    UCS_UV_PRIME[2] * uStar + UCS_UV_PRIME[3] * vStar,
  ];
}

/** xyY (D65) → JCH; H in radians (−π, π]. */
export function xyYToJch(xyY: Vec3): Vec3 {
  const [u, v] = xyYToUvPrime(xyY);
  const L = yToLStar(xyY[2]);
  const m2 = u * u + v * v;
  return [
    L / L_WHITE,
    (UCS_CHROMA_SCALE * Math.pow(L, UCS_CHROMA_L_EXPONENT) * Math.pow(m2, UCS_CHROMA_M_EXPONENT)) / L_WHITE,
    Math.atan2(v, u),
  ];
}

export function jchToXyY(jch: Vec3): Vec3 {
  const L = Math.min(Math.max(jch[0] * L_WHITE, 0), UCS_L_STAR_UPPER_LIMIT);
  const M =
    L !== 0
      ? Math.pow((jch[1] * L_WHITE) / (UCS_CHROMA_SCALE * Math.pow(L, UCS_CHROMA_L_EXPONENT)), UCS_CHROMA_INVERSE_EXPONENT)
      : 0;
  const uPrime = M * Math.cos(jch[2]);
  const vPrime = M * Math.sin(jch[2]);
  const uStar = UCS_UV_UNPRIME[0] * uPrime + UCS_UV_UNPRIME[1] * vPrime;
  const vStar = UCS_UV_UNPRIME[2] * uPrime + UCS_UV_UNPRIME[3] * vPrime;
  const u = (-UCS_UV_HALF[0] * uStar) / (Math.abs(uStar) - UCS_UV_FACTORS[0]);
  const v = (-UCS_UV_HALF[1] * vStar) / (Math.abs(vStar) - UCS_UV_FACTORS[1]);
  const xyD = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    xyD[c] = UCS_XY_U_FACTORS[c] * u + UCS_XY_V_FACTORS[c] * v + UCS_XY_OFFSETS[c];
  }
  const div = safeDivisor(xyD[2]);
  return [xyD[0] / div, xyD[1] / div, lStarToY(L)];
}

export function linearSrgbToJch(rgb: Vec3): Vec3 {
  return xyYToJch(xyzToXyY(linearSrgbToXyz(rgb)));
}

export function jchToLinearSrgb(jch: Vec3): Vec3 {
  return xyzToLinearSrgb(xyYToXyz(jchToXyY(jch)));
}

/** JCH hue angle (radians, −π..π) → the module's normalised hue in [0, 1). */
export function hueTurn(H: number): number {
  return (H + Math.PI) / (2 * Math.PI);
}

export function turnToRadians(turn: number): number {
  return turn * 2 * Math.PI - Math.PI;
}

/** darktable's _dt_RGB_2_Hue: HSV hue in [0, 1) for a colour with a non-zero
 *  spread (`max − min`). */
export function hsvHue(rgb: Vec3): number {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const delta = max - Math.min(rgb[0], rgb[1], rgb[2]);
  let hue: number;
  if (rgb[0] === max) hue = (rgb[1] - rgb[2]) / delta;
  else if (rgb[1] === max) hue = 2 + (rgb[2] - rgb[0]) / delta;
  else hue = 4 + (rgb[0] - rgb[1]) / delta;
  hue /= 6;
  return hue - Math.floor(hue);
}

/** darktable's dt_RGB_2_HCV: [hue, chroma (max − min), value (max)]; a colour
 *  with no spread reads as hue 0, chroma 0. */
export function rgbToHcv(rgb: Vec3): Vec3 {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const delta = max - Math.min(rgb[0], rgb[1], rgb[2]);
  if (Math.abs(max) > 1e-6 && Math.abs(delta) > 1e-6) return [hsvHue(rgb), delta, max];
  return [0, 0, max];
}

/** darktable's dt_HSV_2_RGB. */
export function hsvToRgb(h: number, s: number, v: number): Vec3 {
  const C = s * v;
  const m = v - C;
  const hh = h * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const fc = f * C;
  const top = C + m;
  const dec = C - fc + m;
  const inc = fc + m;
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [top, inc, m];
    case 1:
      return [dec, top, m];
    case 2:
      return [m, top, inc];
    case 3:
      return [m, dec, top];
    case 4:
      return [inc, m, top];
    default:
      return [top, m, dec];
  }
}
