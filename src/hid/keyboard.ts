import { createTransport, HID_FILTERS, type Transport } from './transport';
import {
  KeyMatrix,
  LAYERS,
  LED_CONFIG_LEN,
  LedConfig,
  MATRIX_LEN,
  PER_KEY_LEN,
  PerKeyColors,
  RGB_TABLE_LEN,
  RgbTable,
} from './protocol';

export const webHidSupported = typeof navigator !== 'undefined' && 'hid' in navigator;

/** High level API, mirrors the Rust `Keyboard`. */
export class X87 {
  private t: Transport;
  private constructor(t: Transport) {
    this.t = t;
  }

  get connection() {
    return this.t.kind;
  }

  get device() {
    return this.t.device;
  }

  /** Firmware as shown by the vendor app (bcdDevice is not exposed by WebHID). */
  get productName() {
    return this.t.device.productName;
  }

  /** Ask the user to pick the keyboard (needs a user gesture). */
  static async request(): Promise<X87 | null> {
    const devices = await navigator.hid.requestDevice({ filters: HID_FILTERS });
    return devices.length ? X87.open(devices) : null;
  }

  /** Re-open a previously granted keyboard without a prompt. */
  static async reconnect(): Promise<X87 | null> {
    const devices = await navigator.hid.getDevices();
    return devices.length ? X87.open(devices) : null;
  }

  private static async open(devices: HIDDevice[]): Promise<X87 | null> {
    // Prefer the USB cable over the dongle, as the Rust lib does.
    const sorted = [...devices].sort((a, b) => Number(b.vendorId === 0x258a) - Number(a.vendorId === 0x258a));
    for (const d of sorted) {
      let t: Transport;
      try {
        t = createTransport(d);
      } catch {
        continue;
      }
      if (!d.opened) await d.open();
      return new X87(t);
    }
    return null;
  }

  async close() {
    if (this.t.device.opened) await this.t.device.close();
  }

  async ledConfig() {
    return new LedConfig(await this.t.read('ledConfig', 0, LED_CONFIG_LEN));
  }

  setLedConfig(c: LedConfig) {
    return this.t.write('ledConfig', 0, c.bytes);
  }

  async rgbTable() {
    return new RgbTable(await this.t.read('rgbTable', 0, RGB_TABLE_LEN));
  }

  setRgbTable(t: RgbTable) {
    return this.t.write('rgbTable', 0, t.bytes);
  }

  async perKeyColors(group = 0) {
    return new PerKeyColors(await this.t.read('perKeyColors', group, PER_KEY_LEN));
  }

  setPerKeyColors(c: PerKeyColors, group = 0) {
    return this.t.write('perKeyColors', group, c.bytes);
  }

  async keyMatrix(layer: number) {
    if (layer < 0 || layer >= LAYERS) throw new Error('layer must be 0..3');
    return new KeyMatrix(await this.t.read('keyMatrix', layer, MATRIX_LEN * 4));
  }

  setKeyMatrix(layer: number, m: KeyMatrix) {
    return this.t.write('keyMatrix', layer, m.bytes);
  }

  /** Restore factory settings (lighting, key map, options). */
  factoryReset() {
    return this.t.factoryReset();
  }
}
