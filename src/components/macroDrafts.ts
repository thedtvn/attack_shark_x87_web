import type { MacroDefinition, MacroEvent, MacroRepeat } from '../hid/macros';
import { MAX_DELAY_MS, MAX_MACROS } from '../hid/macros';
import { keyUsageName } from '../hid/usages';

export interface MacroDraft extends MacroDefinition {
  id: string;
  repeat: MacroRepeat;
  updatedAt: number;
}

export const LAYER_NAMES = ['Default', 'FN1', 'FN2', 'Tap'] as const;

/** Estimate encoded byte size of a single macro record */
export function estimateMacroSize(m: MacroDefinition): number {
  return 1 + m.name.length * 2 + m.events.length * 4;
}

/** Total bytes the draft list would consume in the 4096-byte bank */
export function estimateBankSize(drafts: MacroDefinition[]): number {
  if (drafts.length === 0) return 0;
  const headerSize = drafts.length * 4;
  const recordsSize = drafts.reduce((sum, d) => sum + estimateMacroSize(d), 0);
  return headerSize + recordsSize;
}

/** Validate whether a macro name meets firmware requirements */
export function validateMacroName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name cannot be empty';
  if (name.length > 30) return 'Name must be 1–30 characters';
  if (name.includes('\0')) return 'Name must not contain null characters';
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = name.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return 'Invalid Unicode sequence in name';
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return 'Invalid Unicode sequence in name';
    }
  }
  return null;
}

/** Validate an entire macro draft for bank compilation */
export function validateMacroDraft(draft: MacroDefinition): string[] {
  const errors: string[] = [];
  const nameErr = validateMacroName(draft.name);
  if (nameErr) errors.push(nameErr);

  if (!Array.isArray(draft.events) || draft.events.length === 0) {
    errors.push('Macro must contain at least 1 event');
  } else if (draft.events.length > 1023) {
    errors.push('Macro cannot exceed 1023 events');
  } else {
    for (let i = 0; i < draft.events.length; i++) {
      const e = draft.events[i];
      if (!Number.isInteger(e.delayMs) || e.delayMs < 0 || e.delayMs > MAX_DELAY_MS) {
        errors.push(`Event #${i + 1}: delay must be between 0 and ${MAX_DELAY_MS} ms`);
      }
      if (typeof e.down !== 'boolean') {
        errors.push(`Event #${i + 1}: state must be press or release`);
      }
      switch (e.type) {
        case 'key':
          if (!Number.isInteger(e.value) || e.value < 1 || e.value > 0xe7) {
            errors.push(`Event #${i + 1}: key code must be 1..0xE7`);
          }
          break;
        case 'mouseButton':
          if (!Number.isInteger(e.value) || e.value < 1 || e.value > 31) {
            errors.push(`Event #${i + 1}: mouse button mask must be 1..31`);
          }
          break;
        case 'moveX':
        case 'moveY':
        case 'wheel':
          if (e.down) errors.push(`Event #${i + 1}: motion cannot have a press state`);
          if (!Number.isInteger(e.value) || e.value < -128 || e.value > 127) {
            errors.push(`Event #${i + 1}: motion value must be -128..127`);
          }
          break;
        default:
          errors.push(`Event #${i + 1}: unsupported event type`);
      }
    }
  }
  return errors;
}

const EVENT_TYPES = new Set(['key', 'mouseButton', 'moveX', 'moveY', 'wheel']);

function parseRepeat(value: unknown): MacroRepeat {
  if (!value || typeof value !== 'object') throw new Error('Repeat mode is missing');
  const r = value as { mode?: unknown; count?: unknown };
  if (r.mode === 'untilReleased' || r.mode === 'untilAnyKey') return { mode: r.mode };
  if (r.mode === 'times' && Number.isInteger(r.count) && Number(r.count) >= 1 && Number(r.count) <= 255) {
    return { mode: 'times', count: Number(r.count) };
  }
  throw new Error('Repeat must be times 1..255, untilReleased, or untilAnyKey');
}

