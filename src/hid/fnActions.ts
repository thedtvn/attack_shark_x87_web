import { decodeAction, encodeAction, type KeyAction } from './protocol';

export interface FnShortcut {
  key: string;
  label: string;
  name: string;
  detail: string;
  /** Exact matrix word, correlated with vendor KB.ini [FN1] and the manual. */
  word: number;
}

// Labels only: inspecting these shortcuts never sends a command. The manual
// describes behavior, while KB.ini + G5KB_ConvertKeyCode establish wire values.
export const FN_SHORTCUTS: readonly FnShortcut[] = [
  { key: 'F1', word: 0x70000002, label: 'Dim −', name: 'Screen brightness down', detail: 'Decreases screen brightness; host support is required.' },
  { key: 'F2', word: 0x6f000002, label: 'Dim +', name: 'Screen brightness up', detail: 'Increases screen brightness; host support is required.' },
  { key: 'F3', word: 0x2b000800, label: 'Tasks', name: 'Display / task switching', detail: 'Manual: multi-screen display on Windows, Task Center on Mac. The vendor default sends Win + Tab; behavior depends on the host OS.' },
  { key: 'F4', word: 0x2b000400, label: 'Apps', name: 'Application switching', detail: 'Switches applications (vendor default: Alt + Tab).' },
  { key: 'F5', word: 0x21020002, label: 'Search', name: 'Search', detail: 'Opens host search.' },
  { key: 'F6', word: 0x2c000800, label: 'Input', name: 'Input method', detail: 'Manual: input method. The vendor default sends Win + Space; behavior depends on the host OS.' },
  { key: 'F7', word: 0xb6000002, label: 'Prev', name: 'Previous song', detail: 'Previous media track.' },
  { key: 'F8', word: 0xcd000002, label: 'Play', name: 'Play / pause', detail: 'Toggles media playback.' },
  { key: 'F9', word: 0xb5000002, label: 'Next', name: 'Next song', detail: 'Next media track.' },
  { key: 'F10', word: 0xe2000002, label: 'Mute', name: 'Mute', detail: 'Toggles host audio mute.' },
  { key: 'F11', word: 0xea000002, label: 'Vol −', name: 'Volume down', detail: 'Decreases host audio volume.' },
  { key: 'F12', word: 0xe9000002, label: 'Vol +', name: 'Volume up', detail: 'Increases host audio volume.' },
  { key: '1', word: 0x05000007, label: 'BT 1', name: 'Bluetooth 1', detail: 'Short press: select Bluetooth channel 1. Hold: pair channel 1. Set the physical mode switch to BT.' },
  { key: '2', word: 0x06000007, label: 'BT 2', name: 'Bluetooth 2', detail: 'Short press: select Bluetooth channel 2. Hold: pair channel 2. Set the physical mode switch to BT.' },
  { key: '3', word: 0x07000007, label: 'BT 3', name: 'Bluetooth 3', detail: 'Short press: select Bluetooth channel 3. Hold: pair channel 3. Set the physical mode switch to BT.' },
  { key: '4', word: 0x08000007, label: '2.4G', name: '2.4 GHz receiver', detail: 'Short press: select the 2.4 GHz receiver connection. Hold: receiver pairing. Set the physical mode switch to 2.4G.' },
  { key: 'Backspace', word: 0x11000007, label: 'Battery', name: 'Battery level', detail: 'Wireless only: shows battery level using number keys 1–0 in 10% steps. Manual: red below 30%, yellow below 50%, green above 50%.' },
  { key: 'LWin', word: 0x01000007, label: 'Win lock', name: 'Windows-key lock', detail: 'Locks the Windows key. The manual lists no function for this shortcut in Mac mode.' },
  { key: 'Space', word: 0x04000007, label: 'Reset', name: 'Factory reset (hold 3 seconds)', detail: 'Hold Fn + Space for 3 seconds to restore factory settings. Destructive: may clear custom mappings, lighting and macros.' },
  { key: '\\', word: 0x00000008, label: 'Effect', name: 'Backlight effect', detail: 'Cycles the main keyboard backlight effect.' },
  { key: 'Enter', word: 0x00000208, label: 'Colour', name: 'Backlight colour', detail: 'Cycles main backlight colour: colourful, red, orange, yellow, green, cyan, blue, purple, white.' },
  { key: 'G', word: 0x0a000007, label: 'Power', name: 'Lighting / power-saving switch', detail: 'Manual: keyboard lighting switch / power-saving mode switch.' },
  { key: 'X', word: 0x0b000007, label: 'Light', name: 'Keyboard lighting switch', detail: 'Toggles keyboard lighting.' },
  { key: 'Up', word: 0x00010308, label: 'LED +', name: 'Backlight brightness up', detail: 'Increases main keyboard backlight brightness, not screen brightness.' },
  { key: 'Down', word: 0x00020308, label: 'LED −', name: 'Backlight brightness down', detail: 'Decreases main keyboard backlight brightness, not screen brightness.' },
  { key: 'Left', word: 0x00020408, label: 'Slow', name: 'Backlight speed down', detail: 'Decreases main backlight animation speed.' },
  { key: 'Right', word: 0x00010408, label: 'Fast', name: 'Backlight speed up', detail: 'Increases main backlight animation speed.' },
  { key: 'CapsLock', word: 0x01000008, label: 'Bar mode', name: 'Light-bar mode', detail: 'Cycles the separate light-bar lighting mode.' },
  { key: 'A', word: 0x01000208, label: 'Bar hue', name: 'Light-bar colour', detail: 'Cycles light-bar colour: red, green, blue, yellow, purple, sky blue, pink.' },
];

export function fnShortcutFor(action: KeyAction): FnShortcut | undefined {
  const b = encodeAction(action);
  const word = new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true);
  return FN_SHORTCUTS.find(shortcut => shortcut.word === word);
}

export function fnShortcutAction(shortcut: FnShortcut): KeyAction {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, shortcut.word, true);
  return decodeAction(bytes);
}

/** Consumer-control actions already live in Media; retain the full map for labels/defaults. */
export const CONTROLLER_SHORTCUTS = FN_SHORTCUTS.filter(shortcut => fnShortcutAction(shortcut).kind !== 'consumer');

/** Only FN1 factory actions are documented by the supplied vendor configuration. */
export function fnFactoryAction(key: string): KeyAction {
  const shortcut = FN_SHORTCUTS.find(shortcut => shortcut.key === key);
  return shortcut ? fnShortcutAction(shortcut) : { kind: 'none' };
}

export function isConnectionShortcut(shortcut: FnShortcut): boolean {
  return ['1', '2', '3', '4'].includes(shortcut.key);
}

