/*
    Reference-vector generator for the Colour Harmony extension's tests.

    Transcribed from darktable (GPL-3.0-or-later, © darktable developers):
      src/common/colorspaces_inline_conversions.h  (darktable UCS 22, xyY, HSV)
      src/common/color_harmony.h                    (harmony sector table)
      src/common/color_ryb.h                        (Gossett RYB hue map)
      src/iop/colorharmonizer.c                     (the module, darktable 5.6)
    Everything is kept in single precision, as darktable computes it. The only
    deliberate departure: RGB reaches XYZ D65 through the sRGB D65 matrix
    directly (Safelight's working space) instead of darktable's work-profile
    -> XYZ D50 -> CAT16 -> D65 hop.

    Built and run by build.cjs; prints vectors.json to stdout.
*/

#include <float.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef float pixel_t[4];

#define CLAMP(x, lo, hi) ((x) < (lo) ? (lo) : ((x) > (hi) ? (hi) : (x)))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define M_PI_F 3.14159265358979323846f
#define DT_2PI_F 6.28318530717958647693f

static const float D65xyY_x = 0.31271f;
static const float D65xyY_y = 0.32902f;

/* ---- colorspaces_inline_conversions.h ------------------------------------ */

static const float srgb_to_xyz_d65[9] = {
  0.4124564f, 0.3575761f, 0.1804375f,
  0.2126729f, 0.7151522f, 0.0721750f,
  0.0193339f, 0.1191920f, 0.9503041f,
};

static const float xyz_to_srgb_d65[9] = {
   3.2404542f, -1.5371385f, -0.4985314f,
  -0.9692660f,  1.8760108f,  0.0415560f,
   0.0556434f, -0.2040259f,  1.0572252f,
};

static void mat3_apply(const float *m, const pixel_t in, pixel_t out)
{
  for(int r = 0; r < 3; r++)
    out[r] = m[3 * r] * in[0] + m[3 * r + 1] * in[1] + m[3 * r + 2] * in[2];
  out[3] = 0.f;
}

static void dt_D65_XYZ_to_xyY(const pixel_t sXYZ, pixel_t xyY)
{
  pixel_t XYZ;
  for(int c = 0; c < 3; c++) XYZ[c] = MAX(sXYZ[c], 0.0f);
  const float sum = XYZ[0] + XYZ[1] + XYZ[2];
  xyY[0] = (sum > 0.0f) ? XYZ[0] / sum : D65xyY_x;
  xyY[1] = (sum > 0.0f) ? XYZ[1] / sum : D65xyY_y;
  xyY[2] = XYZ[1];
  xyY[3] = 0.f;
}

static void dt_xyY_to_XYZ(const pixel_t xyY, pixel_t XYZ)
{
  const int bad = xyY[1] == 0.0f;
  XYZ[0] = bad ? 0.0f : xyY[2] * xyY[0] / xyY[1];
  XYZ[1] = bad ? 0.0f : xyY[2];
  XYZ[2] = bad ? 0.0f : xyY[2] * (1.f - xyY[0] - xyY[1]) / xyY[1];
  XYZ[3] = 0.f;
}

#define DT_UCS_L_STAR_RANGE 2.098883786377f
#define DT_UCS_L_STAR_UPPER_LIMIT 2.09885f

static float Y_to_dt_UCS_L_star(const float Y)
{
  const float Y_hat = powf(Y, 0.631651345306265f);
  return DT_UCS_L_STAR_RANGE * Y_hat / (Y_hat + 1.12426773749357f);
}

static float dt_UCS_L_star_to_Y(const float L_star)
{
  return powf((1.12426773749357f * L_star / (DT_UCS_L_STAR_RANGE - L_star)), 1.5831518565279648f);
}

static void xyY_to_dt_UCS_UV(const pixel_t xyY, float UV_star_prime[2])
{
  const float x_factors[3] = { -0.783941002840055f,  0.745273540913283f, 0.318707282433486f };
  const float y_factors[3] = {  0.277512987809202f, -0.205375866083878f, 2.16743692732158f };
  const float offsets[3]   = {  0.153836578598858f, -0.165478376301988f, 0.291320554395942f };

  float UVD[3];
  for(int c = 0; c < 3; c++) UVD[c] = x_factors[c] * xyY[0] + y_factors[c] * xyY[1] + offsets[c];

  const float div = (UVD[2] >= 0.0f) ? MAX(FLT_MIN, UVD[2]) : MIN(-FLT_MIN, UVD[2]);
  UVD[0] /= div;
  UVD[1] /= div;

  float UV_star[2];
  const float factors[2]     = { 1.39656225667f, 1.4513954287f };
  const float half_values[2] = { 1.49217352929f, 1.52488637914f };
  for(int c = 0; c < 2; c++) UV_star[c] = factors[c] * UVD[c] / (fabsf(UVD[c]) + half_values[c]);

  UV_star_prime[0] = -1.124983854323892f * UV_star[0] - 0.980483721769325f * UV_star[1];
  UV_star_prime[1] =  1.86323315098672f  * UV_star[0] + 1.971853092390862f * UV_star[1];
}

