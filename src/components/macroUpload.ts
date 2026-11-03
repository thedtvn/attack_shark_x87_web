import type { X87 } from '../hid/keyboard';
import type { MacroDefinition } from '../hid/macros';

/** Save progress as a 0..100 percentage of packets written. */
export interface SaveProgress { percent: number }

/**
 * Bank-only operation, matching the vendor app: write the whole bank once.
 * Key assignments belong exclusively to Key remap.
 */
export async function uploadMacroBank(
  kb: Pick<X87, 'writeMacroBank'>,
  definitions: MacroDefinition[],
  onProgress?: (progress: SaveProgress) => void,
): Promise<void> {
  let last = -1;
  const report = (fraction: number) => {
    const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    if (percent <= last) return;
    last = percent;
    onProgress?.({ percent });
  };
  report(0);
  try {
    await kb.writeMacroBank(definitions, report);
  } catch (e) {
    throw new Error(`Saving macros failed; the bank may be partially written. Save again to retry. ${e instanceof Error ? e.message : String(e)}`);
  }
  report(1);
}
