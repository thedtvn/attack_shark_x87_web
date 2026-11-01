import type { Rgb } from '../hid/protocol';

export const toHex = (c: Rgb) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

export const fromHex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