static void dt_UCS_LUV_to_JCH(const float L_star, const float L_white, const float UV_star_prime[2], pixel_t JCH)
{
  const float M2 = UV_star_prime[0] * UV_star_prime[0] + UV_star_prime[1] * UV_star_prime[1];
  JCH[0] = L_star / L_white;
  JCH[1] = 15.932993652962535f * powf(L_star, 0.6523997524738018f) * powf(M2, 0.6007557017508491f) / L_white;
  JCH[2] = atan2f(UV_star_prime[1], UV_star_prime[0]);
  JCH[3] = 0.f;
}

static void xyY_to_dt_UCS_JCH(const pixel_t xyY, const float L_white, pixel_t JCH)
{
  float UV_star_prime[2];
  xyY_to_dt_UCS_UV(xyY, UV_star_prime);
  dt_UCS_LUV_to_JCH(Y_to_dt_UCS_L_star(xyY[2]), L_white, UV_star_prime, JCH);
}

static void dt_UCS_JCH_to_xyY(const pixel_t JCH, const float L_white, pixel_t xyY)
{
  const float L_star = CLAMP(JCH[0] * L_white, 0.f, DT_UCS_L_STAR_UPPER_LIMIT);
  const float M = L_star != 0.f
    ? powf(JCH[1] * L_white / (15.932993652962535f * powf(L_star, 0.6523997524738018f)), 0.8322850678616855f)
    : 0.f;

  const float U_star_prime = M * cosf(JCH[2]);
  const float V_star_prime = M * sinf(JCH[2]);

  const float UV_star[2] = { -5.037522385190711f * U_star_prime - 2.504856328185843f * V_star_prime,
                              4.760029407436461f * U_star_prime + 2.874012963239247f * V_star_prime };

  float UV[2];
  const float factors[2]     = { 1.39656225667f, 1.4513954287f };
  const float half_values[2] = { 1.49217352929f, 1.52488637914f };
  for(int c = 0; c < 2; c++) UV[c] = -half_values[c] * UV_star[c] / (fabsf(UV_star[c]) - factors[c]);

  const float U_factors[3] = {  0.167171472114775f,   -0.150959086409163f,    0.940254742367256f };
  const float V_factors[3] = {  0.141299802443708f,   -0.155185060382272f,    1.000000000000000f };
  const float offsets[3]   = { -0.00801531300850582f, -0.00843312433578007f, -0.0256325967652889f };

  float xyD[3];
  for(int c = 0; c < 3; c++) xyD[c] = U_factors[c] * UV[0] + V_factors[c] * UV[1] + offsets[c];

  const float div = (xyD[2] >= 0.0f) ? MAX(FLT_MIN, xyD[2]) : MIN(-FLT_MIN, xyD[2]);
  xyY[0] = xyD[0] / div;
  xyY[1] = xyD[1] / div;
  xyY[2] = dt_UCS_L_star_to_Y(L_star);
  xyY[3] = 0.f;
}

static void linear_srgb_to_JCH(const pixel_t rgb, const float L_white, pixel_t JCH)
{
  pixel_t XYZ, xyY;
  mat3_apply(srgb_to_xyz_d65, rgb, XYZ);
  dt_D65_XYZ_to_xyY(XYZ, xyY);
  xyY_to_dt_UCS_JCH(xyY, L_white, JCH);
}

static void JCH_to_linear_srgb(const pixel_t JCH, const float L_white, pixel_t rgb)
{
  pixel_t xyY, XYZ;
  dt_UCS_JCH_to_xyY(JCH, L_white, xyY);
  dt_xyY_to_XYZ(xyY, XYZ);
  mat3_apply(xyz_to_srgb_d65, XYZ, rgb);
}

