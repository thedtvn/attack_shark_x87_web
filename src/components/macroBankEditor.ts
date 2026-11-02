import type { MacroDefinition } from '../hid/macros';
import type { MacroDraft } from './macroDrafts';

/** Compare only data stored in the bank, not editor IDs or timestamps. */
export function macroBankSnapshot(bank: MacroDefinition[]): string {
  return JSON.stringify(bank.map(m => ({ name: m.name, events: m.events.map(e => ({ type: e.type, value: e.value, down: e.down, delayMs: e.delayMs })) })));
}

export function bankToEditor(bank: MacroDefinition[]): MacroDraft[] {
  return bank.map(m => ({
    name: m.name, events: m.events.map(e => ({ ...e })),
    id: crypto.randomUUID(), updatedAt: Date.now(), repeat: { mode: 'times', count: 1 },
  }));
}

export function changedMacroSlots(bank: MacroDefinition[], saved: MacroDefinition[]): number {
  let count = 0;
  for (let i = 0; i < Math.max(bank.length, saved.length); i++) {
    if (macroBankSnapshot(bank[i] ? [bank[i]] : []) !== macroBankSnapshot(saved[i] ? [saved[i]] : [])) count++;
  }
  return count;
}