function parseEvent(value: unknown, n: number): MacroEvent {
  if (!value || typeof value !== 'object') throw new Error(`Event ${n} is not an object`);
  const e = value as Record<string, unknown>;
  if (typeof e.type !== 'string' || !EVENT_TYPES.has(e.type)) throw new Error(`Event ${n} has an unsupported type`);
  if (typeof e.value !== 'number' || typeof e.down !== 'boolean' || typeof e.delayMs !== 'number') {
    throw new Error(`Event ${n} has invalid fields`);
  }
  return { type: e.type as MacroEvent['type'], value: e.value, down: e.down, delayMs: e.delayMs };
}

/** Strictly parse one draft. Invalid data is rejected, never repaired. */
export function parseMacroDraft(value: unknown, n: number, preserveId = true): MacroDraft {
  if (!value || typeof value !== 'object') throw new Error(`Macro ${n} is not an object`);
  const item = value as Record<string, unknown>;
  if (typeof item.name !== 'string' || !Array.isArray(item.events)) throw new Error(`Macro ${n} has no valid name/events`);
  if (preserveId && (typeof item.id !== 'string' || !item.id || typeof item.updatedAt !== 'number' || !Number.isFinite(item.updatedAt))) {
    throw new Error(`Macro ${n} has invalid saved metadata`);
  }
  const draft: MacroDraft = {
    id: preserveId ? item.id as string : crypto.randomUUID(),
    name: item.name,
    events: item.events.map((e, i) => parseEvent(e, i + 1)),
    repeat: parseRepeat(item.repeat),
    updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
  };
  const errors = validateMacroDraft(draft);
  if (errors.length) throw new Error(`Macro ${n} (${draft.name || 'unnamed'}): ${errors.join('; ')}`);
  return draft;
}

export function parseMacroDraftList(value: unknown, preserveIds = true): MacroDraft[] {
  if (!Array.isArray(value)) throw new Error('Macro list must be an array');
  if (value.length > MAX_MACROS) throw new Error(`Macro list contains ${value.length} items; the limit is ${MAX_MACROS}`);
  const drafts = value.map((d, i) => parseMacroDraft(d, i + 1, preserveIds));
  if (new Set(drafts.map((d) => d.id)).size !== drafts.length) throw new Error('Macro IDs must be unique');
  return drafts;
}

/** Convert browser KeyboardEvent.code to USB HID Usage */
export function browserCodeToHidUsage(code: string): number | undefined {
  // Letters KeyA - KeyZ
  if (code.startsWith('Key') && code.length === 4) {
    const charCode = code.charCodeAt(3);
    if (charCode >= 65 && charCode <= 90) {
      return 0x04 + (charCode - 65);
    }
  }

  // Digits Digit1 - Digit9, Digit0
  if (code.startsWith('Digit') && code.length === 6) {
    const num = parseInt(code.charAt(5), 10);
    if (num >= 1 && num <= 9) return 0x1e + (num - 1);
    if (num === 0) return 0x27;
  }

  // Numpad digits Numpad1 - Numpad9, Numpad0
  if (code.startsWith('Numpad') && code.length === 7) {
    const num = parseInt(code.charAt(6), 10);
    if (num >= 1 && num <= 9) return 0x59 + (num - 1);
    if (num === 0) return 0x62;
  }

  // Function keys F1 - F12
  const fMatch = /^F(\d+)$/.exec(code);
  if (fMatch) {
    const fNum = parseInt(fMatch[1], 10);
    if (fNum >= 1 && fNum <= 12) return 0x3a + (fNum - 1);
  }

  // Modifiers
  switch (code) {
    case 'ControlLeft': return 0xe0;
    case 'ShiftLeft': return 0xe1;
    case 'AltLeft': return 0xe2;
    case 'MetaLeft': return 0xe3;
    case 'ControlRight': return 0xe4;
    case 'ShiftRight': return 0xe5;
    case 'AltRight': return 0xe6;
    case 'MetaRight': return 0xe7;
  }

  // Common standard keys
  switch (code) {
    case 'Enter': return 0x28;
    case 'NumpadEnter': return 0x58;
    case 'Escape': return 0x29;
    case 'Backspace': return 0x2a;
    case 'Tab': return 0x2b;
    case 'Space': return 0x2c;
    case 'Minus': return 0x2d;
    case 'Equal': return 0x2e;
    case 'BracketLeft': return 0x2f;
    case 'BracketRight': return 0x30;
    case 'Backslash': return 0x31;
    case 'Semicolon': return 0x33;
    case 'Quote': return 0x34;
    case 'Backquote': return 0x35;
    case 'Comma': return 0x36;
    case 'Period': return 0x37;
    case 'Slash': return 0x38;
    case 'CapsLock': return 0x39;
    case 'PrintScreen': return 0x46;
    case 'ScrollLock': return 0x47;
    case 'Pause': return 0x48;
    case 'Insert': return 0x49;
    case 'Home': return 0x4a;
    case 'PageUp': return 0x4b;
    case 'Delete': return 0x4c;
    case 'End': return 0x4d;
    case 'PageDown': return 0x4e;
    case 'ArrowRight': return 0x4f;
    case 'ArrowLeft': return 0x50;
    case 'ArrowDown': return 0x51;
    case 'ArrowUp': return 0x52;
    case 'ContextMenu': return 0x65;
    default:
      return undefined;
  }
}

