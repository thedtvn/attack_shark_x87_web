import { createTransport, isConfigDevice, HID_FILTERS, type Battery, type Transport } from './transport';
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

export type { Battery };

export interface KeyboardStatus {
  /** Over 2.4G: linked to the receiver (false while asleep / off). Always true over USB. */
  linked: boolean;
  /** 2.4G only; null over USB or while asleep. */
  battery: Battery | null;
}

const sameBattery = (a: Battery | null, b: Battery | null) =>
  a === b || (!!a && !!b && a.percent === b.percent && a.charging === b.charging);

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

  // ---- link (sleep / wake) and battery --------------------------------------

  private statusState: KeyboardStatus = { linked: true, battery: null };
  private statusListeners = new Set<(s: KeyboardStatus) => void>();
  private statusStarted = false;

  /** Last known link / battery state. */
  get status(): KeyboardStatus {
    return this.statusState;
  }

  private setStatus(patch: Partial<KeyboardStatus>) {
    const next = { ...this.statusState, ...patch };
    // Battery is unknown while asleep.
    if (!next.linked) next.battery = null;
    if (next.linked === this.statusState.linked && sameBattery(next.battery, this.statusState.battery)) return;
    this.statusState = next;
    this.statusListeners.forEach((l) => l(next));
  }

  /**
   * Subscribe to link (2.4G sleep / wake) and battery changes; returns an
   * unsubscribe function. Over USB the keyboard is always linked and has no
   * battery reading (`battery` stays null).
   */
  onStatus(listener: (s: KeyboardStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.statusState);
    if (!this.statusStarted) {
      this.statusStarted = true;
      if (this.t.kind === 'wireless') {
        this.t.onStatus = (r) => {
          if (r.kind === 'link') {
            this.setStatus({ linked: r.linked });
            // Battery is pushed after wake; ask anyway in case it is not.
            if (r.linked) void this.battery().catch(() => undefined);
          } else this.setStatus({ linked: true, battery: r.battery });
        };
        void this.refreshStatus();
      }
    }
    return () => this.statusListeners.delete(listener);
  }

  /** Query link and battery now (2.4G); no-op over USB. */
  async refreshStatus(): Promise<KeyboardStatus> {
    if (this.t.kind === 'wireless') {
      try {
        const linked = (await this.t.linkStatus?.()) ?? true;
        this.setStatus({ linked });
        if (linked) await this.battery();
      } catch {
        // Keep the last state; the receiver pushes changes anyway.
      }
    }
    return this.statusState;
  }

  /**
   * Battery level over 2.4G. `null` means the keyboard is connected by USB
   * cable (no battery reading there) or is asleep / off.
   */
  async battery(): Promise<Battery | null> {
    if (this.t.kind !== 'wireless' || !this.t.battery) return null;
    const b = await this.t.battery();
    this.setStatus(b ? { linked: true, battery: b } : { linked: false });
    return b;
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
          // Receiver plugged in but keyboard asleep: open anyway; the UI shows
          // the asleep state and reads wait until it wakes.
          if (t.kind === 'wireless' && t.linkStatus && !(await t.linkStatus())) {
            kb.statusState = { linked: false, battery: null };
            this.handles.set(d, kb);
            return kb;
          }
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
    this.statusListeners.clear();
    if (this.t.onStatus !== undefined) this.t.onStatus = null;
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

  // ---- macros: get / save / clear ------------------------------------------

  /**
   * Get the macro bank. Read once per connection and cached (prefetched after
   * connect so Macros / Key remap open instantly); failures are not cached.
   */
  getMacros(): Promise<MacroDefinition[]> {
    if (!this.macroCache) {
      const pending = this.t.readMacroBank().then(decodeMacroBank);
      this.macroCache = pending;
      pending.catch(() => { if (this.macroCache === pending) this.macroCache = null; });
    }
    return this.macroCache.then((bank) => structuredClone(bank));
  }

  /**
   * Save the whole shared bank, as the vendor app does (G5KB_ApplySetting):
   * one write. Every packet is acknowledged and retried by the transport, so
   * there is no read-back. Key bindings are not checked or changed; a key
   * bound to a slot that no longer exists plays nothing or a different macro.
   * `onProgress` (optional) receives 0..1. Not atomic.
   */
  async saveMacros(macros: MacroDefinition[], onProgress?: (fraction: number) => void): Promise<void> {
    const bytes = encodeMacroBank(macros);
    this.macroCache = null; // Bank may be partially written if this fails.
    await this.t.writeMacroBank(bytes, onProgress && ((d, n) => onProgress(d / n)));
    this.macroCache = Promise.resolve(structuredClone(macros));
  }

  /** Clear the bank (save an empty one). */
  clearMacros(onProgress?: (fraction: number) => void): Promise<void> {
    return this.saveMacros([], onProgress);
  }

  /** Restore factory settings (lighting, key map, options). */
  factoryReset() {
    return this.t.factoryReset();
  }
}
