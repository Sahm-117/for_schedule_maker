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

// Simple luminance-based contrast pick.
export const getContrastingTextColor = (hexColor: string): '#000000' | '#FFFFFF' => {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return '#000000';
  const [r, g, b] = rgb.map((c) => c / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
};

