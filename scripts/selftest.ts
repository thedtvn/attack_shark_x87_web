// Runs the browser driver code against the real keyboard from Node by
// wrapping node-hid in a minimal WebHID HIDDevice shim. Read-only by default;
// pass --write-back to explicitly write the unchanged LED config.
//   npx tsx scripts/selftest.ts
import HID from 'node-hid';
import { createTransport } from '../src/hid/transport';
import { LED_CONFIG_LEN, LedConfig, MATRIX_LEN, KeyMatrix, EFFECTS } from '../src/hid/protocol';
import { KEYS } from '../src/hid/layout';

const devices = HID.devices();
// Windows exposes three FF00:1 collections; only Col06 carries report 6.
// On other platforms use the descriptor-driven browser selection instead.
const info = devices.find((d) => d.vendorId === 0x258a && d.productId === 0x010c &&
    d.usagePage === 0xff00 && d.usage === 1 && /col06/i.test(d.path ?? '')) ??
  devices.find((d) => d.vendorId === 0x3554 && d.productId === 0xfa09 &&
    d.usagePage === 0xff02 && d.usage === 2);
if (!info?.path) throw new Error('X87 not found');
const dev = new HID.HID(info.path);

const listeners: ((e: { reportId: number; data: DataView }) => void)[] = [];
dev.on('data', (buf: Buffer) => {
  const data = new DataView(buf.buffer, buf.byteOffset + 1, buf.length - 1);
  for (const l of listeners) l({ reportId: buf[0], data });
});

const shim = {
  vendorId: info.vendorId,
  productId: info.productId,
  productName: info.product ?? '',
  opened: true,
  // Descriptor shim only: prefer an actual browser descriptor for interface
  // selection. The Node probe must target the correct collection explicitly.
  collections: [{ usagePage: info.usagePage, usage: info.usage,
    featureReports: [{ reportId: 6, items: [{ reportSize: 8, reportCount: 519 }] }],
    outputReports: [{ reportId: 0x13, items: [{ reportSize: 8, reportCount: 19 }] }],
  }],
  addEventListener: (_: string, l: (e: { reportId: number; data: DataView }) => void) => listeners.push(l),
  async sendReport(id: number, data: Uint8Array) {
    dev.write([id, ...data]);
  },
  async sendFeatureReport(id: number, data: Uint8Array) {
    dev.sendFeatureReport([id, ...data]);
  },
  async receiveFeatureReport(id: number) {
    const b = Buffer.from(dev.getFeatureReport(id, 0x208));
    return new DataView(b.buffer, b.byteOffset, b.length);
  },
} as unknown as HIDDevice;

const t = createTransport(shim);
console.log('transport:', t.kind);

const cfg = new LedConfig(await t.read('ledConfig', 0, LED_CONFIG_LEN));
const eff = EFFECTS.find((e) => e.id === cfg.effectId);
console.log('led valid:', cfg.valid, 'effect:', eff?.name, cfg.settings(cfg.effectId));

const m = new KeyMatrix(await t.read('keyMatrix', 0, MATRIX_LEN * 4));
console.log(
  'layer 1:',
  KEYS.slice(0, 6)
    .map((k) => `${k.name}=${JSON.stringify(m.get(k.index))}`)
    .join(' '),
);

if (!cfg.valid) throw new Error('Invalid configuration; no writes attempted');
if (process.argv.includes('--write-back')) {
  await t.write('ledConfig', 0, cfg.bytes);
  const again = new LedConfig(await t.read('ledConfig', 0, LED_CONFIG_LEN));
  console.log('write-back unchanged:', again.bytes.every((v, i) => v === cfg.bytes[i]));
}
t.dispose();
dev.close();