static void dt_UCS_JCH_to_sRGB(const pixel_t JCH, const float L_w, pixel_t sRGB)
{
  pixel_t linear;
  JCH_to_linear_srgb(JCH, L_w, linear);
  for(int c = 0; c < 3; c++)
    sRGB[c] = linear[c] <= 0.0031308f ? 12.92f * linear[c] : 1.055f * powf(linear[c], 1.f / 2.4f) - 0.055f;
  sRGB[3] = 0.f;
}

static void dt_sRGB_to_linear_sRGB(const pixel_t sRGB, pixel_t RGB)
{
  for(int c = 0; c < 3; c++)
    RGB[c] = sRGB[c] <= 0.04045f ? sRGB[c] / 12.92f : powf((sRGB[c] + 0.055f) / (1.0f + 0.055f), 2.4f);
  RGB[3] = 0.f;
}

static float _dt_RGB_2_Hue(const pixel_t RGB, const float max, const float delta)
{
  float hue;
  if(RGB[0] == max)
    hue = (RGB[1] - RGB[2]) / delta;
  else if(RGB[1] == max)
    hue = 2.0f + (RGB[2] - RGB[0]) / delta;
  else
    hue = 4.0f + (RGB[0] - RGB[1]) / delta;
  hue /= 6.0f;
  return hue - floorf(hue);
}

static void dt_RGB_2_HCV(const pixel_t RGB, pixel_t HCV)
{
  const float min = MIN(MIN(RGB[0], RGB[1]), RGB[2]);
  const float max = MAX(MAX(RGB[0], RGB[1]), RGB[2]);
  const float delta = max - min;
  const float V = max;
  float C, H;
  if(fabsf(max) > 1e-6f && fabsf(delta) > 1e-6f)
  {
    C = delta;
    H = _dt_RGB_2_Hue(RGB, max, delta);
  }
  else
  {
    C = 0.0f;
    H = 0.0f;
  }
  HCV[0] = H;
  HCV[1] = C;
  HCV[2] = V;
  HCV[3] = 0.f;
}

/* ---- color_ryb.h ------------------------------------------------------------ */

static const float dt_color_ryb_x_vtx[7] = { 0.f, 1.f/6, 2.f/6, 3.f/6, 4.f/6, 5.f/6, 1.f };
static const float dt_color_ryb_y_vtx[7] = { 0.f, 1.f/3, 0.472217f, 0.611105f, 0.715271f, 5.f/6, 1.f };

static float dt_rgb_hue_to_ryb_hue(const float h)
{
  const float hc = h - floorf(h);
  int i = 0;
  while(i < 5 && hc >= dt_color_ryb_x_vtx[i + 1]) i++;
  const float t = (hc - dt_color_ryb_x_vtx[i]) / (dt_color_ryb_x_vtx[i + 1] - dt_color_ryb_x_vtx[i]);
  return dt_color_ryb_y_vtx[i] + t * (dt_color_ryb_y_vtx[i + 1] - dt_color_ryb_y_vtx[i]);
}

/* ---- color_harmony.h -------------------------------------------------------- */

#define DT_COLOR_HARMONY_N 10

static void dt_color_harmony_get_sector_angles(const int type, const int rotation, float *angles, int *n)
{
  static const struct { int n; float offsets[4]; } table[DT_COLOR_HARMONY_N] = {
    { 0, {  0.f                                          } },
    { 1, {  0.f/12.f                                     } },
    { 3, { -1.f/12.f,  0.f/12.f,  1.f/12.f              } },
    { 4, { -1.f/12.f,  0.f/12.f,  1.f/12.f,  6.f/12.f  } },
    { 2, {  0.f/12.f,  6.f/12.f                         } },
    { 3, {  0.f/12.f,  5.f/12.f,  7.f/12.f              } },
    { 2, { -1.f/12.f,  1.f/12.f                         } },
    { 3, {  0.f/12.f,  4.f/12.f,  8.f/12.f              } },
    { 4, { -1.f/12.f,  1.f/12.f,  5.f/12.f,  7.f/12.f  } },
    { 4, {  0.f/12.f,  3.f/12.f,  6.f/12.f,  9.f/12.f  } },
  };
  if(type <= 0 || type >= DT_COLOR_HARMONY_N) { *n = 0; return; }
  *n = table[type].n;
  const float anchor = rotation / 360.0f;
  for(int i = 0; i < *n; i++)
  {
    float a = table[type].offsets[i] + anchor;
    a -= floorf(a);
    angles[i] = a;
  }
}

/* ---- iop/colorharmonizer.c -------------------------------------------------- */

