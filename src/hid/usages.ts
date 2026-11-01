// HID keyboard / consumer usages offered in the remap picker.

const letters = Array.from({ length: 26 }, (_, i) => [0x04 + i, String.fromCharCode(65 + i)] as const);
const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d, i) => [0x1e + i, d] as const);
const fkeys = Array.from({ length: 12 }, (_, i) => [0x3a + i, `F${i + 1}`] as const);

export const KEY_USAGES: ReadonlyArray<readonly [number, string]> = [
  ...letters,
  ...digits,
  [0x28, 'Enter'],
  [0x29, 'Esc'],
  [0x2a, 'Backspace'],
  [0x2b, 'Tab'],
  [0x2c, 'Space'],
  [0x2d, '-'],
  [0x2e, '='],
  [0x2f, '['],
  [0x30, ']'],
  [0x31, '\\'],
  [0x33, ';'],
  [0x34, "'"],
  [0x35, '`'],
  [0x36, ','],
  [0x37, '.'],
  [0x38, '/'],
  [0x39, 'CapsLock'],
  ...fkeys,
  [0x46, 'PrtSc'],
  [0x47, 'ScrLock'],
  [0x48, 'Pause'],
  [0x49, 'Insert'],
  [0x4a, 'Home'],
  [0x4b, 'PgUp'],
  [0x4c, 'Delete'],
  [0x4d, 'End'],
  [0x4e, 'PgDn'],
  [0x4f, 'Right'],
  [0x50, 'Left'],
  [0x51, 'Down'],
  [0x52, 'Up'],
  [0x65, 'App'],
  [0xe0, 'LCtrl'],
  [0xe1, 'LShift'],
  [0xe2, 'LAlt'],
  [0xe3, 'LWin'],
  [0xe4, 'RCtrl'],
  [0xe5, 'RShift'],
  [0xe6, 'RAlt'],
  [0xe7, 'RWin'],
];

export const CONSUMER_USAGES: ReadonlyArray<readonly [number, string]> = [
  [0xe9, 'Volume up'],
  [0xea, 'Volume down'],
  [0xe2, 'Mute'],
  [0xcd, 'Play / pause'],
  [0xb5, 'Next track'],
  [0xb6, 'Previous track'],
  [0xb7, 'Stop'],
  [0x183, 'Media player'],
  [0x18a, 'Mail'],
  [0x192, 'Calculator'],
  [0x194, 'My computer'],
  [0x221, 'Search'],
  [0x223, 'Browser home'],
  [0x224, 'Browser back'],
  [0x225, 'Browser forward'],
  [0x226, 'Browser stop'],
  [0x227, 'Browser refresh'],
  [0x22a, 'Favourites'],
  [0x6f, 'Brightness up'],
  [0x70, 'Brightness down'],
];

export const MODIFIERS: ReadonlyArray<readonly [number, string]> = [
  [0x01, 'LCtrl'],
  [0x02, 'LShift'],
  [0x04, 'LAlt'],
  [0x08, 'LWin'],
  [0x10, 'RCtrl'],
  [0x20, 'RShift'],
  [0x40, 'RAlt'],
  [0x80, 'RWin'],
];

const hex = (n: number) => `0x${n.toString(16).padStart(2, '0')}`;

export function keyUsageName(u: number) {
  return KEY_USAGES.find(([v]) => v === u)?.[1] ?? hex(u);
}

export function consumerName(u: number) {
  return CONSUMER_USAGES.find(([v]) => v === u)?.[1] ?? hex(u);
}
