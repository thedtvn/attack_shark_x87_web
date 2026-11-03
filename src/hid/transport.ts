// Two transports, reverse engineered from OemDrv.exe:
//  - USB cable  (CDevG5KB): 0x208-byte feature reports, report id 6, usage page 0xFF00.
//  - 2.4G dongle (CDev3632): 20-byte input/output reports, report id 0x13, usage page 0xFF02.
import { preciseTimeout, sleep } from './timer';

export const VID_WIRED = 0x258a;
export const PID_WIRED = 0x010c;
export const VID_WIRELESS = 0x3554;
export const PID_WIRELESS = 0xfa09;

export const HID_FILTERS: HIDDeviceFilter[] = [
  { vendorId: VID_WIRED, productId: PID_WIRED, usagePage: 0xff00, usage: 0x0001 },
  { vendorId: VID_WIRELESS, productId: PID_WIRELESS, usagePage: 0xff02, usage: 0x0002 },
];

export type Progress = (done: number, total: number) => void;

export type Block = 'keyMatrix' | 'ledConfig' | 'perKeyColors' | 'rgbTable' | 'macro';

export interface Transport {
  readonly kind: 'wired' | 'wireless';
  readonly device: HIDDevice;
  read(block: Block, sub: number, len: number): Promise<Uint8Array>;
  write(block: Block, sub: number, data: Uint8Array): Promise<void>;
  /** Factory reset (USB cmd 0x11, 2.4G cmd 0x06; not acknowledged). */
  factoryReset(): Promise<void>;
  /** `onProgress(done, total)` counts packets (2.4G) or chunks (USB) written. */
  writeMacroBank(data: Uint8Array, onProgress?: Progress): Promise<void>;
  /** Full 4096-byte bank read; `onProgress(done, total)` counts pages/chunks. */
  readMacroBank(onProgress?: Progress): Promise<Uint8Array>;
  dispose(): void;
}


function collections(cs: readonly HIDCollectionInfo[]): HIDCollectionInfo[] {
  return cs.flatMap((c) => [c, ...collections(c.children ?? [])]);
}

export function isConfigDevice(d: HIDDevice): boolean {
  const cs = collections(d.collections);
  if (d.vendorId === VID_WIRED && d.productId === PID_WIRED) {
    return cs.some((c) => c.usagePage === 0xff00 && c.usage === 1 &&
      c.featureReports?.some((r) => r.reportId === 6 &&
        (r.items ?? []).reduce((n, item) => n + (item.reportSize ?? 0) * (item.reportCount ?? 0), 0) === 519 * 8));
  }
  return d.vendorId === VID_WIRELESS && d.productId === PID_WIRELESS &&
    cs.some((c) => c.usagePage === 0xff02 && c.usage === 2 &&
      c.outputReports?.some((r) => r.reportId === 0x13));
}

export function parseWiredReply(view: DataView, cmd: number, sub: number, total: number, index: number, size: number): Uint8Array {
  // Chromium returns numbered feature reports WITH their ID, even if the
  // device returns only 136 bytes rather than the descriptor's maximum 520.
  if (view.byteLength < 8 + size || view.getUint8(0) !== 6 ||
      view.getUint8(1) !== cmd || view.getUint8(2) !== sub ||
      view.getUint8(3) !== 0 || view.getUint8(4) !== total ||
      view.getUint8(5) !== index || view.getUint16(6, true) !== size) {
    throw new Error('Invalid USB configuration reply. Reconnect the keyboard and close the vendor app.');
  }
  return new Uint8Array(view.buffer, view.byteOffset + 8, size).slice();
}

export function createTransport(d: HIDDevice): Transport {
  if (isConfigDevice(d) && d.vendorId === VID_WIRED) return new WiredTransport(d);
  if (isConfigDevice(d) && d.vendorId === VID_WIRELESS) return new WirelessTransport(d);
  throw new Error('Selected HID interface is not an X87 configuration interface');
}

// ---------------------------------------------------------------- USB cable

const WIRED_CMD: Record<Block, number> = {
  keyMatrix: 0x03,
  ledConfig: 0x04,
  perKeyColors: 0x06,
  rgbTable: 0x0a,
  macro: 0x05,
};

const REPORT_ID = 0x06;
const FEATURE_DATA_LEN = 0x207; // 0x208 minus the report id
const CHUNK = 0x200;

