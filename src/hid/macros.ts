// Firmware format from Ghidra: G5KB_EncodeMacroRecord / G5KB_FillKeyMatrix.
// Never upload a vendor .mcr as-is.
export interface MacroEvent {
  type: 'key' | 'mouseButton' | 'moveX' | 'moveY' | 'wheel';
  value: number;
  down: boolean;
  /** Interval before this event, in milliseconds (20-bit firmware field). */
  delayMs: number;
}
export interface MacroDefinition { name: string; events: MacroEvent[] }
export type MacroRepeat = { mode: 'times'; count: number } | { mode: 'untilReleased' } | { mode: 'untilAnyKey' };
export const MACRO_BANK_SIZE = 4096;
// Client-side safety bound, NOT a claimed firmware limit.
export const MAX_MACROS = 32;
export const MAX_DELAY_MS = 0xfffff;

function integer(n: number, min: number, max: number, label: string) {
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be ${min}..${max}`);
  return n;
}
function validateName(name: string) {
  if (typeof name !== 'string' || !name.trim() || name.length > 30 || name.includes('\0')) {
    throw new Error('Macro name must contain 1–30 UTF-16 code units and no NUL');
  }
  // Refuse unpaired surrogates so names round-trip without replacement.
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = name.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('Invalid Unicode macro name');
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error('Invalid Unicode macro name');
  }
}
export function encodeMacro(m: MacroDefinition): Uint8Array {
  validateName(m.name);
  if (!Array.isArray(m.events) || m.events.length === 0 || m.events.length > 1023) throw new Error('A macro needs 1–1023 events');
  const out = new Uint8Array(1 + m.name.length * 2 + m.events.length * 4);
  out[0] = m.name.length * 2;
  const v = new DataView(out.buffer);
  for (let i = 0; i < m.name.length; i++) v.setUint16(1 + i * 2, m.name.charCodeAt(i), true);
  m.events.forEach((e, i) => {
    const delay = integer(e.delayMs, 0, MAX_DELAY_MS, 'Event delay');
    if (typeof e.down !== 'boolean') throw new Error('Event down must be a boolean');
    let type: number;
    let value: number;
    switch (e.type) {
      case 'key':
        value = integer(e.value, 1, 0xe7, 'HID keyboard usage');
        type = value >= 0xe0 ? 1 : 0;
        break;
      case 'mouseButton':
        value = integer(e.value, 1, 31, 'Mouse button mask');
        type = 2;
        break;
      case 'moveX': case 'moveY': case 'wheel':
        if (e.down) throw new Error('Motion events cannot have a press state');
        value = integer(e.value, -128, 127, 'Mouse displacement') & 0xff;
        type = e.type === 'moveX' ? 3 : e.type === 'moveY' ? 4 : 5;
        break;
      default: throw new Error('Unsupported macro event type');
    }
    const o = 1 + m.name.length * 2 + i * 4;
    out[o] = (type << 4) | (type <= 2 && e.down ? 0x80 : 0) | (delay >>> 16);
    out[o + 1] = delay >>> 8;
    out[o + 2] = delay;
    out[o + 3] = value;
  });
  return out;
}
export function decodeMacro(data: Uint8Array): MacroDefinition {
  if (data.length < 1 || data[0] > 60 || data[0] % 2 || data[0] + 1 > data.length || (data.length - 1 - data[0]) % 4) {
    throw new Error('Invalid macro record length');
  }
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let name = '';
  for (let i = 1; i <= data[0]; i += 2) name += String.fromCharCode(v.getUint16(i, true));
  const events: MacroEvent[] = [];
  for (let o = 1 + data[0]; o < data.length; o += 4) {
    const t = (data[o] >>> 4) & 7;
    const value = data[o + 3];
    if (t > 5 || (t > 2 && (data[o] & 0x80))) throw new Error('Unknown macro event encoding');
    if (t === 1 && (value < 0xe0 || value > 0xe7)) throw new Error('Invalid modifier usage');
    const type: MacroEvent['type'] = t <= 1 ? 'key' : t === 2 ? 'mouseButton' : t === 3 ? 'moveX' : t === 4 ? 'moveY' : 'wheel';
    events.push({ type, value: t >= 3 && value > 127 ? value - 256 : value,
      down: t <= 2 && !!(data[o] & 0x80), delayMs: ((data[o] & 15) << 16) | (data[o + 1] << 8) | data[o + 2] });
  }
  const m = {name, events};
  // Reject unknown/noncanonical data rather than silently rewriting it.
  const encoded = encodeMacro(m);
  if (encoded.some((b, i) => b !== data[i])) throw new Error('Unsupported macro record');
  return m;
}
export function encodeMacroBank(macros: MacroDefinition[]): Uint8Array {
  if (!Array.isArray(macros) || macros.length > MAX_MACROS) throw new Error(`Client limit: ${MAX_MACROS} macros`);
  const records = macros.map(encodeMacro);
  let offset = macros.length * 4;
  if (records.reduce((n, b) => n + b.length, offset) > MACRO_BANK_SIZE) throw new Error('Macro bank exceeds 4096 bytes');
  const out = new Uint8Array(MACRO_BANK_SIZE);
  const view = new DataView(out.buffer);
  records.forEach((record, slot) => {
    view.setUint16(slot * 4, offset, true);
    view.setUint16(slot * 4 + 2, record.length, true);
    out.set(record, offset);
    offset += record.length;
  });
  return out;
}
export function decodeMacroBank(data: Uint8Array): MacroDefinition[] {
  if (data.length !== MACRO_BANK_SIZE) throw new Error('Macro bank must be exactly 4096 bytes');
  if (data.every((x) => x === 0) || data.every((x) => x === 0xff)) return [];
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const first = v.getUint16(0, true);
  if (!first || first % 4 || first / 4 > MAX_MACROS) throw new Error('Unsupported macro directory');
  const count = first / 4;
  let offset = first;
  const result: MacroDefinition[] = [];
  for (let slot = 0; slot < count; slot++) {
    const start = v.getUint16(slot * 4, true), size = v.getUint16(slot * 4 + 2, true);
    if (start !== offset || size < 5 || start + size > data.length) throw new Error('Invalid macro directory bounds');
    result.push(decodeMacro(data.subarray(start, start + size)));
    offset += size;
  }
  return result;
}
export function encodeMacroBinding(slot: number, repeat: MacroRepeat): Uint8Array {
  integer(slot, 0, MAX_MACROS - 1, 'Macro slot');
  let mode: number, count = 1;
  switch (repeat.mode) {
    case 'times': mode = 1; count = integer(repeat.count, 1, 255, 'Repeat count'); break;
    case 'untilReleased': mode = 4; break;
    case 'untilAnyKey': mode = 2; break;
    default: throw new Error('Unknown repeat mode');
  }
  return Uint8Array.of(3, mode, count, slot);
}
export function decodeMacroBinding(b: Uint8Array): {slot:number; repeat:MacroRepeat} | null {
  if (b.length !== 4 || b[0] !== 3 || b[3] >= MAX_MACROS) return null;
  if (b[1] === 1 && b[2]) return {slot:b[3],repeat:{mode:'times',count:b[2]}};
  if (b[2] !== 1) return null;
  if (b[1] === 4) return {slot:b[3],repeat:{mode:'untilReleased'}};
  if (b[1] === 2) return {slot:b[3],repeat:{mode:'untilAnyKey'}};
  return null;
}
