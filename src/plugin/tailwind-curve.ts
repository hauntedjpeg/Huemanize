import { oklch, formatHex, parse } from 'culori'
import { SCALE_STEPS, type ScaleStep, type ScaleEntry, type CurveType } from '../ui/types'

/**
 * Tailwind v4 inspired curve family. Three modes:
 *  - tailwind-reference: pick the nearest-hue Tailwind reference scale and re-anchor it.
 *  - tailwind-parametric: derive lightness/chroma/hue from closed-form formulas.
 *  - tailwind-hybrid: parametric envelope modulated by per-hue-band tables.
 *
 * All three ignore the user's anchor step. The input is auto-placed at whichever
 * step its lightness best matches in the Tailwind ladder, then the rest of the
 * scale is built around it. Step 925 (Huemanize-only) is inserted as the
 * midpoint of 900 and 950 in OKLCH after the 11-step Tailwind scale is built.
 */

const TAILWIND_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
type TwStep = (typeof TAILWIND_STEPS)[number]

// Average lightness of the chromatic Tailwind references at each step.
// Used for auto-anchor placement.
const TAILWIND_BASE_LIGHTNESS: Record<TwStep, number> = {
  50:  0.975,
  100: 0.953,
  200: 0.910,
  300: 0.846,
  400: 0.748,
  500: 0.661,
  600: 0.572,
  700: 0.503,
  800: 0.443,
  900: 0.391,
  950: 0.276,
}

// ────────────────────────────────────────────────────────────────────────────
// Reference scales (Tailwind v4 + v4.2)
// Source: tailwindcss.com palette. Lightness in 0..1, chroma in 0..~0.3, hue in degrees.
// ────────────────────────────────────────────────────────────────────────────

interface RefStep { l: number; c: number; h: number }
type RefScale = Record<TwStep, RefStep>