class WiredTransport implements Transport {
  private busy: Promise<unknown> = Promise.resolve();
  private closed = false;
  dispose() { this.closed = true; }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.busy.then(() => {
      if (this.closed) throw new Error('Keyboard disconnected');
      return fn();
    });
    this.busy = run.catch(() => undefined);
    return run;
  }
  readonly kind = 'wired' as const;
  readonly device: HIDDevice;
  constructor(device: HIDDevice) {
    this.device = device;
  }

  private packet(cmd: number, sub: number, total: number, index: number, len: number, data?: Uint8Array) {
    // Layout after the report id: cmd, sub, 0, total, index, lenLo, lenHi, data[512]
    const p = new Uint8Array(FEATURE_DATA_LEN);
    p[0] = cmd;
    p[1] = sub;
    p[2] = 0;
    p[3] = total;
    p[4] = index;
    p[5] = len & 0xff;
    p[6] = len >> 8;
    if (data) p.set(data.subarray(0, CHUNK), 7);
    return p;
  }

  private async sendFeature(p: Uint8Array<ArrayBuffer>) {
    let err: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        await this.device.sendFeatureReport(REPORT_ID, p);
        return;
      } catch (e) {
        err = e;
        await sleep(70);
      }
    }
    throw err;
  }

  write(block: Block, sub: number, data: Uint8Array) {
    if (block === 'macro') return this.writeMacroBank(data);
    return this.exclusive(() => this.writeData(block, sub, data));
  }

  writeMacroBank(data: Uint8Array, onProgress?: Progress) {
    if (data.length !== 4096) return Promise.reject(new Error('Macro bank must be 4096 bytes'));
    return this.exclusive(() => this.writeData('macro', 0, data, onProgress));
  }

  readMacroBank(onProgress?: Progress) {
    return this.exclusive(() => this.readData('macro', 0, 4096, onProgress));
  }

  private async writeData(block: Block, sub: number, data: Uint8Array, onProgress?: Progress) {
    const cmd = WIRED_CMD[block];
    const total = Math.ceil(data.length / CHUNK);
    for (let i = 0; i < total; i++) {
      const chunk = data.subarray(i * CHUNK, (i + 1) * CHUNK);
      await sleep(20);
      await this.sendFeature(this.packet(cmd, sub, total, i, chunk.length, chunk));
      onProgress?.(i + 1, total);
    }
  }

  factoryReset() {
    return this.exclusive(async () => {
      await sleep(20);
      await this.sendFeature(this.packet(0x11, 0, 1, 0, 1, Uint8Array.of(0)));
    });
  }

  read(block: Block, sub: number, len: number) {
    return this.exclusive(() => this.readData(block, sub, len));
  }

  private async readData(block: Block, sub: number, len: number, onProgress?: Progress) {
    const cmd = WIRED_CMD[block] | 0x80;
    const total = Math.ceil(len / CHUNK);
    const out = new Uint8Array(len);
    for (let i = 0; i < total; i++) {
      const size = Math.min(CHUNK, len - i * CHUNK);
      await sleep(20);
      await this.sendFeature(this.packet(cmd, sub, total, i, size));
      await sleep(20);
      const view = await this.device.receiveFeatureReport(REPORT_ID);
      out.set(parseWiredReply(view, cmd, sub, total, i, size), i * CHUNK);
      onProgress?.(i + 1, total);
    }
    return out;
  }
}

// --------------------------------------------------------------- 2.4G dongle

const WIRELESS_CMD: Record<Block, [set: number, get: number]> = {
  keyMatrix: [0x01, 0x41],
  perKeyColors: [0x02, 0x42],
  ledConfig: [0x04, 0x44],
  rgbTable: [0x09, 0x49],
  macro: [0x03, 0x43],
};

const W_REPORT_ID = 0x13;
const W_DATA = 14;

/** Full 20-byte packet incl. report id; checksum = sum of bytes 0..18. */
function wirelessPacket(cmd: number, total: number, index: number, sub: number, data?: Uint8Array): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(20);
  const n = data ? Math.min(data.length, W_DATA) : 0;
  p[0] = W_REPORT_ID;
  p[1] = cmd;
  p[2] = total;
  p[3] = index;
  p[4] = (sub << 4) | n;
  if (data) p.set(data.subarray(0, n), 5);
  let s = 0;
  for (let i = 0; i < 19; i++) s += p[i];
  p[19] = s & 0xff;
  return p;
}

