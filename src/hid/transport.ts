// Two transports, reverse engineered from OemDrv.exe:
//  - USB cable  (CDevG5KB): 0x208-byte feature reports, report id 6, usage page 0xFF00.
//  - 2.4G dongle (CDev3632): 20-byte input/output reports, report id 0x13, usage page 0xFF02.

export const VID_WIRED = 0x258a;
export const PID_WIRED = 0x010c;
export const VID_WIRELESS = 0x3554;
export const PID_WIRELESS = 0xfa09;

export const HID_FILTERS: HIDDeviceFilter[] = [
  { vendorId: VID_WIRED, productId: PID_WIRED, usagePage: 0xff00, usage: 0x0001 },
  { vendorId: VID_WIRELESS, productId: PID_WIRELESS, usagePage: 0xff02, usage: 0x0002 },
];

export type Block = 'keyMatrix' | 'ledConfig' | 'perKeyColors' | 'rgbTable';

export interface Transport {
  readonly kind: 'wired' | 'wireless';
  readonly device: HIDDevice;
  read(block: Block, sub: number, len: number): Promise<Uint8Array>;
  write(block: Block, sub: number, data: Uint8Array): Promise<void>;
  /** Factory reset (USB cmd 0x11, 2.4G cmd 0x06; not acknowledged). */
  factoryReset(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hasCollection(d: HIDDevice, page: number, usage: number) {
  return d.collections.some((c) => c.usagePage === page && c.usage === usage);
}

export function createTransport(d: HIDDevice): Transport {
  if (d.vendorId === VID_WIRED && hasCollection(d, 0xff00, 1)) return new WiredTransport(d);
  if (d.vendorId === VID_WIRELESS && hasCollection(d, 0xff02, 2)) return new WirelessTransport(d);
  throw new Error('Selected HID interface is not an X87 configuration interface');
}

// ---------------------------------------------------------------- USB cable

const WIRED_CMD: Record<Block, number> = {
  keyMatrix: 0x03,
  ledConfig: 0x04,
  perKeyColors: 0x06,
  rgbTable: 0x0a,
};

const REPORT_ID = 0x06;
const FEATURE_DATA_LEN = 0x207; // 0x208 minus the report id
const CHUNK = 0x200;

class WiredTransport implements Transport {
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

  async write(block: Block, sub: number, data: Uint8Array) {
    const cmd = WIRED_CMD[block];
    const total = Math.ceil(data.length / CHUNK);
    for (let i = 0; i < total; i++) {
      const chunk = data.subarray(i * CHUNK, (i + 1) * CHUNK);
      await sleep(20);
      await this.sendFeature(this.packet(cmd, sub, total, i, chunk.length, chunk));
    }
  }

  async factoryReset() {
    await sleep(20);
    await this.sendFeature(this.packet(0x11, 0, 1, 0, 1, Uint8Array.of(0)));
  }

  async read(block: Block, sub: number, len: number) {
    const cmd = WIRED_CMD[block] | 0x80;
    const total = Math.ceil(len / CHUNK);
    const out = new Uint8Array(len);
    for (let i = 0; i < total; i++) {
      const size = Math.min(CHUNK, len - i * CHUNK);
      await sleep(20);
      await this.sendFeature(this.packet(cmd, sub, total, i, size));
      await sleep(20);
      const view = await this.device.receiveFeatureReport(REPORT_ID);
      // Some platforms include the report id as byte 0.
      const off = view.byteLength >= 0x208 ? 8 : 7;
      out.set(new Uint8Array(view.buffer, view.byteOffset + off, size), i * CHUNK);
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

class WirelessTransport implements Transport {
  readonly kind = 'wireless' as const;
  private queue: Uint8Array[] = [];
  private waiters: ((p: Uint8Array) => void)[] = [];
  private busy: Promise<unknown> = Promise.resolve();

  readonly device: HIDDevice;
  constructor(device: HIDDevice) {
    this.device = device;
    device.addEventListener('inputreport', (e) => {
      if (e.reportId !== W_REPORT_ID) return;
      // Re-add report id so offsets match the documented layout.
      const p = new Uint8Array(20);
      p[0] = e.reportId;
      p.set(new Uint8Array(e.data.buffer, e.data.byteOffset, Math.min(19, e.data.byteLength)), 1);
      const w = this.waiters.shift();
      if (w) w(p);
      else this.queue.push(p);
    });
  }

  private next(timeout = 2000): Promise<Uint8Array | null> {
    const q = this.queue.shift();
    if (q) return Promise.resolve(q);
    return new Promise((resolve) => {
      const w = (p: Uint8Array) => {
        clearTimeout(t);
        resolve(p);
      };
      const t = setTimeout(() => {
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
    const run = this.busy.then(fn, fn);
    this.busy = run.catch(() => undefined);
    return run;
  }

  write(block: Block, sub: number, data: Uint8Array) {
    return this.exclusive(async () => {
      const cmd = WIRELESS_CMD[block][0];
      const total = Math.ceil(data.length / W_DATA);
      this.queue = [];
      for (let i = 0; i < total; i++) {
        const pkt = wirelessPacket(cmd, total, i, sub, data.subarray(i * W_DATA, (i + 1) * W_DATA));
        for (let attempt = 0; ; attempt++) {
          await sleep(15);
          await this.send(pkt);
          const res = await this.waitAck(cmd, i);
          if (res === 'ok') break;
          if (attempt >= 5) throw new Error(`2.4G write ${res} (cmd 0x${cmd.toString(16)}, packet ${i})`);
        }
      }
    });
  }

  private async waitAck(cmd: number, index: number): Promise<'ok' | 'timeout' | 'checksum'> {
    for (let n = 0; n < 20; n++) {
      const r = await this.next();
      if (!r) return 'timeout';
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
    return this.exclusive(async () => {
      const cmd = WIRELESS_CMD[block][1];
      for (let attempt = 0; attempt < 5; attempt++) {
        this.queue = [];
        await this.send(wirelessPacket(cmd, 1, 0, sub));
        const out = new Uint8Array(len);
        const seen = new Set<number>();
        let ok = false;
        for (;;) {
          const r = await this.next();
          if (!r) break;
          if (r[0] === 0xff) throw new Error('2.4G: device reported failure');
          if (r[1] !== cmd) continue;
          if (r[2] & 0x80) break;
          const total = r[2] & 0x7f;
          const index = r[3];
          if (!seen.has(index)) {
            seen.add(index);
            const off = index * W_DATA;
            const n = Math.min(r[4] & 0x0f, W_DATA, Math.max(0, len - off));
            if (n > 0) out.set(r.subarray(5, 5 + n), off);
          }
          if (index + 1 >= total) {
            ok = seen.size >= total;
            break;
          }
        }
        if (ok) return out;
        await sleep(100);
      }
      throw new Error('2.4G read timed out (is the keyboard awake?)');
    });
  }
}
