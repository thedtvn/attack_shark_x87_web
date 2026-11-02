import type { Rgb } from '../hid/protocol';

/** Clicking the current brush colour again turns that LED off; dragging paints. */
export function paintColor(current: Rgb, brush: Rgb, click: boolean): Rgb {
  return click && current.every((value, i) => value === brush[i]) ? [0, 0, 0] : brush;
}
