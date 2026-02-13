const clampByte = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

export const normalizeHexColor = (input: string): string | null => {
  if (!input) return null;
  const raw = input.trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex.toUpperCase()}`;
};

export const hexToRgb = (hexColor: string): [number, number, number] | null => {
  const hex = normalizeHexColor(hexColor);
  if (!hex) return null;
  const h = hex.slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [clampByte(r), clampByte(g), clampByte(b)];
};

type Lab = [number, number, number];

const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

// D65 reference white
const REF_X = 0.95047;
const REF_Y = 1.0;
const REF_Z = 1.08883;

const rgbToXyz = (rgb: [number, number, number]): [number, number, number] => {
  const [r8, g8, b8] = rgb;
  const r = srgbToLinear(r8);
  const g = srgbToLinear(g8);
  const b = srgbToLinear(b8);

  // sRGB -> XYZ (D65)
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
  return [x, y, z];
};

const fLab = (t: number): number => {
  const delta = 6 / 29;
  return t > Math.pow(delta, 3) ? Math.cbrt(t) : (t / (3 * delta * delta)) + (4 / 29);
};

const xyzToLab = (xyz: [number, number, number]): Lab => {
  const [x, y, z] = xyz;
  const fx = fLab(x / REF_X);
  const fy = fLab(y / REF_Y);
  const fz = fLab(z / REF_Z);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  return [L, a, b];
};

export const hexToLab = (hexColor: string): Lab | null => {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return null;
  return xyzToLab(rgbToXyz(rgb));
};

// CIE76 Delta-E (good enough to block "too similar" picks in UI).
export const deltaE76 = (hexA: string, hexB: string): number | null => {
  const labA = hexToLab(hexA);
  const labB = hexToLab(hexB);
  if (!labA || !labB) return null;
  const dL = labA[0] - labB[0];
  const da = labA[1] - labB[1];
  const db = labA[2] - labB[2];
  return Math.sqrt(dL * dL + da * da + db * db);
};

// Simple luminance-based contrast pick.
export const getContrastingTextColor = (hexColor: string): '#000000' | '#FFFFFF' => {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return '#000000';
  const [r, g, b] = rgb.map((c) => c / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
};