#define COLORHARMONIZER_HUE_BINS 360
#define COLORHARMONIZER_MAX_NODES 4
#define COLORHARMONIZER_RYB_INVERSE_STEPS 720
#define DT_COLORHARMONIZER_SQUARE 8
#define DT_COLORHARMONIZER_CUSTOM 9

static float s_ucs_to_ryb_lut[COLORHARMONIZER_RYB_INVERSE_STEPS];
static float s_ryb_to_ucs_lut[COLORHARMONIZER_RYB_INVERSE_STEPS];

typedef struct params_t
{
  int rule;
  float anchor_hue;
  float pull_strength;
  float neutral_protection;
  float pull_width;
  float custom_hue[4];
  int num_custom_nodes;
  float node_saturation[4];
} params_t;

static float get_weighted_hue_shift(const float px_hue, const float *nodes, const int num_nodes,
                                    const float pull_width_factor, int *out_winning_idx, float *out_max_weight)
{
  if(num_nodes <= 0)
  {
    if(out_winning_idx) *out_winning_idx = 0;
    if(out_max_weight) *out_max_weight = 0.0f;
    return 0.0f;
  }
  const float sigma = pull_width_factor * 0.5f / (float)num_nodes;
  const float inv_2sigma2 = 1.0f / (2.0f * sigma * sigma);

  float max_w = 0.0f;
  int winning_idx = 0;
  float diff_winning = 0.0f;

  for(int i = 0; i < num_nodes; i++)
  {
    float d = fabsf(px_hue - nodes[i]);
    if(d > 0.5f) d = 1.0f - d;
    const float w = expf(-d * d * inv_2sigma2);
    float diff = nodes[i] - px_hue;
    if(diff > 0.5f) diff -= 1.0f;
    else if(diff < -0.5f) diff += 1.0f;
    if(w > max_w)
    {
      max_w = w;
      winning_idx = i;
      diff_winning = diff;
    }
  }
  if(out_winning_idx) *out_winning_idx = winning_idx;
  if(out_max_weight) *out_max_weight = max_w;
  return diff_winning * max_w;
}

static float wrap_hue(float h)
{
  h = fmodf(h, 1.0f);
  if(h < 0.0f) h += 1.0f;
  return h;
}

static float _hue_lerp(float a, float b, const float t)
{
  if(b - a > 0.5f) b -= 1.0f;
  else if(a - b > 0.5f) a -= 1.0f;
  float r = a + t * (b - a);
  if(r < 0.0f) r += 1.0f;
  return r;
}

static float _ucs_to_ryb_fast(const float ucs)
{
  const float pos = ucs * COLORHARMONIZER_RYB_INVERSE_STEPS;
  const int i0 = (int)pos % COLORHARMONIZER_RYB_INVERSE_STEPS;
  const int i1 = (i0 + 1) % COLORHARMONIZER_RYB_INVERSE_STEPS;
  return _hue_lerp(s_ucs_to_ryb_lut[i0], s_ucs_to_ryb_lut[i1], pos - (int)pos);
}

static float _ryb_to_ucs_fast(const float ryb)
{
  const float pos = ryb * COLORHARMONIZER_RYB_INVERSE_STEPS;
  const int i0 = (int)pos % COLORHARMONIZER_RYB_INVERSE_STEPS;
  const int i1 = (i0 + 1) % COLORHARMONIZER_RYB_INVERSE_STEPS;
  return _hue_lerp(s_ryb_to_ucs_lut[i0], s_ryb_to_ucs_lut[i1], pos - (int)pos);
}

static void get_harmony_nodes(const int rule, const float anchor_hue, const float *custom_hue,
                              const int custom_n, float *nodes, int *num_nodes)
{
  if(rule == DT_COLORHARMONIZER_CUSTOM)
  {
    const int n = CLAMP(custom_n, 1, COLORHARMONIZER_MAX_NODES);
    for(int i = 0; i < n; i++) nodes[i] = custom_hue ? custom_hue[i] : 0.0f;
    *num_nodes = n;
    return;
  }
  const int rotation = (int)roundf(_ucs_to_ryb_fast(anchor_hue) * 360.0f) % 360;
  float node_angles[COLORHARMONIZER_MAX_NODES];
  dt_color_harmony_get_sector_angles(rule + 1, rotation, node_angles, num_nodes);
  for(int i = 0; i < *num_nodes; i++) nodes[i] = _ryb_to_ucs_fast(node_angles[i]);
}

