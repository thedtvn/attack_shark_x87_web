import { createTransport, isConfigDevice, HID_FILTERS, type Transport } from './transport';
import { decodeMacroBank, encodeMacroBank, type MacroDefinition } from './macros';
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
  private reads = new Map<string, Promise<Uint8Array>>();
  private read(block: Parameters<Transport['read']>[0], sub: number, len: number): Promise<Uint8Array> {
    const key = `${block}:${sub}:${len}`;
    const existing = this.reads.get(key);
    if (existing) return existing.then((b) => b.slice());
    const pending = this.t.read(block, sub, len);
    this.reads.set(key, pending);
    void pending.finally(() => this.reads.delete(key)).catch(() => undefined);
    return pending.then((b) => b.slice());
  }
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

  private static opening: Promise<X87 | null> | null = null;
  private static handles = new WeakMap<HIDDevice, X87>();
  private static async open(devices: HIDDevice[]): Promise<X87 | null> {
    // Deduplicate StrictMode reconnect effects and simultaneous requests.
    if (this.opening) return this.opening;
    const attempt = async () => {
      const sorted = devices.filter(isConfigDevice).sort((a, b) => Number(b.vendorId === 0x258a) - Number(a.vendorId === 0x258a));
      let lastError: unknown;
      for (const d of sorted) {
        let t: Transport | undefined;
        try {
          const existing = this.handles.get(d);
          if (existing && d.opened) return existing;
          if (!d.opened) await d.open();
          t = createTransport(d);
          const kb = new X87(t);
          // Receiver presence alone is not proof the keyboard is online.
          await kb.ledConfig();
          this.handles.set(d, kb);
          return kb;
        } catch (e) {
          lastError = e;
          t?.dispose();
          if (d.opened) await d.close().catch(() => undefined);
        }
      }
      if (lastError) throw lastError;
      return null;
    };
    this.opening = attempt();
    try { return await this.opening; }
    finally { this.opening = null; }
  }

  async close() {
    X87.handles.delete(this.t.device);
    this.t.dispose();
    if (this.t.device.opened) await this.t.device.close();
  }

  async ledConfig() {
    const cfg = new LedConfig(await this.read('ledConfig', 0, LED_CONFIG_LEN));
    if (!cfg.valid || LedConfig.slot(cfg.effectId) < 0) {
      throw new Error('Invalid settings block received; refusing to display or overwrite it. Reconnect and close other keyboard apps.');
    }
    const settings = cfg.settings(cfg.effectId);
    if (settings.brightness > 4 || settings.speed > 4 || settings.color > 7) {
      throw new Error('Keyboard returned out-of-range lighting settings. Reload settings in the vendor app before writing.');
    }
    return cfg;
  }

  setLedConfig(c: LedConfig) {
    if (!c.valid) return Promise.reject(new Error('Refusing to write an invalid settings block'));
    c.settings(c.effectId);
    return this.t.write('ledConfig', 0, c.bytes);
  }

  /** Read after write; do not treat a successful USB send as proof of settings. */
  async setLedConfigVerified(c: LedConfig): Promise<LedConfig> {
    await this.setLedConfig(c);
    const actual = await this.ledConfig();
    const wanted = c.settings(c.effectId);
    const got = actual.settings(actual.effectId);
    if (actual.effectId !== c.effectId || got.brightness !== wanted.brightness || got.speed !== wanted.speed || got.color !== wanted.color) {
      throw new Error(`Lighting read-back differs from the requested settings (device effect ${actual.effectId}, brightness ${got.brightness}, speed ${got.speed}, colour ${got.color}). Reload lighting before retrying.`);
    }
    return actual;
  }

  async rgbTable() {
    return new RgbTable(await this.read('rgbTable', 0, RGB_TABLE_LEN));
  }

  setRgbTable(t: RgbTable) {
    return this.t.write('rgbTable', 0, t.bytes);
  }

  async perKeyColors(group = 0) {
    return new PerKeyColors(await this.read('perKeyColors', group, PER_KEY_LEN));
  }

  setPerKeyColors(c: PerKeyColors, group = 0) {
    return this.t.write('perKeyColors', group, c.bytes);
  }

  async keyMatrix(layer: number) {
    if (!Number.isInteger(layer) || layer < 0 || layer >= LAYERS) throw new Error('layer must be 0..3');
    const bytes = await this.read('keyMatrix', layer, MATRIX_LEN * 4);
    if (bytes.length !== MATRIX_LEN * 4) throw new Error('Invalid key matrix length');
    return new KeyMatrix(bytes);
  }

  setKeyMatrix(layer: number, m: KeyMatrix) {
    if (!Number.isInteger(layer) || layer < 0 || layer >= LAYERS) throw new Error('layer must be 0..3');
    if (m.bytes.length !== MATRIX_LEN * 4) throw new Error('Invalid key matrix length');
    return this.t.write('keyMatrix', layer, m.bytes);
  }

  private macroCache: Promise<MacroDefinition[]> | null = null;

  /**
   * Cached bank, read once per connection (prefetched right after connect so
   * opening Macros / Key remap is instant). Failures are not cached.
   */
  macroBank(): Promise<MacroDefinition[]> {
    if (!this.macroCache) {
      const pending = this.readMacroBank();
      this.macroCache = pending;
      pending.catch(() => { if (this.macroCache === pending) this.macroCache = null; });
    }
    return this.macroCache.then((bank) => structuredClone(bank));
  }

  /** Fresh read: always queries the device. */
  async readMacroBank(): Promise<MacroDefinition[]> {
    return decodeMacroBank(await this.t.readMacroBank());
  }

  /**
   * Replace the shared bank, as the vendor app does (G5KB_ApplySetting):
   * encode and write it. Every packet is acknowledged and retried by the
   * transport, so there is no extra read-back. Key bindings are not checked
   * or changed; a key bound to a slot that no longer exists may play nothing
   * or a different macro. `onProgress` receives 0..1. Not atomic.
   */
  async writeMacroBank(macros: MacroDefinition[], onProgress?: (fraction: number) => void): Promise<void> {
    const bytes = encodeMacroBank(macros);
    this.macroCache = null; // Bank may be partially written if this fails.
    await this.t.writeMacroBank(bytes, onProgress && ((d, n) => onProgress(d / n)));
    this.macroCache = Promise.resolve(structuredClone(macros));
  }

  /** Restore factory settings (lighting, key map, options). */
  factoryReset() {
    return this.t.factoryReset();
  }
}
