export type PresetId = 'charcoal' | 'cream' | 'custom';

export type CustomizableColorKey =
  | 'caseColor'
  | 'mainKeyColor'
  | 'subKeyColor'
  | 'accentKeyColor'
  | 'legendColor';

export interface KeyboardAppearance {
  version: 1;
  preset: PresetId;
  caseColor: string;
  mainKeyColor: string;
  subKeyColor: string;
  accentKeyColor: string;
  legendColor: string;
}

export const STORAGE_KEY = 'x87_keyboard_appearance';

// Factory Preset 2: Dark Charcoal & Yellow (Default)
export const PRESET_CHARCOAL: KeyboardAppearance = {
  version: 1,
  preset: 'charcoal',
  caseColor: '#18191c',
  mainKeyColor: '#383b42',
  subKeyColor: '#1c1e23',
  accentKeyColor: '#f5c300',
  legendColor: '#f5eed6',
};

// Factory Preset 1: Retro Cream
export const PRESET_CREAM: KeyboardAppearance = {
  version: 1,
  preset: 'cream',
  caseColor: '#eae5d9',
  mainKeyColor: '#2e2f38',
  subKeyColor: '#f0eee9',
  accentKeyColor: '#bfad97',
  legendColor: '#eceae1',
};

export const DEFAULT_APPEARANCE: KeyboardAppearance = PRESET_CHARCOAL;

export const ACCENT_KEYS = new Set(['Esc', 'Enter', 'Up', 'Space', 'Left', 'Down', 'Right']);

export const SUB_KEYS = new Set([
  'F5', 'F6', 'F7', 'F8',
  'PrtSc', 'ScrLock', 'Pause',
  'Backspace', 'Insert', 'Home', 'PgUp',
  'Tab', 'Delete', 'End', 'PgDn',
  'CapsLock',
  'LShift', 'RShift',
  'LCtrl', 'LWin', 'LAlt', 'RAlt', 'Fn', 'App', 'RCtrl'
]);

export function getKeyType(keyName: string): 'accent' | 'sub' | 'main' {
  if (ACCENT_KEYS.has(keyName)) return 'accent';
  if (SUB_KEYS.has(keyName)) return 'sub';
  return 'main';
}

/* ---------------------------------------------------------------- color utils */

export function isValidHex(hex: string): boolean {
  if (typeof hex !== 'string') return false;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex.trim());
}

export function normalizeHex(hex: string): string {
  if (!isValidHex(hex)) return '#000000';
  const clean = hex.trim();
  if (clean.length === 4) {
    return (
      '#' +
      clean[1] + clean[1] +
      clean[2] + clean[2] +
      clean[3] + clean[3]
    ).toLowerCase();
  }
  return clean.toLowerCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const norm = normalizeHex(hex);
  const num = parseInt(norm.slice(1), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = (v: number) => cl(v).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function adjustLightness(hex: string, deltaPercent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const factor = deltaPercent / 100;
  if (factor >= 0) {
    return rgbToHex(
      r + (255 - r) * factor,
      g + (255 - g) * factor,
      b + (255 - b) * factor,
    );
  } else {
    const mul = 1 + factor;
    return rgbToHex(r * mul, g * mul, b * mul);
  }
}

export function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r / 255, g / 255, b / 255].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

export function getReadableTextColor(
  bgHex: string,
  preferredTextHex?: string,
  minContrast = 3.2,
): string {
  if (preferredTextHex && isValidHex(preferredTextHex)) {
    if (getContrastRatio(bgHex, preferredTextHex) >= minContrast) {
      return normalizeHex(preferredTextHex);
    }
  }
  const lum = getLuminance(bgHex);
  return lum > 0.38 ? '#151619' : '#f5f6f8';
}

/* ------------------------------------------------------------- storage & sanity */

export function sanitizeAppearance(raw: unknown): KeyboardAppearance {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_APPEARANCE };
  }
  const obj = raw as Record<string, unknown>;

  let preset: PresetId = 'charcoal';
  if (obj.preset === 'cream' || obj.preset === 'custom' || obj.preset === 'charcoal') {
    preset = obj.preset;
  }

  const fallback = preset === 'cream' ? PRESET_CREAM : PRESET_CHARCOAL;

  const sanitizeColor = (val: unknown, def: string): string => {
    if (typeof val === 'string' && isValidHex(val)) {
      return normalizeHex(val);
    }
    return def;
  };

  return {
    version: 1,
    preset,
    caseColor: sanitizeColor(obj.caseColor, fallback.caseColor),
    mainKeyColor: sanitizeColor(obj.mainKeyColor, fallback.mainKeyColor),
    subKeyColor: sanitizeColor(obj.subKeyColor, fallback.subKeyColor),
    accentKeyColor: sanitizeColor(obj.accentKeyColor, fallback.accentKeyColor),
    legendColor: sanitizeColor(obj.legendColor, fallback.legendColor),
  };
}