static float _find_max_chroma(const float hue)
{
  const float L_white = Y_to_dt_UCS_L_star(1.0f);
  const float H = hue * DT_2PI_F - M_PI_F;
  const float J = 0.65f;
  float C_lo = 0.f, C_hi = 2.f;
  for(int iter = 0; iter < 16; iter++)
  {
    const float C_mid = (C_lo + C_hi) * 0.5f;
    pixel_t JCH = { J, C_mid, H, 0.f };
    pixel_t sRGB;
    dt_UCS_JCH_to_sRGB(JCH, L_white, sRGB);
    if(sRGB[0] >= 0.f && sRGB[1] >= 0.f && sRGB[2] >= 0.f && sRGB[0] <= 1.f && sRGB[1] <= 1.f && sRGB[2] <= 1.f)
      C_lo = C_mid;
    else
      C_hi = C_mid;
  }
  return C_lo;
}

static void _hue_to_srgb(const float hue, float *r, float *g, float *b)
{
  const float L_white = Y_to_dt_UCS_L_star(1.0f);
  const float H = hue * DT_2PI_F - M_PI_F;
  const float J = 0.65f;
  pixel_t JCH = { J, _find_max_chroma(hue) * 0.85f, H, 0.f };
  pixel_t sRGB;
  dt_UCS_JCH_to_sRGB(JCH, L_white, sRGB);
  *r = CLAMP(sRGB[0], 0.f, 1.f);
  *g = CLAMP(sRGB[1], 0.f, 1.f);
  *b = CLAMP(sRGB[2], 0.f, 1.f);
}

static float _ucs_hue_to_ryb_hue(const float ucs_hue)
{
  float r, g, b;
  _hue_to_srgb(ucs_hue, &r, &g, &b);
  const pixel_t srgb = { r, g, b, 0.f };
  pixel_t lrgb, HCV;
  dt_sRGB_to_linear_sRGB(srgb, lrgb);
  dt_RGB_2_HCV(lrgb, HCV);
  return dt_rgb_hue_to_ryb_hue(HCV[0]);
}

static void _build_hue_luts(void)
{
  for(int i = 0; i < COLORHARMONIZER_RYB_INVERSE_STEPS; i++)
    s_ucs_to_ryb_lut[i] = _ucs_hue_to_ryb_hue(i / (float)COLORHARMONIZER_RYB_INVERSE_STEPS);

  for(int j = 0; j < COLORHARMONIZER_RYB_INVERSE_STEPS; j++)
  {
    const float target = j / (float)COLORHARMONIZER_RYB_INVERSE_STEPS;
    float best_dist = 1.0f, best_ucs = 0.0f;
    for(int i = 0; i < COLORHARMONIZER_RYB_INVERSE_STEPS; i++)
    {
      float d = fabsf(s_ucs_to_ryb_lut[i] - target);
      if(d > 0.5f) d = 1.0f - d;
      if(d < best_dist) { best_dist = d; best_ucs = i / (float)COLORHARMONIZER_RYB_INVERSE_STEPS; }
    }
    s_ryb_to_ucs_lut[j] = best_ucs;
  }
}

/* The fused (smoothing == 0) branch of process(), one pixel. */
static void process_pixel(const pixel_t in, const params_t *p, const float *nodes, const int num_nodes, pixel_t out)
{
  const float L_white = Y_to_dt_UCS_L_star(1.0f);
  const float np_t = p->neutral_protection;
  const float cutoff = np_t * np_t * np_t * 0.03f;

  const pixel_t px_rgb = { MAX(in[0], 0.0f), MAX(in[1], 0.0f), MAX(in[2], 0.0f), 0.0f };
  pixel_t px_JCH;
  linear_srgb_to_JCH(px_rgb, L_white, px_JCH);

  const float hue = (px_JCH[2] + M_PI_F) / DT_2PI_F;
  const float chroma = px_JCH[1];

  int winning_idx = 0;
  float max_weight = 0.0f;
  const float hue_shift = get_weighted_hue_shift(hue, nodes, num_nodes, p->pull_width, &winning_idx, &max_weight);
  const float sat_delta = (p->node_saturation[winning_idx] - 1.0f) * max_weight;
  const float chroma_weight = chroma / (chroma + cutoff + 1e-5f);

  px_JCH[2] = wrap_hue(hue + hue_shift * p->pull_strength * chroma_weight) * DT_2PI_F - M_PI_F;
  px_JCH[1] = MAX(chroma * (1.0f + sat_delta * chroma_weight), 0.0f);

  JCH_to_linear_srgb(px_JCH, L_white, out);
}

