import type { X87 } from '../hid/keyboard';
import type { MacroDefinition } from '../hid/macros';

export const MACRO_BANK_BACKUP_KEY = 'attack_shark_x87_macro_bank_backup_v1';

/** Bank-only operation. Key assignments belong exclusively to Key remap. */
export async function uploadMacroBank(
  kb: Pick<X87, 'connection' | 'readMacroBank' | 'replaceMacroBank'>,
  definitions: MacroDefinition[],
  backup: (bank: MacroDefinition[]) => void,
): Promise<{ verified: boolean }> {
  try {
    const previous = await kb.readMacroBank();
    backup(previous);
  } catch (e) {
    throw new Error(`Backup failed; no macro upload was attempted. ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    return await kb.replaceMacroBank(definitions, { allowEmpty: true });
  } catch (e) {
    throw new Error(`Bank replacement failed; no key bindings were written. The bank may be partially changed if writing started. ${e instanceof Error ? e.message : String(e)}`);
  }
}
