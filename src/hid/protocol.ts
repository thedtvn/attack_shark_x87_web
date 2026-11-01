// Data blocks shared by both transports (see PROTOCOL.md in the Rust lib).
import { LED_SLOTS } from './layout';

export type Rgb = [number, number, number];

// ------------------------------------------------------------- LED config

export const LED_CONFIG_LEN = 0x80;
const OFF_DEBOUNCE = 0x03;
const OFF_TAP = 0x16;
const OFF_SLEEP = 0x18;
export const TAP_MAX = 127;
export const DEBOUNCE_APP_MAX = 5;
/** Sleep choices from the vendor app, in seconds. */
export const SLEEP_PRESETS = [30, 60, 90, 120, 180, 240, 300, 600, 900, 1200];
const OFF_PERKEY = 0x09;
const OFF_EFFECT = 0x0a;
const OFF_SLOTS = 0x3a;
const OFF_MARKER = 0x7e;
export const MAX_LEVEL = 4;
export const COLOR_RANDOM = 7;

export interface EffectDef {
  id: number;
  name: string;
  /** From KB.ini LedOptN: speed / brightness / colour supported. */
  speed: boolean;
  light: boolean;
  color: boolean;
}

// Order = slot (LedOpt1..19); names from Text/en/text.xml.
export const EFFECTS: EffectDef[] = [
  { id: 1, name: 'Fixed on', speed: false, light: true, color: true },
  { id: 2, name: 'Respire', speed: true, light: true, color: true },
  { id: 3, name: 'Rainbow', speed: true, light: true, color: false },
  { id: 4, name: 'Flash away', speed: true, light: true, color: true },
  { id: 5, name: 'Raindrops', speed: true, light: true, color: true },
  { id: 6, name: 'Rainbow wheel', speed: true, light: true, color: true },
  { id: 7, name: 'Ripples shining', speed: true, light: true, color: true },
  { id: 8, name: 'Stars twinkle', speed: true, light: true, color: true },
  { id: 9, name: 'Shadow disappear', speed: true, light: true, color: true },
  { id: 10, name: 'Retro snake', speed: true, light: true, color: true },
  { id: 11, name: 'Neon stream', speed: true, light: true, color: true },
  { id: 12, name: 'Reaction', speed: true, light: true, color: true },
  { id: 13, name: 'Sine wave', speed: true, light: true, color: true },
  { id: 14, name: 'Retinue scanning', speed: true, light: true, color: true },
  { id: 15, name: 'Rotating windmill', speed: true, light: true, color: false },
  { id: 16, name: 'Colorful waterfall', speed: true, light: true, color: false },
  { id: 17, name: 'Blossoming', speed: true, light: true, color: false },
  { id: 18, name: 'Rotating storm', speed: true, light: true, color: true },
  { id: 21, name: 'Custom (per-key)', speed: false, light: true, color: false },
];

export const CUSTOM_EFFECT_ID = 21;

export interface EffectSettings {
  brightness: number;
  speed: number;
  color: number;
}

export class LedConfig {
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  get valid() {
    return this.bytes[OFF_MARKER] === 0x5a && this.bytes[OFF_MARKER + 1] === 0xa5;
  }

  get effectId() {
    return this.bytes[OFF_EFFECT];
  }

  static slot(effectId: number) {
    return EFFECTS.findIndex((e) => e.id === effectId);
  }

  settings(effectId: number): EffectSettings {
    const o = OFF_SLOTS + LedConfig.slot(effectId) * 2;
    return { brightness: this.bytes[o], speed: this.bytes[o + 1] >> 4, color: this.bytes[o + 1] & 0x0f };
  }

  /** Debounce stage, 1-based (stored as stage - 1 at 0x03). */
  get debounce() {
    return this.bytes[OFF_DEBOUNCE] + 1;
  }

  /** Tap sensitivity at 0x16; 0 = off. */
  get tap() {
    return this.bytes[OFF_TAP];
  }

  /** Sleep timeout in seconds (0x18 in 30 s units); 0 = never. */
  get sleepSecs() {
    return this.bytes[OFF_SLEEP] * 30;
  }

  withOptions(o: { debounce?: number; tap?: number; sleepSecs?: number }): LedConfig {
    const b = new Uint8Array(this.bytes);
    if (o.debounce !== undefined) b[OFF_DEBOUNCE] = clamp(o.debounce, 1, 255) - 1;
    if (o.tap !== undefined) b[OFF_TAP] = clamp(o.tap, 0, TAP_MAX);
    if (o.sleepSecs !== undefined) b[OFF_SLEEP] = clamp(Math.ceil(o.sleepSecs / 30), 0, 255);
    return new LedConfig(b);
  }