static float _score_harmony(const float *histo, const int num_bins, const int rule, const float anchor_hue)
{
  float nodes[COLORHARMONIZER_MAX_NODES];
  int num_nodes = 1;
  get_harmony_nodes(rule, anchor_hue, NULL, COLORHARMONIZER_MAX_NODES, nodes, &num_nodes);
  if(num_nodes <= 0) return 0.0f;
  const float sigma = 0.5f / (float)num_nodes;
  const float inv_2sigma2 = 1.0f / (2.0f * sigma * sigma);
  float total = 0.0f, covered = 0.0f;
  for(int b = 0; b < num_bins; b++)
  {
    if(histo[b] <= 0.0f) continue;
    const float h = (b + 0.5f) / (float)num_bins;
    float max_w = 0.0f;
    for(int i = 0; i < num_nodes; i++)
    {
      float d = fabsf(h - nodes[i]);
      if(d > 0.5f) d = 1.0f - d;
      const float w = expf(-d * d * inv_2sigma2);
      if(w > max_w) max_w = w;
    }
    covered += histo[b] * max_w;
    total += histo[b];
  }
  return (total > 1e-6f) ? (covered / total) : 0.0f;
}

static void _auto_detect_harmony(const float *histo, const int num_bins, int *best_rule, float *best_anchor)
{
  float smooth[COLORHARMONIZER_HUE_BINS];
  memcpy(smooth, histo, num_bins * sizeof(float));
  for(int pass = 0; pass < 3; pass++)
  {
    float tmp[COLORHARMONIZER_HUE_BINS];
    for(int b = 0; b < num_bins; b++)
    {
      const int prev = (b - 1 + num_bins) % num_bins;
      const int next = (b + 1) % num_bins;
      tmp[b] = (smooth[prev] + smooth[b] + smooth[next]) * (1.0f / 3.0f);
    }
    memcpy(smooth, tmp, num_bins * sizeof(float));
  }
  float best_score = -1.0f;
  *best_rule = 3;
  *best_anchor = 0.0f;
  const int num_rules = DT_COLORHARMONIZER_SQUARE + 1;
  const int num_steps = 360;
  for(int r = 0; r < num_rules; r++)
    for(int a = 0; a < num_steps; a++)
    {
      const float anchor = (float)a / (float)num_steps;
      const float score = _score_harmony(smooth, num_bins, r, anchor);
      if(score > best_score)
      {
        best_score = score;
        *best_rule = r;
        *best_anchor = anchor;
      }
    }
}

/* ---- vector generation --------------------------------------------------- */

static void hsv_to_rgb(float h, float s, float v, pixel_t rgb)
{
  const float C = s * v;
  const float m = v - C;
  const float hh = h * 6.0f;
  const float i = floorf(hh);
  const float f = hh - i;
  const float fc = f * C;
  const float top = C + m, dec = C - fc + m, inc = fc + m;
  switch((int)i % 6)
  {
    case 0: rgb[0] = top; rgb[1] = inc; rgb[2] = m; break;
    case 1: rgb[0] = dec; rgb[1] = top; rgb[2] = m; break;
    case 2: rgb[0] = m; rgb[1] = top; rgb[2] = inc; break;
    case 3: rgb[0] = m; rgb[1] = dec; rgb[2] = top; break;
    case 4: rgb[0] = inc; rgb[1] = m; rgb[2] = top; break;
    default: rgb[0] = top; rgb[1] = m; rgb[2] = dec; break;
  }
  rgb[3] = 0.f;
}

#define N_COLOURS 42
static pixel_t colours[N_COLOURS];

static void build_colours(void)
{
  int k = 0;
  for(int i = 0; i < 24; i++) hsv_to_rgb(i / 24.0f, 0.8f, 0.6f, colours[k++]);
  for(int i = 0; i < 8; i++) hsv_to_rgb(i / 8.0f + 0.02f, 0.1f, 0.3f, colours[k++]);
  const float fixed[10][3] = {
    { 1, 0, 0 }, { 0, 1, 0 }, { 0, 0, 1 }, { 0, 1, 1 }, { 1, 0, 1 }, { 1, 1, 0 },
    { 0.18f, 0.18f, 0.18f }, { 0, 0, 0 }, { 2.5f, 1.2f, 0.3f }, { 1e-4f, 2e-4f, 3e-4f },
  };
  for(int i = 0; i < 10; i++)
  {
    colours[k][0] = fixed[i][0]; colours[k][1] = fixed[i][1]; colours[k][2] = fixed[i][2]; colours[k][3] = 0.f;
    k++;
  }
}