export function loadAppearance(): KeyboardAppearance {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_APPEARANCE };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const parsed = JSON.parse(raw);
    return sanitizeAppearance(parsed);
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(app: KeyboardAppearance): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
  } catch {
    // Gracefully ignore QuotaExceededError, SecurityError, etc.
  }
}

/* ------------------------------------------------------------ palette derivation */

export interface DerivedKeyPalette {
  topGradStart: string;
  topGradMid: string;
  topGradEnd: string;
  skirtGradStart: string;
  skirtGradEnd: string;
  skirtStroke: string;
  dishStroke: string;
  dishHighlight: string;
  legendColor: string;
  secondaryLegendColor: string;
}

export interface DerivedKeyboardPalette {
  caseOuterStart: string;
  caseOuterMid: string;
  caseOuterEnd: string;
  caseBorder: string;
  caseBevelStart: string;
  caseBevelEnd: string;
  plateBgStart: string;
  plateBgEnd: string;
  plateBorder: string;
  plateShadow: string;
  main: DerivedKeyPalette;
  sub: DerivedKeyPalette;
  accent: DerivedKeyPalette;
}

export function deriveKeyPalette(
  baseColor: string,
  preferredLegend: string,
  isAccent = false,
): DerivedKeyPalette {
  const topGradStart = adjustLightness(baseColor, 10);
  const topGradMid = baseColor;
  const topGradEnd = adjustLightness(baseColor, -8);

  const skirtGradStart = adjustLightness(baseColor, -14);
  const skirtGradEnd = adjustLightness(baseColor, -26);

  const skirtStroke = adjustLightness(baseColor, -36);
  const dishStroke = adjustLightness(baseColor, 16);
  const dishHighlight = adjustLightness(baseColor, 28);

  const legendColor = isAccent
    ? getReadableTextColor(baseColor, undefined, 4.0)
    : getReadableTextColor(baseColor, preferredLegend, 3.2);

  const lum = getLuminance(baseColor);
  const secondaryLegendColor = lum > 0.38
    ? adjustLightness(legendColor, 35)
    : adjustLightness(legendColor, -25);

  return {
    topGradStart,
    topGradMid,
    topGradEnd,
    skirtGradStart,
    skirtGradEnd,
    skirtStroke,
    dishStroke,
    dishHighlight,
    legendColor,
    secondaryLegendColor,
  };
}