/** Strict stream assembly accepts observed physical lengths, never missing packets. */
export class WirelessReadStream {
  private parts = new Map<number, Uint8Array>();
  private total: number | null = null;
  private cmd: number;
  private sub: number;
  private len: number;
  private minimum: number;
  constructor(cmd: number, sub: number, len: number, minimum: number) {
    this.cmd = cmd; this.sub = sub; this.len = len; this.minimum = minimum;
  }
  push(r: Uint8Array): Uint8Array | null {
    if (r.length !== 20) throw new Error('Truncated 2.4G configuration reply');
    if (r[0] === 0xff) throw new Error('2.4G: device reported failure');
    if (r[0] !== W_REPORT_ID || r[1] !== this.cmd) return null;
    if (r[2] & 0x80) throw new Error('Receiver reported checksum error');
    // Page/layer tag is essential: stale replies must not become another page.
    if ((r[4] >>> 4) !== this.sub) return null;
    const total = r[2];
    const index = r[3];
    const size = r[4] & 15;
    if (!total || total > Math.ceil(this.len / W_DATA) || index >= total || size < 1 || size > W_DATA ||
        (index < total - 1 && size !== W_DATA) || index * W_DATA + size > this.len) {
      throw new Error('Invalid 2.4G configuration reply length or packet index');
    }
    if (this.total !== null && total !== this.total) throw new Error('Inconsistent 2.4G packet count');
    this.total = total;
    const data = r.slice(5, 5 + size);
    const old = this.parts.get(index);
    if (old && (old.length !== data.length || old.some((b, i) => b !== data[i]))) throw new Error('Conflicting duplicate 2.4G packet');
    this.parts.set(index, data);
    if (this.parts.size !== total) return null;
    const last = this.parts.get(total - 1)!;
    const actualLen = (total - 1) * W_DATA + last.length;
    if (actualLen < this.minimum) throw new Error('2.4G stream is shorter than the meaningful block');
    const out = new Uint8Array(this.len);
    for (const [i, bytes] of this.parts) out.set(bytes, i * W_DATA);
    return out;
  }
}

class WirelessTransport implements Transport {
  readonly kind = 'wireless' as const;
  private queue: Uint8Array[] = [];
  private waiters: ((p: Uint8Array) => void)[] = [];
  private busy: Promise<unknown> = Promise.resolve();