static const params_t PARAM_SETS[5] = {
  { 3, 0.1f, 1.0f, 0.5f, 1.0f, { 0, 0.25f, 0.5f, 0.75f }, 4, { 1, 1, 1, 1 } },
  { 6, 0.55f, 0.5f, 0.2f, 0.6f, { 0, 0.25f, 0.5f, 0.75f }, 4, { 1.5f, 0.5f, 1.0f, 1.0f } },
  { 2, 0.3f, 0.8f, 0.9f, 2.5f, { 0, 0.25f, 0.5f, 0.75f }, 4, { 1, 1, 1, 1 } },
  { 9, 0.0f, 0.7f, 0.5f, 1.0f, { 0.05f, 0.4f, 0.7f, 0.0f }, 3, { 0.2f, 1.3f, 0.9f, 1.0f } },
  { 0, 0.9f, 1.0f, 0.0f, 4.0f, { 0, 0.25f, 0.5f, 0.75f }, 4, { 1, 1, 1, 1 } },
};

static void print_f(float v) { printf("%.9g", v); }
static void print_vec(const float *v, int n)
{
  printf("[");
  for(int i = 0; i < n; i++) { if(i) printf(","); print_f(v[i]); }
  printf("]");
}

static void print_params(const params_t *p)
{
  printf("{\"rule\":%d,\"anchor\":", p->rule); print_f(p->anchor_hue);
  printf(",\"pull\":"); print_f(p->pull_strength);
  printf(",\"neutral\":"); print_f(p->neutral_protection);
  printf(",\"width\":"); print_f(p->pull_width);
  printf(",\"customHues\":"); print_vec(p->custom_hue, 4);
  printf(",\"customNodes\":%d,\"nodeSat\":", p->num_custom_nodes); print_vec(p->node_saturation, 4);
  printf("}");
}

static unsigned int lcg_state = 12345u;
static float lcg(void)
{
  lcg_state = lcg_state * 1664525u + 1013904223u;
  return (lcg_state >> 8) / 16777216.0f;
}