const REFERENCE_SCALES: Record<string, RefScale> = {
  slate: {
    50:  { l: 0.984, c: 0.003, h: 247.858 },
    100: { l: 0.968, c: 0.007, h: 247.896 },
    200: { l: 0.929, c: 0.013, h: 255.508 },
    300: { l: 0.869, c: 0.022, h: 252.894 },
    400: { l: 0.704, c: 0.040, h: 256.788 },
    500: { l: 0.554, c: 0.046, h: 257.417 },
    600: { l: 0.446, c: 0.043, h: 257.281 },
    700: { l: 0.372, c: 0.044, h: 257.287 },
    800: { l: 0.279, c: 0.041, h: 260.031 },
    900: { l: 0.208, c: 0.042, h: 265.755 },
    950: { l: 0.129, c: 0.042, h: 264.695 },
  },
  gray: {
    50:  { l: 0.985, c: 0.002, h: 247.839 },
    100: { l: 0.967, c: 0.003, h: 264.542 },
    200: { l: 0.928, c: 0.006, h: 264.531 },
    300: { l: 0.872, c: 0.010, h: 258.338 },
    400: { l: 0.707, c: 0.022, h: 261.325 },
    500: { l: 0.551, c: 0.027, h: 264.364 },
    600: { l: 0.446, c: 0.030, h: 256.802 },
    700: { l: 0.373, c: 0.034, h: 259.733 },
    800: { l: 0.278, c: 0.033, h: 256.848 },
    900: { l: 0.210, c: 0.034, h: 264.665 },
    950: { l: 0.130, c: 0.028, h: 261.692 },
  },
  zinc: {
    50:  { l: 0.985, c: 0.000, h: 0 },
    100: { l: 0.967, c: 0.001, h: 286.375 },
    200: { l: 0.920, c: 0.004, h: 286.320 },
    300: { l: 0.871, c: 0.006, h: 286.286 },
    400: { l: 0.705, c: 0.015, h: 286.067 },
    500: { l: 0.552, c: 0.016, h: 285.938 },
    600: { l: 0.442, c: 0.017, h: 285.786 },
    700: { l: 0.370, c: 0.013, h: 285.805 },
    800: { l: 0.274, c: 0.006, h: 286.033 },
    900: { l: 0.210, c: 0.006, h: 285.885 },
    950: { l: 0.141, c: 0.005, h: 285.823 },
  },
  neutral: {
    50:  { l: 0.985, c: 0.000, h: 0 },
    100: { l: 0.970, c: 0.000, h: 0 },
    200: { l: 0.922, c: 0.000, h: 0 },
    300: { l: 0.870, c: 0.000, h: 0 },
    400: { l: 0.708, c: 0.000, h: 0 },
    500: { l: 0.556, c: 0.000, h: 0 },
    600: { l: 0.439, c: 0.000, h: 0 },
    700: { l: 0.371, c: 0.000, h: 0 },
    800: { l: 0.269, c: 0.000, h: 0 },
    900: { l: 0.205, c: 0.000, h: 0 },
    950: { l: 0.145, c: 0.000, h: 0 },
  },
  stone: {
    50:  { l: 0.985, c: 0.001, h: 106.423 },
    100: { l: 0.970, c: 0.001, h: 106.424 },
    200: { l: 0.923, c: 0.003, h:  48.717 },
    300: { l: 0.869, c: 0.005, h:  56.366 },
    400: { l: 0.709, c: 0.010, h:  56.259 },
    500: { l: 0.553, c: 0.013, h:  58.071 },
    600: { l: 0.444, c: 0.011, h:  73.639 },
    700: { l: 0.374, c: 0.010, h:  67.558 },
    800: { l: 0.268, c: 0.007, h:  34.298 },
    900: { l: 0.216, c: 0.006, h:  56.043 },
    950: { l: 0.147, c: 0.004, h:  49.250 },
  },
  mauve: {
    50:  { l: 0.985, c: 0.000, h: 0 },
    100: { l: 0.960, c: 0.003, h: 325.600 },
    200: { l: 0.922, c: 0.005, h: 325.620 },
    300: { l: 0.865, c: 0.012, h: 325.680 },
    400: { l: 0.711, c: 0.019, h: 323.020 },
    500: { l: 0.542, c: 0.034, h: 322.500 },
    600: { l: 0.435, c: 0.029, h: 321.780 },
    700: { l: 0.364, c: 0.029, h: 323.890 },
    800: { l: 0.263, c: 0.024, h: 320.120 },
    900: { l: 0.212, c: 0.019, h: 322.120 },
    950: { l: 0.145, c: 0.008, h: 326.000 },
  },
  olive: {
    50:  { l: 0.988, c: 0.003, h: 106.500 },
    100: { l: 0.966, c: 0.005, h: 106.500 },
    200: { l: 0.930, c: 0.007, h: 106.500 },
    300: { l: 0.880, c: 0.011, h: 106.600 },
    400: { l: 0.737, c: 0.021, h: 106.900 },
    500: { l: 0.580, c: 0.031, h: 107.300 },
    600: { l: 0.466, c: 0.025, h: 107.300 },
    700: { l: 0.394, c: 0.023, h: 107.400 },
    800: { l: 0.286, c: 0.016, h: 107.400 },
    900: { l: 0.228, c: 0.013, h: 107.400 },
    950: { l: 0.153, c: 0.006, h: 107.100 },
  },
  mist: {
    50:  { l: 0.987, c: 0.002, h: 197.100 },
    100: { l: 0.963, c: 0.002, h: 197.100 },
    200: { l: 0.925, c: 0.005, h: 214.300 },
    300: { l: 0.872, c: 0.007, h: 219.600 },
    400: { l: 0.723, c: 0.014, h: 214.400 },
    500: { l: 0.560, c: 0.021, h: 213.500 },
    600: { l: 0.450, c: 0.017, h: 213.200 },
    700: { l: 0.378, c: 0.015, h: 216.000 },
    800: { l: 0.275, c: 0.011, h: 216.900 },
    900: { l: 0.218, c: 0.008, h: 223.900 },
    950: { l: 0.148, c: 0.004, h: 228.800 },
  },
  taupe: {
    50:  { l: 0.986, c: 0.002, h:  67.800 },
    100: { l: 0.960, c: 0.002, h:  17.200 },
    200: { l: 0.922, c: 0.005, h:  34.300 },
    300: { l: 0.868, c: 0.007, h:  39.500 },
    400: { l: 0.714, c: 0.014, h:  41.200 },
    500: { l: 0.547, c: 0.021, h:  43.100 },
    600: { l: 0.438, c: 0.017, h:  39.300 },
    700: { l: 0.367, c: 0.016, h:  35.700 },
    800: { l: 0.268, c: 0.011, h:  36.500 },
    900: { l: 0.214, c: 0.009, h:  43.100 },
    950: { l: 0.147, c: 0.004, h:  49.300 },
  },
  red: {
    50:  { l: 0.971, c: 0.013, h: 17.380 },
    100: { l: 0.936, c: 0.032, h: 17.717 },
    200: { l: 0.885, c: 0.062, h: 18.334 },
    300: { l: 0.808, c: 0.114, h: 19.571 },
    400: { l: 0.704, c: 0.191, h: 22.216 },
    500: { l: 0.637, c: 0.237, h: 25.331 },
    600: { l: 0.577, c: 0.245, h: 27.325 },
    700: { l: 0.505, c: 0.213, h: 27.518 },
    800: { l: 0.444, c: 0.177, h: 26.899 },
    900: { l: 0.396, c: 0.141, h: 25.723 },
    950: { l: 0.258, c: 0.092, h: 26.042 },
  },
  orange: {
    50:  { l: 0.980, c: 0.016, h: 73.684 },
    100: { l: 0.954, c: 0.038, h: 75.164 },
    200: { l: 0.901, c: 0.076, h: 70.697 },
    300: { l: 0.837, c: 0.128, h: 66.290 },
    400: { l: 0.750, c: 0.183, h: 55.934 },
    500: { l: 0.705, c: 0.213, h: 47.604 },
    600: { l: 0.646, c: 0.222, h: 41.116 },
    700: { l: 0.553, c: 0.195, h: 38.402 },
    800: { l: 0.470, c: 0.157, h: 37.304 },
    900: { l: 0.408, c: 0.123, h: 38.172 },
    950: { l: 0.266, c: 0.079, h: 36.259 },
  },
  amber: {
    50:  { l: 0.987, c: 0.022, h: 95.277 },
    100: { l: 0.962, c: 0.059, h: 95.617 },
    200: { l: 0.924, c: 0.120, h: 95.746 },
    300: { l: 0.879, c: 0.169, h: 91.605 },
    400: { l: 0.828, c: 0.189, h: 84.429 },
    500: { l: 0.769, c: 0.188, h: 70.080 },
    600: { l: 0.666, c: 0.179, h: 58.318 },
    700: { l: 0.555, c: 0.163, h: 48.998 },
    800: { l: 0.473, c: 0.137, h: 46.201 },
    900: { l: 0.414, c: 0.112, h: 45.904 },
    950: { l: 0.279, c: 0.077, h: 45.635 },
  },
  yellow: {
    50:  { l: 0.987, c: 0.026, h: 102.212 },
    100: { l: 0.973, c: 0.071, h: 103.193 },
    200: { l: 0.945, c: 0.129, h: 101.540 },
    300: { l: 0.905, c: 0.182, h:  98.111 },
    400: { l: 0.852, c: 0.199, h:  91.936 },
    500: { l: 0.795, c: 0.184, h:  86.047 },
    600: { l: 0.681, c: 0.162, h:  75.834 },
    700: { l: 0.554, c: 0.135, h:  66.442 },
    800: { l: 0.476, c: 0.114, h:  61.907 },
    900: { l: 0.421, c: 0.095, h:  57.708 },
    950: { l: 0.286, c: 0.066, h:  53.813 },
  },
  lime: {
    50:  { l: 0.986, c: 0.031, h: 120.757 },
    100: { l: 0.967, c: 0.067, h: 122.328 },
    200: { l: 0.938, c: 0.127, h: 124.321 },
    300: { l: 0.897, c: 0.196, h: 126.665 },
    400: { l: 0.841, c: 0.238, h: 128.850 },
    500: { l: 0.768, c: 0.233, h: 130.850 },
    600: { l: 0.648, c: 0.200, h: 131.684 },
    700: { l: 0.532, c: 0.157, h: 131.589 },
    800: { l: 0.453, c: 0.124, h: 130.933 },
    900: { l: 0.405, c: 0.101, h: 131.063 },
    950: { l: 0.274, c: 0.072, h: 132.109 },
  },
  green: {
    50:  { l: 0.982, c: 0.018, h: 155.826 },
    100: { l: 0.962, c: 0.044, h: 156.743 },
    200: { l: 0.925, c: 0.084, h: 155.995 },
    300: { l: 0.871, c: 0.150, h: 154.449 },
    400: { l: 0.792, c: 0.209, h: 151.711 },
    500: { l: 0.723, c: 0.219, h: 149.579 },
    600: { l: 0.627, c: 0.194, h: 149.214 },
    700: { l: 0.527, c: 0.154, h: 150.069 },
    800: { l: 0.448, c: 0.119, h: 151.328 },
    900: { l: 0.393, c: 0.095, h: 152.535 },
    950: { l: 0.266, c: 0.065, h: 152.934 },
  },
  emerald: {
    50:  { l: 0.979, c: 0.021, h: 166.113 },
    100: { l: 0.950, c: 0.052, h: 163.051 },
    200: { l: 0.905, c: 0.093, h: 164.150 },
    300: { l: 0.845, c: 0.143, h: 164.978 },
    400: { l: 0.765, c: 0.177, h: 163.223 },
    500: { l: 0.696, c: 0.170, h: 162.480 },
    600: { l: 0.596, c: 0.145, h: 163.225 },
    700: { l: 0.508, c: 0.118, h: 165.612 },
    800: { l: 0.432, c: 0.095, h: 166.913 },
    900: { l: 0.378, c: 0.077, h: 168.940 },
    950: { l: 0.262, c: 0.051, h: 172.552 },
  },
  teal: {
    50:  { l: 0.984, c: 0.014, h: 180.720 },
    100: { l: 0.953, c: 0.051, h: 180.801 },
    200: { l: 0.910, c: 0.096, h: 180.426 },
    300: { l: 0.855, c: 0.138, h: 181.071 },
    400: { l: 0.777, c: 0.152, h: 181.912 },
    500: { l: 0.704, c: 0.140, h: 182.503 },
    600: { l: 0.600, c: 0.118, h: 184.704 },
    700: { l: 0.511, c: 0.096, h: 186.391 },
    800: { l: 0.437, c: 0.078, h: 188.216 },
    900: { l: 0.386, c: 0.063, h: 188.416 },
    950: { l: 0.277, c: 0.046, h: 192.524 },
  },
  cyan: {
    50:  { l: 0.984, c: 0.019, h: 200.873 },
    100: { l: 0.956, c: 0.045, h: 203.388 },
    200: { l: 0.917, c: 0.080, h: 205.041 },
    300: { l: 0.865, c: 0.127, h: 207.078 },
    400: { l: 0.789, c: 0.154, h: 211.530 },
    500: { l: 0.715, c: 0.143, h: 215.221 },
    600: { l: 0.609, c: 0.126, h: 221.723 },
    700: { l: 0.520, c: 0.105, h: 223.128 },
    800: { l: 0.450, c: 0.085, h: 224.283 },
    900: { l: 0.398, c: 0.070, h: 227.392 },
    950: { l: 0.302, c: 0.056, h: 229.695 },
  },
  sky: {
    50:  { l: 0.977, c: 0.013, h: 236.620 },
    100: { l: 0.951, c: 0.026, h: 236.824 },
    200: { l: 0.901, c: 0.058, h: 230.902 },
    300: { l: 0.828, c: 0.111, h: 230.318 },
    400: { l: 0.746, c: 0.160, h: 232.661 },
    500: { l: 0.685, c: 0.169, h: 237.323 },
    600: { l: 0.588, c: 0.158, h: 241.966 },
    700: { l: 0.500, c: 0.134, h: 242.749 },
    800: { l: 0.443, c: 0.110, h: 240.790 },
    900: { l: 0.391, c: 0.090, h: 240.876 },
    950: { l: 0.293, c: 0.066, h: 243.157 },
  },
  blue: {
    50:  { l: 0.970, c: 0.014, h: 254.604 },
    100: { l: 0.932, c: 0.032, h: 255.585 },
    200: { l: 0.882, c: 0.059, h: 254.128 },
    300: { l: 0.809, c: 0.105, h: 251.813 },
    400: { l: 0.707, c: 0.165, h: 254.624 },
    500: { l: 0.623, c: 0.214, h: 259.815 },
    600: { l: 0.546, c: 0.245, h: 262.881 },
    700: { l: 0.488, c: 0.243, h: 264.376 },
    800: { l: 0.424, c: 0.199, h: 265.638 },
    900: { l: 0.379, c: 0.146, h: 265.522 },
    950: { l: 0.282, c: 0.091, h: 267.935 },
  },
  indigo: {
    50:  { l: 0.962, c: 0.018, h: 272.314 },
    100: { l: 0.930, c: 0.034, h: 272.788 },
    200: { l: 0.870, c: 0.065, h: 274.039 },
    300: { l: 0.785, c: 0.115, h: 274.713 },
    400: { l: 0.673, c: 0.182, h: 276.935 },
    500: { l: 0.585, c: 0.233, h: 277.117 },
    600: { l: 0.511, c: 0.262, h: 276.966 },
    700: { l: 0.457, c: 0.240, h: 277.023 },
    800: { l: 0.398, c: 0.195, h: 277.366 },
    900: { l: 0.359, c: 0.144, h: 278.697 },
    950: { l: 0.257, c: 0.090, h: 281.288 },
  },
  violet: {
    50:  { l: 0.969, c: 0.016, h: 293.756 },
    100: { l: 0.943, c: 0.029, h: 294.588 },
    200: { l: 0.894, c: 0.057, h: 293.283 },
    300: { l: 0.811, c: 0.111, h: 293.571 },
    400: { l: 0.702, c: 0.183, h: 293.541 },
    500: { l: 0.606, c: 0.250, h: 292.717 },
    600: { l: 0.541, c: 0.281, h: 293.009 },
    700: { l: 0.491, c: 0.270, h: 292.581 },
    800: { l: 0.432, c: 0.232, h: 292.759 },
    900: { l: 0.380, c: 0.189, h: 293.745 },
    950: { l: 0.283, c: 0.141, h: 291.089 },
  },
  purple: {
    50:  { l: 0.977, c: 0.014, h: 308.299 },
    100: { l: 0.946, c: 0.033, h: 307.174 },
    200: { l: 0.902, c: 0.063, h: 306.703 },
    300: { l: 0.827, c: 0.119, h: 306.383 },
    400: { l: 0.714, c: 0.203, h: 305.504 },
    500: { l: 0.627, c: 0.265, h: 303.900 },
    600: { l: 0.558, c: 0.288, h: 302.321 },
    700: { l: 0.496, c: 0.265, h: 301.924 },
    800: { l: 0.438, c: 0.218, h: 303.724 },
    900: { l: 0.381, c: 0.176, h: 304.987 },
    950: { l: 0.291, c: 0.149, h: 302.717 },
  },
  fuchsia: {
    50:  { l: 0.977, c: 0.017, h: 320.058 },
    100: { l: 0.952, c: 0.037, h: 318.852 },
    200: { l: 0.903, c: 0.076, h: 319.620 },
    300: { l: 0.833, c: 0.145, h: 321.434 },
    400: { l: 0.740, c: 0.238, h: 322.160 },
    500: { l: 0.667, c: 0.295, h: 322.150 },
    600: { l: 0.591, c: 0.293, h: 322.896 },
    700: { l: 0.518, c: 0.253, h: 323.949 },
    800: { l: 0.452, c: 0.211, h: 324.591 },
    900: { l: 0.401, c: 0.170, h: 325.612 },
    950: { l: 0.293, c: 0.136, h: 325.661 },
  },
  pink: {
    50:  { l: 0.971, c: 0.014, h: 343.198 },
    100: { l: 0.948, c: 0.028, h: 342.258 },
    200: { l: 0.899, c: 0.061, h: 343.231 },
    300: { l: 0.823, c: 0.120, h: 346.018 },
    400: { l: 0.718, c: 0.202, h: 349.761 },
    500: { l: 0.656, c: 0.241, h: 354.308 },
    600: { l: 0.592, c: 0.249, h:   0.584 },
    700: { l: 0.525, c: 0.223, h:   3.958 },
    800: { l: 0.459, c: 0.187, h:   3.815 },
    900: { l: 0.408, c: 0.153, h:   2.432 },
    950: { l: 0.284, c: 0.109, h:   3.907 },
  },
  rose: {
    50:  { l: 0.969, c: 0.015, h: 12.422 },
    100: { l: 0.941, c: 0.030, h: 12.580 },
    200: { l: 0.892, c: 0.058, h: 10.001 },
    300: { l: 0.810, c: 0.117, h: 11.638 },
    400: { l: 0.712, c: 0.194, h: 13.428 },
    500: { l: 0.645, c: 0.246, h: 16.439 },
    600: { l: 0.586, c: 0.253, h: 17.585 },
    700: { l: 0.514, c: 0.222, h: 16.935 },
    800: { l: 0.455, c: 0.188, h: 13.697 },
    900: { l: 0.410, c: 0.159, h: 10.272 },
    950: { l: 0.271, c: 0.105, h: 12.094 },
  },
}