  private closed = false;
  private onInput = (e: HIDInputReportEvent) => {
    if (e.reportId !== W_REPORT_ID || this.closed) return;
    // Preserve actual length: zero-padding a truncated report hides errors.
    const p = new Uint8Array(e.data.byteLength + 1);
    p[0] = e.reportId;
    p.set(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength), 1);
    const w = this.waiters.shift();
    if (w) w(p);
    else if (this.queue.length < 256) this.queue.push(p);
  };
  dispose() {
    this.closed = true;
    this.device.removeEventListener('inputreport', this.onInput);
    this.waiters.splice(0).forEach((w) => w(new Uint8Array()));
    this.queue = [];
  }
  readonly device: HIDDevice;
  constructor(device: HIDDevice) {
    this.device = device;
    device.addEventListener('inputreport', this.onInput);
  }

  private next(timeout = 2000): Promise<Uint8Array | null> {
    const q = this.queue.shift();
    if (q) return Promise.resolve(q);
    return new Promise((resolve) => {
      const w = (p: Uint8Array) => {
        cancel();
        resolve(p);
      };
      const cancel = preciseTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        resolve(null);
      }, timeout);
      this.waiters.push(w);
    });
  }

  private send(p: Uint8Array<ArrayBuffer>) {
    return this.device.sendReport(W_REPORT_ID, p.slice(1));
  }

  /** Serialise transactions: replies are matched by command only. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.busy.then(() => {
      if (this.closed) throw new Error('Keyboard disconnected');
      return fn();
    });
    this.busy = run.catch(() => undefined);
    return run;
  }

  write(block: Block, sub: number, data: Uint8Array) {
    if (block === 'macro') return this.writeMacroBank(data);
    return this.exclusive(() => this.writeData(WIRELESS_CMD[block][0], sub, data));
  }

  private async writeData(cmd: number, sub: number, data: Uint8Array, onPacket?: () => void) {
    const total = Math.ceil(data.length / W_DATA);
    if (!total || total > 127) throw new Error('Invalid wireless transaction size');
    this.queue = [];
    for (let i = 0; i < total; i++) {
      const pkt = wirelessPacket(cmd, total, i, sub, data.subarray(i * W_DATA, (i + 1) * W_DATA));
      for (let attempt = 0; ; attempt++) {
        if (this.closed) throw new Error('Keyboard disconnected');
        await sleep(15);
        await this.send(pkt);
        const res = await this.waitAck(cmd, i);
        if (res === 'ok') break;
        if (attempt >= 5) throw new Error(`2.4G write ${res} (cmd 0x${cmd.toString(16)}, packet ${i}). Upload may be partial.`);
      }
      onPacket?.();
    }
  }

  writeMacroBank(data: Uint8Array, onProgress?: Progress) {
    if (data.length !== 4096) return Promise.reject(new Error('Macro bank must be 4096 bytes'));
    return this.exclusive(async () => {
      const perPage = Math.ceil(512 / W_DATA);
      const total = perPage * 8;
      let done = 0;
      for (let page = 0; page < 8; page++) {
        await this.writeData(0x03, page, data.subarray(page * 512, (page + 1) * 512), () => onProgress?.(++done, total));
        await sleep(100);
      }
    });
  }

  readMacroBank(onProgress?: Progress) {
    return this.exclusive(async () => {
      const bank = new Uint8Array(4096);
      for (let page = 0; page < 8; page++) {
        bank.set(await this.readData(0x43, page, 512, 512), page * 512);
        onProgress?.(page + 1, 8);
      }
      return bank;
    });
  }

  private async waitAck(cmd: number, index: number): Promise<'ok' | 'timeout' | 'checksum'> {
    for (let n = 0; n < 20; n++) {
      const r = await this.next();
      if (!r) return 'timeout';
      if (r.length !== 20) throw new Error('Truncated 2.4G acknowledgement');
      if (r[0] === 0xff) throw new Error('2.4G: device reported failure');
      if (r[2] & 0x80) return 'checksum';
      if (r[1] !== cmd) continue;
      if (r[3] !== index) throw new Error(`2.4G: ack index ${r[3]} != ${index}`);
      return 'ok';
    }
    return 'timeout';
  }

  factoryReset() {
    return this.exclusive(async () => {
      await sleep(15);
      await this.send(wirelessPacket(0x06, 1, 0, 0, Uint8Array.of(0)));
    });
  }

  read(block: Block, sub: number, len: number) {
    if (block === 'macro') {
      if (len !== 4096 || sub !== 0) return Promise.reject(new Error('Macro reads require the full 4096-byte bank'));
      return this.readMacroBank();
    }
    return this.exclusive(async () => {
      const cmd = WIRELESS_CMD[block][1];
      // Receiver streams only the physical matrix/planes and part of the
      // RGB block, not the USB allocation size. Only unused tail is padded.
      const minimum = block === 'keyMatrix' ? 126 * 4 : block === 'perKeyColors' ? 126 * 3 : block === 'rgbTable' ? 20 * 21 : len;
      return this.readData(cmd, sub, len, minimum);
    });
  }

  private async readData(cmd: number, sub: number, len: number, minimum: number): Promise<Uint8Array> {
    let failure = 'incomplete stream';
    // Measured: a 37-packet page streams in ~160 ms; first packet within ~80 ms.
    // The receiver cannot pipeline (a new request aborts the previous one), so
    // reads are sequential. Drops are common: keep identical packets across
    // retries of the same request and re-request quickly after a short idle gap.
    let stream = new WirelessReadStream(cmd, sub, len, minimum);
    for (let attempt = 0; attempt < 8; attempt++) {
      if (this.closed) throw new Error('Keyboard disconnected');
      this.queue = [];
      await this.send(wirelessPacket(cmd, 1, 0, sub));
      let first = true;
      for (let received = 0; received < 512; received++) {
        const r = await this.next(first ? 700 : 120);
        if (!r) break;
        try {
          const result = stream.push(r);
          if (r[1] === cmd) first = false;
          if (result) return result;
        } catch (e) {
          failure = e instanceof Error ? e.message : String(e);
          // Conflicting/inconsistent data: discard everything and start over.
          stream = new WirelessReadStream(cmd, sub, len, minimum);
          break;
        }
      }
      await sleep(20);
    }
    throw new Error(`2.4G read failed (cmd 0x${cmd.toString(16)}, page ${sub}): ${failure}. Wake the keyboard and close other keyboard apps.`);
  }
}