export function deriveKeyboardPalette(app: KeyboardAppearance): DerivedKeyboardPalette {
  // Handcrafted stops for Retro Cream preset
  if (app.preset === 'cream') {
    return {
      caseOuterStart: '#f0eee7',
      caseOuterMid: '#e3e1d6',
      caseOuterEnd: '#dedbd0',
      caseBorder: '#c4c2b7',
      caseBevelStart: '#ffffff',
      caseBevelEnd: '#d4d1c5',
      plateBgStart: '#23221f',
      plateBgEnd: '#1a1917',
      plateBorder: '#bab8ac',
      plateShadow: '#9e9c90',
      main: {
        topGradStart: '#33353e',
        topGradMid: '#2d2f36',
        topGradEnd: '#292a32',
        skirtGradStart: '#1c1d22',
        skirtGradEnd: '#25262d',
        skirtStroke: '#161514',
        dishStroke: '#3c3a36',
        dishHighlight: '#504e47',
        legendColor: '#ecebe6',
        secondaryLegendColor: '#9a9891',
      },
      sub: {
        topGradStart: '#f8f7f4',
        topGradMid: '#f0eee9',
        topGradEnd: '#e2e0da',
        skirtGradStart: '#d1cfc8',
        skirtGradEnd: '#b8b6ae',
        skirtStroke: '#adaaa2',
        dishStroke: '#fbfbfa',
        dishHighlight: '#ffffff',
        legendColor: '#2b2a28',
        secondaryLegendColor: '#6d6c67',
      },
      accent: {
        topGradStart: '#cdbdab',
        topGradMid: '#bfad97',
        topGradEnd: '#ad9b84',
        skirtGradStart: '#a6947d',
        skirtGradEnd: '#887762',
        skirtStroke: '#83725d',
        dishStroke: '#d8cbba',
        dishHighlight: '#ede4d8',
        legendColor: '#23211e',
        secondaryLegendColor: '#595248',
      },
    };
  }

  // Handcrafted stops for Charcoal & Yellow preset
  if (app.preset === 'charcoal') {
    return {
      caseOuterStart: '#222429',
      caseOuterMid: '#18191c',
      caseOuterEnd: '#131416',
      caseBorder: '#2d3038',
      caseBevelStart: '#343842',
      caseBevelEnd: '#18191c',
      plateBgStart: '#0f1012',
      plateBgEnd: '#090a0b',
      plateBorder: '#262930',
      plateShadow: '#050607',
      main: {
        topGradStart: '#424650',
        topGradMid: '#383b42',
        topGradEnd: '#30333a',
        skirtGradStart: '#27292f',
        skirtGradEnd: '#1d1e22',
        skirtStroke: '#17181c',
        dishStroke: '#4e535e',
        dishHighlight: '#626875',
        legendColor: '#f5eed6',
        secondaryLegendColor: '#ada895',
      },
      sub: {
        topGradStart: '#25272e',
        topGradMid: '#1c1e23',
        topGradEnd: '#15161a',
        skirtGradStart: '#16171b',
        skirtGradEnd: '#0f1012',
        skirtStroke: '#0b0c0d',
        dishStroke: '#2c2e37',
        dishHighlight: '#3c3f4c',
        legendColor: '#c8cbd2',
        secondaryLegendColor: '#787d89',
      },
      accent: {
        topGradStart: '#ffce1a',
        topGradMid: '#f5c300',
        topGradEnd: '#deaf00',
        skirtGradStart: '#cb9c00',
        skirtGradEnd: '#a67c00',
        skirtStroke: '#876500',
        dishStroke: '#ffe066',
        dishHighlight: '#ffefa6',
        legendColor: '#18191c',
        secondaryLegendColor: '#3d3824',
      },
    };
  }

  // Dynamic stops for Custom palettes
  const c = app.caseColor;
  const isDarkCase = getLuminance(c) < 0.35;

  return {
    caseOuterStart: adjustLightness(c, isDarkCase ? 12 : 6),
    caseOuterMid: c,
    caseOuterEnd: adjustLightness(c, -10),
    caseBorder: adjustLightness(c, isDarkCase ? 18 : -18),
    caseBevelStart: adjustLightness(c, isDarkCase ? 22 : 20),
    caseBevelEnd: adjustLightness(c, -15),
    plateBgStart: adjustLightness(c, -45),
    plateBgEnd: adjustLightness(c, -58),
    plateBorder: adjustLightness(c, -25),
    plateShadow: adjustLightness(c, -65),
    main: deriveKeyPalette(app.mainKeyColor, app.legendColor, false),
    sub: deriveKeyPalette(app.subKeyColor, app.legendColor, false),
    accent: deriveKeyPalette(app.accentKeyColor, app.legendColor, true),
  };
}

/* ------------------------------------------------------------- legend configs */