const NEUTRAL_NAMES = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'mauve', 'olive', 'mist', 'taupe']
const CHROMATIC_NAMES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']

// ────────────────────────────────────────────────────────────────────────────
// Hue-band tables for the hybrid mode.
// Each band stores the averaged L ladder, normalized C ladder (peak=1), and
// per-step hue offset (degrees, relative to step 500's hue).
// ────────────────────────────────────────────────────────────────────────────

interface HueBand {
  name: string
  hMin: number
  hMax: number
  hCenter: number
  lLadder: Record<TwStep, number>
  cLadder: Record<TwStep, number>
  hOffsets: Record<TwStep, number>
}

const HUE_BANDS: HueBand[] = buildHueBands()

function buildHueBands(): HueBand[] {
  // Each band picks its constituent reference scales by hue.
  const bandDefs: { name: string; hMin: number; hMax: number; hCenter: number; refs: string[] }[] = [
    { name: 'warm-red',    hMin: 330, hMax:  30, hCenter:   5, refs: ['red', 'rose', 'pink'] },
    { name: 'warm-orange', hMin:  30, hMax:  70, hCenter:  50, refs: ['orange', 'amber'] },
    { name: 'warm-yellow', hMin:  70, hMax: 115, hCenter:  95, refs: ['amber', 'yellow', 'lime'] },
    { name: 'green',       hMin: 115, hMax: 185, hCenter: 155, refs: ['lime', 'green', 'emerald', 'teal'] },
    { name: 'cyan-blue',   hMin: 185, hMax: 280, hCenter: 240, refs: ['teal', 'cyan', 'sky', 'blue', 'indigo'] },
    { name: 'magenta',     hMin: 280, hMax: 330, hCenter: 305, refs: ['violet', 'purple', 'fuchsia'] },
  ]

  return bandDefs.map(def => {
    const lLadder = {} as Record<TwStep, number>
    const cLadder = {} as Record<TwStep, number>
    const hOffsets = {} as Record<TwStep, number>

    // Average L per step.
    for (const step of TAILWIND_STEPS) {
      let sum = 0
      for (const r of def.refs) sum += REFERENCE_SCALES[r][step].l
      lLadder[step] = sum / def.refs.length
    }

    // Average C per step, then normalize so peak = 1.
    let cMax = 0
    for (const step of TAILWIND_STEPS) {
      let sum = 0
      for (const r of def.refs) sum += REFERENCE_SCALES[r][step].c
      cLadder[step] = sum / def.refs.length
      if (cLadder[step] > cMax) cMax = cLadder[step]
    }
    if (cMax > 0) for (const step of TAILWIND_STEPS) cLadder[step] /= cMax

    // Average hue offset relative to step 500 of each ref (handles wrap).
    for (const step of TAILWIND_STEPS) {
      let sum = 0
      for (const r of def.refs) {
        sum += signedHueDelta(REFERENCE_SCALES[r][500].h, REFERENCE_SCALES[r][step].h)
      }
      hOffsets[step] = sum / def.refs.length
    }

    return { name: def.name, hMin: def.hMin, hMax: def.hMax, hCenter: def.hCenter, lLadder, cLadder, hOffsets }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Math helpers
// ────────────────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)) }

// Smallest absolute angular distance between two hues (0..180).
function hueDistance(a: number, b: number): number {
  const d = (((a - b) % 360) + 540) % 360 - 180
  return Math.abs(d)
}

// Signed shortest-arc delta from a to b in [-180, 180).
function signedHueDelta(a: number, b: number): number {
  return (((b - a) % 360) + 540) % 360 - 180
}

function normalizeHue(h: number): number { return ((h % 360) + 360) % 360 }

// Shortest-arc midpoint between two hues.
function midHue(a: number, b: number): number {
  return normalizeHue(a + signedHueDelta(a, b) / 2)
}

// Returns whether the input hue falls inside a (possibly wrapping) band.
function hueInBand(h: number, hMin: number, hMax: number): boolean {
  h = normalizeHue(h)
  if (hMin <= hMax) return h >= hMin && h < hMax
  return h >= hMin || h < hMax
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-anchor: pick the Tailwind step whose base lightness is closest to L.
// Forces step 50 for L > 0.97 and step 950 for L < 0.13.
// ────────────────────────────────────────────────────────────────────────────

function autoAnchorStep(l: number): TwStep {
  if (l > 0.97) return 50
  if (l < 0.13) return 950

  let best: TwStep = 500
  let bestDist = Infinity
  for (const step of TAILWIND_STEPS) {
    const dist = Math.abs(l - TAILWIND_BASE_LIGHTNESS[step])
    if (dist < bestDist) {
      bestDist = dist
      best = step
    }
  }
  return best
}

// ────────────────────────────────────────────────────────────────────────────
// Mode A: tailwind-reference
// Pick the nearest-hue Tailwind reference scale; re-anchor it to the user's
// (Lin, Cin, Hin) at the auto-picked step.
// ────────────────────────────────────────────────────────────────────────────

function pickReference(cIn: number, hIn: number): RefScale {
  const candidates = cIn < 0.02 ? NEUTRAL_NAMES : CHROMATIC_NAMES

  let best = candidates[0]
  let bestDist = Infinity
  for (const name of candidates) {
    const refH = REFERENCE_SCALES[name][500].h
    const refC = REFERENCE_SCALES[name][500].c
    // For neutral candidates with c≈0 (zinc/neutral), hue is meaningless;
    // give them a small fixed distance so they're tied with proper neutrals.
    const dist = refC < 0.005 ? 90 : hueDistance(refH, hIn)
    if (dist < bestDist) {
      bestDist = dist
      best = name
    }
  }
  return REFERENCE_SCALES[best]
}

function generateReference(lIn: number, cIn: number, hIn: number, anchor: TwStep): RefStep[] {
  const ref = pickReference(cIn, hIn)
  const refAnchor = ref[anchor]

  // Endpoint pinning targets (hold the very ends of the reference's L range).
  const lLight = ref[50].l
  const lDark = ref[950].l

  return TAILWIND_STEPS.map(step => {
    const r = ref[step]

    // Lightness: two-segment scale so light end stays near the reference's
    // light end and dark end stays near the reference's dark end, while the
    // anchor step lands exactly on lIn.
    let l: number
    if (step === anchor) {
      l = lIn
    } else if (r.l > refAnchor.l) {
      // Light side
      const denom = lLight - refAnchor.l
      const t = denom === 0 ? 0 : (r.l - refAnchor.l) / denom
      l = lerp(lIn, lLight, t)
    } else {
      // Dark side
      const denom = lDark - refAnchor.l
      const t = denom === 0 ? 0 : (r.l - refAnchor.l) / denom
      l = lerp(lIn, lDark, t)
    }

    // Chroma: scale multiplicatively so anchor lands at cIn.
    let c: number
    if (cIn < 0.005) {
      c = 0
    } else if (refAnchor.c < 0.005) {
      // Achromatic reference at anchor — use the reference's micro-curve as-is,
      // scaled to the user's input chroma.
      c = r.c * (cIn / 0.04)
    } else {
      c = r.c * (cIn / refAnchor.c)
    }

    // Hue: additive torsion from the reference, anchored at user's hue.
    const h = cIn < 0.005 ? 0 : normalizeHue(hIn + signedHueDelta(refAnchor.h, r.h))

    return { l: clamp(l, 0, 1), c: Math.max(0, c), h }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Mode B: tailwind-parametric
// Closed-form lightness ladder + Gaussian chroma envelope + piecewise hue
// torsion. No reference table at runtime.
// ────────────────────────────────────────────────────────────────────────────

const BASE_LADDER: Record<TwStep, number> = TAILWIND_BASE_LIGHTNESS

// Hue offset that biases the whole lightness ladder up for warm hues and down
// for cool hues (yellow ≈ +0.10, indigo ≈ -0.10). Centered at h≈95° (yellow).
function lightnessHueBias(h: number): number {
  return 0.08 * Math.cos(((h - 95) * Math.PI) / 180)
}

// Chroma peak step index by hue (warm peaks earlier, cool peaks later).
function peakIndex(h: number): number {
  // Smooth cosine: ~4 (step 400) at h=85°, ~6 (step 600) at h=265°.
  return 5 + 1.0 * Math.cos(((h - 265) * Math.PI) / 180)
}

// Per-step hue rotation rate (degrees per step away from anchor).
// Warm hues drift toward red as they darken; cool hues drift toward violet.
function hueDriftRate(h: number): number {
  // Sum of two bumps.
  const warm = -3.5 * Math.exp(-Math.pow((h - 95) / 30, 2))   // negative drift, peak at h=95
  const cool =  2.0 * Math.exp(-Math.pow((h - 220) / 40, 2)) // positive drift, peak at h=220
  return warm + cool
}

function generateParametric(lIn: number, cIn: number, hIn: number, anchor: TwStep): RefStep[] {
  const anchorIdx = TAILWIND_STEPS.indexOf(anchor)
  const lBias = lightnessHueBias(hIn)

  // Build a lightness ladder biased by hue, then two-segment-rescaled to pin
  // the anchor at lIn while keeping the end anchors (≈step 50, ≈step 950).
  // Bias only mid-range steps; endpoints stay near white/black so warm and
  // cool inputs both produce a proper light-50 and dark-950.
  const biasedLadder = TAILWIND_STEPS.map((step, i) => {
    const distFromCenter = Math.abs(i - 5) / 5    // 0 at idx 5, 1 at endpoints
    const shaping = 1 - distFromCenter * distFromCenter // parabolic, 1 at center, 0 at ends
    return clamp(BASE_LADDER[step] + lBias * shaping, 0.05, 0.99)
  })
  const lLightEnd = biasedLadder[0]
  const lDarkEnd = biasedLadder[biasedLadder.length - 1]
  const lAnchorBase = biasedLadder[anchorIdx]

  // Gaussian chroma envelope.
  const peak = peakIndex(hIn)
  const sigmaLight = 2.5
  const sigmaDark = 3.0

  function chromaEnvelope(idx: number): number {
    const d = idx - peak
    const sigma = d < 0 ? sigmaLight : sigmaDark
    return Math.exp(-(d * d) / (2 * sigma * sigma))
  }
  const cMax = cIn < 0.005 ? 0 : cIn / chromaEnvelope(anchorIdx)

  const driftRate = hueDriftRate(hIn)

  return TAILWIND_STEPS.map((_step, i) => {
    // Lightness: two-segment scaling.
    let l: number
    if (i === anchorIdx) {
      l = lIn
    } else if (i < anchorIdx) {
      const denom = lLightEnd - lAnchorBase
      const t = denom === 0 ? 0 : (biasedLadder[i] - lAnchorBase) / denom
      l = lerp(lIn, lLightEnd, t)
    } else {
      const denom = lDarkEnd - lAnchorBase
      const t = denom === 0 ? 0 : (biasedLadder[i] - lAnchorBase) / denom
      l = lerp(lIn, lDarkEnd, t)
    }

    // Chroma: Gaussian, with extra falloff at 50/100 and 925/950.
    let c = cMax * chromaEnvelope(i)
    if (i <= 1) c *= 0.55
    if (i >= 9) c *= 0.7

    // Hue: drift accumulates with distance from anchor.
    const dh = driftRate * (i - anchorIdx)
    const h = cIn < 0.005 ? 0 : normalizeHue(hIn + dh)

    return { l: clamp(l, 0, 1), c: Math.max(0, c), h }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Mode C: tailwind-hybrid
// Pick a hue band; use its averaged L ladder, normalized C ladder, and per-
// step hue offsets. Re-anchor like Mode A.
// ────────────────────────────────────────────────────────────────────────────

function pickBand(h: number): HueBand {
  for (const b of HUE_BANDS) {
    if (hueInBand(h, b.hMin, b.hMax)) return b
  }
  // Fallback: nearest band by hue center distance.
  let best = HUE_BANDS[0]
  let bestDist = Infinity
  for (const b of HUE_BANDS) {
    const d = hueDistance(b.hCenter, h)
    if (d < bestDist) { bestDist = d; best = b }
  }
  return best
}

function generateHybrid(lIn: number, cIn: number, hIn: number, anchor: TwStep): RefStep[] {
  const band = pickBand(hIn)
  const anchorIdx = TAILWIND_STEPS.indexOf(anchor)
  const cAnchor = band.cLadder[anchor]
  const cMax = cIn < 0.005 || cAnchor < 0.005 ? 0 : cIn / cAnchor

  const lLightEnd = band.lLadder[50]
  const lDarkEnd = band.lLadder[950]
  const lAnchorBase = band.lLadder[anchor]

  return TAILWIND_STEPS.map((step, i) => {
    let l: number
    if (i === anchorIdx) {
      l = lIn
    } else if (i < anchorIdx) {
      const denom = lLightEnd - lAnchorBase
      const t = denom === 0 ? 0 : (band.lLadder[step] - lAnchorBase) / denom
      l = lerp(lIn, lLightEnd, t)
    } else {
      const denom = lDarkEnd - lAnchorBase
      const t = denom === 0 ? 0 : (band.lLadder[step] - lAnchorBase) / denom
      l = lerp(lIn, lDarkEnd, t)
    }

    const c = cMax * band.cLadder[step]
    const h = cIn < 0.005 ? 0 : normalizeHue(hIn + (band.hOffsets[step] - band.hOffsets[anchor]))

    return { l: clamp(l, 0, 1), c: Math.max(0, c), h }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────────

export function generateTailwindScale(hex: string, mode: CurveType): ScaleEntry[] {
  const parsed = parse(hex)
  if (!parsed) throw new Error('Invalid color')

  const anchor = oklch(parsed)
  if (!anchor) throw new Error('Could not convert to OKLCH')

  const lIn = anchor.l ?? 0.5
  const cIn = anchor.c ?? 0
  const hIn = normalizeHue(anchor.h ?? 0)

  const anchorStep = autoAnchorStep(lIn)

  let elevenStep: RefStep[]
  if (mode === 'tailwind-reference') {
    elevenStep = generateReference(lIn, cIn, hIn, anchorStep)
  } else if (mode === 'tailwind-parametric') {
    elevenStep = generateParametric(lIn, cIn, hIn, anchorStep)
  } else {
    elevenStep = generateHybrid(lIn, cIn, hIn, anchorStep)
  }

  // Insert step 925 between 900 (idx 9) and 950 (idx 10) as their OKLCH midpoint.
  const s900 = elevenStep[9]
  const s950 = elevenStep[10]
  const s925: RefStep = {
    l: (s900.l + s950.l) / 2,
    c: (s900.c + s950.c) / 2,
    h: midHue(s900.h, s950.h),
  }

  // Build the 12-step output in Huemanize's SCALE_STEPS order.
  return SCALE_STEPS.map((step): ScaleEntry => {
    let r: RefStep
    if (step === 925) r = s925
    else r = elevenStep[TAILWIND_STEPS.indexOf(step as TwStep)]

    const hex = formatHex({ mode: 'oklch', l: r.l, c: r.c, h: r.h }) || '#000000'
    return {
      step,
      hex,
      isAnchor: step === (anchorStep as ScaleStep),
    }
  })
}