/** Human-friendly name for mouse buttons */
export const MOUSE_BUTTON_NAMES: Record<number, string> = {
  1: 'Left Click (Button 1)',
  2: 'Right Click (Button 2)',
  4: 'Middle Click (Button 3)',
  8: 'Back (Button 4)',
  16: 'Forward (Button 5)',
};

/** Describe an event cleanly for the UI */
export function describeMacroEvent(e: MacroEvent): { title: string; subtitle: string; iconType: string } {
  switch (e.type) {
    case 'key': {
      const decodedName = keyUsageName(e.value);
      const name = decodedName.startsWith('0x') ? 'Unsupported key' : decodedName;
      return {
        title: `${name} ${e.down ? 'Down' : 'Up'}`,
        subtitle: 'Keyboard key',
        iconType: 'key',
      };
    }
    case 'mouseButton': {
      const name = MOUSE_BUTTON_NAMES[e.value] ?? `Mouse Button (mask ${e.value})`;
      return {
        title: `${name} ${e.down ? 'Down' : 'Up'}`,
        subtitle: `Button mask ${e.value}`,
        iconType: 'mouse',
      };
    }
    case 'moveX':
      return {
        title: `Move Cursor X: ${e.value >= 0 ? `+${e.value}` : e.value} px`,
        subtitle: 'Horizontal mouse movement',
        iconType: 'move',
      };
    case 'moveY':
      return {
        title: `Move Cursor Y: ${e.value >= 0 ? `+${e.value}` : e.value} px`,
        subtitle: 'Vertical mouse movement',
        iconType: 'move',
      };
    case 'wheel':
      return {
        title: `Mouse Wheel: ${e.value >= 0 ? `+${e.value}` : e.value}`,
        subtitle: 'Wheel scroll delta',
        iconType: 'wheel',
      };
    default:
      return {
        title: 'Unknown Event',
        subtitle: '',
        iconType: 'unknown',
      };
  }
}

/** Total execution time of macro in milliseconds */
export function calculateMacroDuration(events: MacroEvent[]): number {
  return events.reduce((sum, ev) => sum + ev.delayMs, 0);
}

/** Trigger download of macro drafts as JSON file */
export function exportDraftsToJsonFile(drafts: MacroDraft[]): void {
  const exportData = {
    app: 'Attack Shark X87 Web',
    type: 'macro-drafts-export',
    exportedAt: new Date().toISOString(),
    version: 1,
    count: drafts.length,
    drafts: drafts.map((d) => ({
      name: d.name,
      events: d.events,
      repeat: d.repeat,
    })),
  };
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `attack_shark_x87_macros_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse and validate imported JSON file */
export function parseImportedJsonDrafts(jsonStr: string): MacroDraft[] {
  const data = JSON.parse(jsonStr);
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.type !== 'macro-drafts-export' || data.version !== 1) {
    throw new Error('Not an Attack Shark X87 macro export (version 1)');
  }
  const drafts = parseMacroDraftList(data.drafts, false);
  if (data.count !== drafts.length) throw new Error('Export count does not match its macro list');
  return drafts;
}