export interface LegendConfig {
  primary: string;
  secondary?: string;
  size?: number;
  align?: 'left' | 'center';
  isArrow?: 'up' | 'down' | 'left' | 'right';
  hasShiftArrow?: boolean;
  hasEnterArrow?: boolean;
  hasBackArrow?: boolean;
  hasTabArrow?: boolean;
}

export const KEYBOARD_LEGENDS: Record<string, LegendConfig> = {
  // F-row
  Esc: { primary: 'ESC', size: 6.8 },
  F1: { primary: 'F1', size: 6.8 },
  F2: { primary: 'F2', size: 6.8 },
  F3: { primary: 'F3', size: 6.8 },
  F4: { primary: 'F4', size: 6.8 },
  F5: { primary: 'F5', size: 6.8 },
  F6: { primary: 'F6', size: 6.8 },
  F7: { primary: 'F7', size: 6.8 },
  F8: { primary: 'F8', size: 6.8 },
  F9: { primary: 'F9', size: 6.8 },
  F10: { primary: 'F10', size: 6.2 },
  F11: { primary: 'F11', size: 6.2 },
  F12: { primary: 'F12', size: 6.2 },
  PrtSc: { primary: 'PRTSC', size: 5.6 },
  ScrLock: { primary: 'SCRLK', size: 5.4 },
  Pause: { primary: 'PAUSE', size: 5.4 },

  // Number row
  '`': { primary: '`', secondary: '~' },
  '1': { primary: '1', secondary: '!' },
  '2': { primary: '2', secondary: '@' },
  '3': { primary: '3', secondary: '#' },
  '4': { primary: '4', secondary: '$' },
  '5': { primary: '5', secondary: '%' },
  '6': { primary: '6', secondary: '^' },
  '7': { primary: '7', secondary: '&' },
  '8': { primary: '8', secondary: '*' },
  '9': { primary: '9', secondary: '(' },
  '0': { primary: '0', secondary: ')' },
  '-': { primary: '-', secondary: '_' },
  '=': { primary: '=', secondary: '+' },
  Backspace: { primary: 'BACK', size: 6.4, hasBackArrow: true },
  Insert: { primary: 'INS', size: 6.0 },
  Home: { primary: 'HOME', size: 6.0 },
  PgUp: { primary: 'PGUP', size: 6.0 },

  // QWERTY row
  Tab: { primary: 'TAB', size: 6.4, hasTabArrow: true },
  '[': { primary: '[', secondary: '{' },
  ']': { primary: ']', secondary: '}' },
  '\\': { primary: '\\', secondary: '|' },
  Delete: { primary: 'DEL', size: 6.0 },
  End: { primary: 'END', size: 6.0 },
  PgDn: { primary: 'PGDN', size: 6.0 },

  // Home row
  CapsLock: { primary: 'CAPS', size: 6.4 },
  ';': { primary: ';', secondary: ':' },
  "'": { primary: "'", secondary: '"' },
  Enter: { primary: 'ENTER', size: 6.8, hasEnterArrow: true },

  // Shift row
  LShift: { primary: 'SHIFT', size: 6.4, hasShiftArrow: true },
  ',': { primary: ',', secondary: '<' },
  '.': { primary: '.', secondary: '>' },
  '/': { primary: '/', secondary: '?' },
  RShift: { primary: 'SHIFT', size: 6.4, hasShiftArrow: true },
  Up: { primary: '', isArrow: 'up' },

  // Bottom row
  LCtrl: { primary: 'CTRL', size: 6.0 },
  LWin: { primary: 'WIN', size: 6.0 },
  LAlt: { primary: 'ALT', size: 6.0 },
  Space: { primary: '', align: 'center' },
  RAlt: { primary: 'ALT', size: 6.0 },
  Fn: { primary: 'FN', size: 6.0 },
  App: { primary: 'APP', size: 6.0 },
  RCtrl: { primary: 'CTRL', size: 6.0 },
  Left: { primary: '', isArrow: 'left' },
  Down: { primary: '', isArrow: 'down' },
  Right: { primary: '', isArrow: 'right' },
};
