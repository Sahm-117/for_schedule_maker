// Single source of truth for applying a user's accent colour at runtime.
// Writes RGB-channel CSS variables so Tailwind's opacity modifiers work
// (primary = rgb(var(--color-primary-rgb) / <alpha-value>)).

export const DEFAULT_THEME = '#ff914d';

// Parse a hex string to [r,g,b]. Handles #rgb shorthand, #rrggbb, and a leading
// '#' that may be missing. Returns null for anything malformed.
const parseHex = (input: string): [number, number, number] | null => {
  let hex = input.trim().replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((ch) => ch + ch).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const n = parseInt(hex, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

// Darken a colour by `amount` (0–1) → "r g b" channel string.
const shadeChannels = (rgb: [number, number, number], amount: number) =>
  rgb.map((c) => clamp(c * (1 - amount))).join(' ');

// Blend a colour toward white by `1 - opacity` → "r g b" channel string (pastel tint).
const softChannels = (rgb: [number, number, number], opacity: number) =>
  rgb.map((c) => clamp(c * opacity + 255 * (1 - opacity))).join(' ');

const channels = (rgb: [number, number, number]) => rgb.join(' ');

/**
 * Apply an accent colour to the document. Sets the primary channel var plus
 * darker and pastel-tint channel vars. Falls back to the default orange when
 * the colour is missing or malformed.
 */
export const applyTheme = (color?: string | null) => {
  const rgb = (color && parseHex(color)) || parseHex(DEFAULT_THEME)!;
  const root = document.documentElement.style;
  root.setProperty('--color-primary-rgb', channels(rgb));
  root.setProperty('--color-primary', `rgb(${channels(rgb)})`);
  root.setProperty('--color-primary-dark-rgb', shadeChannels(rgb, 0.15));
  root.setProperty('--color-primary-dark', `rgb(${shadeChannels(rgb, 0.15)})`);
  root.setProperty('--color-primary-soft-rgb', softChannels(rgb, 0.12));
  root.setProperty('--color-primary-soft', `rgb(${softChannels(rgb, 0.12)})`);
  root.setProperty('--color-primary-50-rgb', softChannels(rgb, 0.18));
  root.setProperty('--color-primary-50', `rgb(${softChannels(rgb, 0.18)})`);
  root.setProperty('--color-primary-100-rgb', softChannels(rgb, 0.30));
  root.setProperty('--color-primary-100', `rgb(${softChannels(rgb, 0.30)})`);
  root.setProperty('--color-primary-200-rgb', softChannels(rgb, 0.45));
  root.setProperty('--color-primary-200', `rgb(${softChannels(rgb, 0.45)})`);
};

/** Reset back to the default orange (e.g. on logout / login screen). */
export const resetTheme = () => applyTheme(DEFAULT_THEME);