  with(effectId: number, s: EffectSettings): LedConfig {
    const b = new Uint8Array(this.bytes);
    b[OFF_EFFECT] = effectId;
    b[OFF_PERKEY] = effectId === CUSTOM_EFFECT_ID ? 1 : 0;
    const o = OFF_SLOTS + LedConfig.slot(effectId) * 2;
    b[o] = clamp(s.brightness, 0, MAX_LEVEL);
    b[o + 1] = (clamp(s.speed, 0, MAX_LEVEL) << 4) | (s.color & 0x0f);
    b[0x38] = 0xff;
    b[0x39] = 0xff;
    b[OFF_MARKER] = 0x5a;
    b[OFF_MARKER + 1] = 0xa5;
    return new LedConfig(b);
  }
}

// --------------------------------------------------------------- RGB table

export const RGB_TABLE_LEN = 0x200;
export const PALETTE_SIZE = 7;

export class RgbTable {
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  private static off(effectId: number, i: number) {
    return (LedConfig.slot(effectId) + 1) * 21 + i * 3;
  }

  palette(effectId: number): Rgb[] {
    return Array.from({ length: PALETTE_SIZE }, (_, i) => {
      const o = RgbTable.off(effectId, i);
      return [this.bytes[o], this.bytes[o + 1], this.bytes[o + 2]] as Rgb;
    });
  }

  withColor(effectId: number, i: number, c: Rgb): RgbTable {
    const b = new Uint8Array(this.bytes);
    b.set(c, RgbTable.off(effectId, i));
    b[0x1fa] = 0x5a;
    b[0x1fb] = 0xa5;
    return new RgbTable(b);
  }
}

// --------------------------------------------------------- per-key colours

export const PER_KEY_LEN = 0x80 * 3;

/** Three planes (R, G, B) of LED_SLOTS bytes, indexed by LED index. */
export class PerKeyColors {
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array = new Uint8Array(PER_KEY_LEN)) {
    this.bytes = bytes;
  }

  get(i: number): Rgb {
    return [this.bytes[i], this.bytes[LED_SLOTS + i], this.bytes[2 * LED_SLOTS + i]];
  }

  with(indices: number[], c: Rgb): PerKeyColors {
    const b = new Uint8Array(this.bytes);
    for (const i of indices) {
      b[i] = c[0];
      b[LED_SLOTS + i] = c[1];
      b[2 * LED_SLOTS + i] = c[2];
    }
    return new PerKeyColors(b);
  }
}

// -------------------------------------------------------------- key matrix

export const MATRIX_LEN = 0x80;
export const LAYERS = 4;

export type KeyAction =
  | { kind: 'none' }
  | { kind: 'key'; modifiers: number; usage: number; usage2: number }
  | { kind: 'consumer'; usage: number }
  | { kind: 'mouse'; button: number }
  | { kind: 'fn' }
  | { kind: 'raw'; value: number };

export function decodeAction(b: Uint8Array): KeyAction {
  const [b0, b1, b2, b3] = b;
  if (!b0 && !b1 && !b2 && !b3) return { kind: 'none' };
  if (b0 === 0x0d && !b1 && !b2 && !b3) return { kind: 'fn' };
  if (b0 === 0x00) return { kind: 'key', modifiers: b1, usage: b3, usage2: b2 };
  if (b0 === 0x02 && b1 === 0) return { kind: 'consumer', usage: (b2 << 8) | b3 };
  if (b0 === 0x01 && b2 === 0x01 && b3 === 0) return { kind: 'mouse', button: b1 };
  return { kind: 'raw', value: (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0 };
}

export function encodeAction(a: KeyAction): Uint8Array {
  switch (a.kind) {
    case 'none':
      return new Uint8Array(4);
    case 'key':
      return Uint8Array.of(0, a.modifiers, a.usage2, a.usage);
    case 'consumer':
      return Uint8Array.of(2, 0, a.usage >> 8, a.usage & 0xff);
    case 'mouse':
      return Uint8Array.of(1, a.button, 1, 0);
    case 'fn':
      return Uint8Array.of(0x0d, 0, 0, 0);
    case 'raw':
      return Uint8Array.of(a.value & 0xff, (a.value >> 8) & 0xff, (a.value >> 16) & 0xff, a.value >>> 24);
  }
}

export class KeyMatrix {
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  get(index: number): KeyAction {
    return decodeAction(this.bytes.subarray(index * 4, index * 4 + 4));
  }

  with(index: number, a: KeyAction): KeyMatrix {
    const b = new Uint8Array(this.bytes);
    b.set(encodeAction(a), index * 4);
    return new KeyMatrix(b);
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v | 0));
}