int main(void)
{
  _build_hue_luts();
  build_colours();
  const float L_white = Y_to_dt_UCS_L_star(1.0f);

  printf("{\n\"lWhite\":"); print_f(L_white);

  printf(",\n\"ucs\":[");
  for(int i = 0; i < N_COLOURS; i++)
  {
    pixel_t rgb = { MAX(colours[i][0], 0.f), MAX(colours[i][1], 0.f), MAX(colours[i][2], 0.f), 0.f };
    pixel_t JCH, back;
    linear_srgb_to_JCH(rgb, L_white, JCH);
    JCH_to_linear_srgb(JCH, L_white, back);
    if(i) printf(",");
    printf("\n{\"rgb\":"); print_vec(rgb, 3);
    printf(",\"jch\":"); print_vec(JCH, 3);
    printf(",\"back\":"); print_vec(back, 3);
    printf("}");
  }
  printf("]");

  printf(",\n\"swatches\":[");
  for(int i = 0; i < 36; i++)
  {
    const float hue = i / 36.0f;
    float r, g, b;
    _hue_to_srgb(hue, &r, &g, &b);
    const float sw[3] = { r, g, b };
    if(i) printf(",");
    printf("\n{\"hue\":"); print_f(hue);
    printf(",\"maxChroma\":"); print_f(_find_max_chroma(hue));
    printf(",\"srgb\":"); print_vec(sw, 3);
    printf(",\"rybHue\":"); print_f(_ucs_hue_to_ryb_hue(hue));
    printf("}");
  }
  printf("]");

  printf(",\n\"lut\":{\"ucsToRyb\":"); print_vec(s_ucs_to_ryb_lut, COLORHARMONIZER_RYB_INVERSE_STEPS);
  printf(",\"rybToUcs\":"); print_vec(s_ryb_to_ucs_lut, COLORHARMONIZER_RYB_INVERSE_STEPS);
  printf("}");

  printf(",\n\"nodes\":[");
  {
    const float anchors[6] = { 0.0f, 0.1f, 0.37f, 0.5f, 0.83f, 0.999f };
    int first = 1;
    for(int rule = 0; rule <= DT_COLORHARMONIZER_SQUARE; rule++)
      for(int a = 0; a < 6; a++)
      {
        float nodes[4]; int n = 0;
        get_harmony_nodes(rule, anchors[a], NULL, 0, nodes, &n);
        if(!first) printf(","); first = 0;
        printf("\n{\"rule\":%d,\"anchor\":", rule); print_f(anchors[a]);
        printf(",\"count\":%d,\"nodes\":", n); print_vec(nodes, n);
        printf("}");
      }
    const float customs[3][4] = { { 0.1f, 0.6f, 0.0f, 0.0f }, { 0.05f, 0.4f, 0.7f, 0.0f }, { 0.9f, 0.2f, 0.5f, 0.75f } };
    for(int c = 0; c < 3; c++)
    {
      float nodes[4]; int n = 0;
      get_harmony_nodes(DT_COLORHARMONIZER_CUSTOM, 0.f, customs[c], c + 2, nodes, &n);
      printf(",\n{\"rule\":9,\"anchor\":0,\"customHues\":"); print_vec(customs[c], 4);
      printf(",\"customNodes\":%d,\"count\":%d,\"nodes\":", c + 2, n); print_vec(nodes, n);
      printf("}");
    }
  }
  printf("]");

  printf(",\n\"shifts\":[");
  for(int i = 0; i < 30; i++)
  {
    const int n = 1 + (i % 4);
    float nodes[4];
    for(int k = 0; k < n; k++) nodes[k] = lcg();
    const float hue = lcg();
    const float width = 0.25f + 3.75f * lcg();
    int wi = 0; float mw = 0.f;
    const float shift = get_weighted_hue_shift(hue, nodes, n, width, &wi, &mw);
    if(i) printf(",");
    printf("\n{\"hue\":"); print_f(hue);
    printf(",\"nodes\":"); print_vec(nodes, n);
    printf(",\"width\":"); print_f(width);
    printf(",\"shift\":"); print_f(shift);
    printf(",\"winner\":%d,\"weight\":", wi); print_f(mw);
    printf("}");
  }
  printf("]");

  printf(",\n\"pixels\":[");
  {
    int first = 1;
    for(int s = 0; s < 5; s++)
    {
      const params_t *p = &PARAM_SETS[s];
      float nodes[4]; int n = 0;
      get_harmony_nodes(p->rule, p->anchor_hue, p->custom_hue, p->num_custom_nodes, nodes, &n);
      for(int i = 0; i < N_COLOURS; i++)
      {
        pixel_t out;
        process_pixel(colours[i], p, nodes, n, out);
        if(!first) printf(","); first = 0;
        printf("\n{\"set\":%d,\"rgb\":", s); print_vec(colours[i], 3);
        printf(",\"out\":"); print_vec(out, 3);
        printf("}");
      }
    }
  }
  printf("],\n\"paramSets\":[");
  for(int s = 0; s < 5; s++) { if(s) printf(","); print_params(&PARAM_SETS[s]); }
  printf("]");

  printf(",\n\"infer\":[");
  {
    float histos[3][COLORHARMONIZER_HUE_BINS];
    for(int b = 0; b < COLORHARMONIZER_HUE_BINS; b++)
    {
      const float h = (b + 0.5f) / 360.0f;
      float d1 = fabsf(h - 0.15f); if(d1 > 0.5f) d1 = 1.f - d1;
      float d2 = fabsf(h - 0.65f); if(d2 > 0.5f) d2 = 1.f - d2;
      histos[0][b] = expf(-d1 * d1 * 800.f) + 0.6f * expf(-d2 * d2 * 800.f);
      float e1 = fabsf(h - 0.05f); if(e1 > 0.5f) e1 = 1.f - e1;
      float e2 = fabsf(h - 0.38f); if(e2 > 0.5f) e2 = 1.f - e2;
      float e3 = fabsf(h - 0.72f); if(e3 > 0.5f) e3 = 1.f - e3;
      histos[1][b] = expf(-e1 * e1 * 1200.f) + 0.8f * expf(-e2 * e2 * 1200.f) + 0.7f * expf(-e3 * e3 * 1200.f);
      histos[2][b] = 0.2f + lcg();
    }
    for(int k = 0; k < 3; k++)
    {
      int rule = 0; float anchor = 0.f;
      _auto_detect_harmony(histos[k], COLORHARMONIZER_HUE_BINS, &rule, &anchor);
      if(k) printf(",");
      printf("\n{\"histogram\":"); print_vec(histos[k], COLORHARMONIZER_HUE_BINS);
      printf(",\"rule\":%d,\"anchor\":", rule); print_f(anchor);
      printf(",\"score\":"); print_f(_score_harmony(histos[k], COLORHARMONIZER_HUE_BINS, rule, anchor));
      printf("}");
    }
  }
  printf("]\n}\n");
  return 0;
}
